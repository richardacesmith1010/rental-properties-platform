# Sprint 108 — Tenant Announcements

## Objective

Allow owners and managers to send announcements to tenants — either to all tenants across all properties they administer OR to tenants of specific properties. Used for boil water advisories, scheduled pest control, building-wide reminders, etc.

## Context

- Branch: `main`
- HEAD: previous sprint
- Property manager Alia requested: "The option to do announcements would be great. Either to specific properties that you can select or to all tenants at once in the event of things like boil water advisories or scheduled reminders for routine maintenance like pest control."
- The existing notification system (`lib/notifications.ts`) handles per-tenant in-app notifications + email delivery via Resend
- Sprint 108 wraps that system with a broadcast layer: one announcement → fan out to many tenants

## In Scope

1. New `announcements` table — record of sent announcements (audit trail + future re-display)
2. New server action `createAnnouncement` — fans out to tenant notifications
3. New UI — announcement composer (modal) for owners/managers
4. Tenant-side display — announcements appear in existing tenant inbox/notification system (no new tenant UI)
5. Permission: owner/manager can create; only for properties they administer

## Out of Scope

- Scheduled/recurring announcements
- Announcement editing or deletion after sending
- SMS delivery (email + in-app only)
- Tenant reply or threading
- Read receipts beyond existing notification read tracking
- Targeting individual tenants (tenant-level targeting is via existing message system)
- Attachments or rich media in announcements

## Database Migration

### New Table: `announcements`

```sql
CREATE TABLE IF NOT EXISTS announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_profile_id uuid NOT NULL REFERENCES profiles(id),
  scope text NOT NULL CHECK (scope IN ('all_administered', 'specific_properties')),
  property_ids uuid[] DEFAULT NULL,
  title text NOT NULL CHECK (char_length(title) > 0 AND char_length(title) <= 200),
  body text NOT NULL CHECK (char_length(body) > 0 AND char_length(body) <= 5000),
  recipient_count integer NOT NULL DEFAULT 0,
  dedupe_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Enforce: when scope = 'specific_properties', property_ids must be a non-empty array.
  --          when scope = 'all_administered', property_ids must be NULL.
  CONSTRAINT chk_announcement_scope_property_alignment CHECK (
    (scope = 'specific_properties' AND property_ids IS NOT NULL AND array_length(property_ids, 1) > 0)
    OR
    (scope = 'all_administered' AND property_ids IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_announcements_sender_created
  ON announcements (sender_profile_id, created_at DESC);

-- Idempotency: prevent the same announcement from being inserted twice within the dedupe window
CREATE UNIQUE INDEX IF NOT EXISTS uq_announcements_dedupe
  ON announcements (sender_profile_id, dedupe_key);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- Tenants do NOT read this table directly. They receive announcement content via the
-- existing notifications system. Only the sender (owner/manager) can read announcement
-- records — used for showing their own send history. If future requirements need
-- tenant-side access to the announcement record itself, expand this policy explicitly;
-- do NOT silently widen it.
CREATE POLICY announcements_sender_can_read ON announcements
  FOR SELECT
  USING (sender_profile_id = auth.uid());

-- Insert backstop. Note: actual creation goes through the server action with the admin
-- client, which bypasses RLS. App-layer permission checks are the enforcement boundary.
-- This policy exists to prevent accidental misuse via the regular client.
CREATE POLICY announcements_authenticated_can_insert ON announcements
  FOR INSERT
  WITH CHECK (
    sender_profile_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('owner', 'manager')
    )
  );
```

**Migration file name:** `20260413_sprint108_announcements.sql`

### Column Notes

- `scope = 'all_administered'`: send to tenants of every property the sender can administer
- `scope = 'specific_properties'`: send only to tenants of the listed `property_ids`
- `property_ids` is null when scope is `'all_administered'`, populated when scope is `'specific_properties'`
- `recipient_count` records how many tenants received the announcement (for audit trail)
- We do NOT store per-recipient delivery state in this table — that's handled by `notifications` and `notification_deliveries` (existing)

## Exact Files Expected to Change

| File | Change |
|------|--------|
| `supabase/migrations/20260413_sprint108_announcements.sql` | **NEW** |
| `apps/web/app/actions/announcements.ts` | **NEW** — `createAnnouncement` server action |
| `apps/web/components/dashboard/announcement-composer.tsx` | **NEW** — modal/inline composer |
| `apps/web/components/dashboard/sidebar/nav-items.ts` | Add "Send Announcement" quick action OR add button to dashboard |
| `apps/web/app/owner/page.tsx` | Pass `createAnnouncement` action and property list to UI |
| `apps/web/app/manager/page.tsx` | Same — make composer available to managers |

## Implementation Requirements

### 1. Server Action (`app/actions/announcements.ts`)

```typescript
"use server";

import { requireAuth } from "@/lib/auth-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUserAdministerProperty } from "@/lib/property-access";
import { createNotificationWithDelivery } from "@/lib/notifications";

const announcementSchema = z.object({
  scope: z.enum(["all_administered", "specific_properties"]),
  propertyIds: z.array(z.string().uuid()).optional(),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
});

export async function createAnnouncement(
  prevState: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner", "manager");

  if (!await checkRateLimit(`announcement:${user.id}`, 10, 60 * 60 * 1000)) {
    return { error: "Too many announcements. Please wait an hour." };
  }

  const parsed = announcementSchema.safeParse({
    scope: formData.get("scope"),
    propertyIds: formData.getAll("propertyIds"),
    title: formData.get("title"),
    body: formData.get("body"),
  });

  if (!parsed.success) {
    return { error: "Invalid announcement data." };
  }

  const { scope, propertyIds, title, body } = parsed.data;
  const supabase = createAdminClient();

  // Resolve target property IDs into a CANONICAL VERIFIED LIST.
  // Never reuse the raw form input downstream — only `verifiedPropertyIds`.
  const verifiedPropertyIds: string[] = [];

  if (scope === "all_administered") {
    // Must filter for active memberships and non-deleted properties.
    // getAdministeredPropertyIds is responsible for: active=true membership, role check,
    // and excluding soft-deleted properties. See section "Hardening getAdministeredPropertyIds" below.
    const administered = await getAdministeredPropertyIds(user.id);
    verifiedPropertyIds.push(...administered);
  } else {
    if (!propertyIds || propertyIds.length === 0) {
      return { error: "Select at least one property." };
    }
    // Verify caller can administer EACH property. Only push verified ones to the canonical list.
    for (const pid of propertyIds) {
      if (!(await canUserAdministerProperty(user.id, pid))) {
        return { error: "You don't have permission to message all selected properties." };
      }
      verifiedPropertyIds.push(pid);
    }
  }

  if (verifiedPropertyIds.length === 0) {
    return { error: "No properties to send to." };
  }

  // Idempotency: dedupe_key is hash of sender + title + body + sorted verifiedPropertyIds + 5-minute time bucket.
  // If the same content is submitted twice within 5 minutes, the unique index rejects the duplicate.
  const sortedIds = [...verifiedPropertyIds].sort();
  const timeBucket = Math.floor(Date.now() / (5 * 60 * 1000));
  const dedupeInput = `${user.id}|${title}|${body}|${sortedIds.join(",")}|${timeBucket}`;
  const dedupeKey = await hashString(dedupeInput); // SHA-256 hex (or any stable hash helper)

  // Find all active tenants of target properties (use verifiedPropertyIds — never raw input)
  const { data: tenants, error: tenantError } = await supabase
    .from("leases")
    .select("tenant_profile_id, units!inner(property_id)")
    .eq("active", true)
    .in("units.property_id", verifiedPropertyIds);

  if (tenantError) {
    console.error("[announcements] tenant lookup failed:", tenantError);
    return { error: "Failed to look up tenants." };
  }

  // Deduplicate tenant IDs (tenant might have leases in multiple targeted properties)
  const tenantIds = Array.from(new Set(
    (tenants ?? [])
      .map((row) => row.tenant_profile_id)
      .filter((id): id is string => Boolean(id))
  ));

  if (tenantIds.length === 0) {
    return { error: "No active tenants in the selected properties." };
  }

  // Insert announcement record. Unique index on (sender_profile_id, dedupe_key) enforces idempotency.
  const { data: announcement, error: insertError } = await supabase
    .from("announcements")
    .insert({
      sender_profile_id: user.id,
      scope,
      property_ids: scope === "specific_properties" ? verifiedPropertyIds : null,
      title,
      body,
      recipient_count: tenantIds.length,
      dedupe_key: dedupeKey,
    })
    .select("id")
    .single();

  if (insertError) {
    // Unique violation = duplicate within 5-min dedupe window. Treat as no-op success.
    if (insertError.code === "23505") {
      console.log(`[announcements] duplicate suppressed for sender ${user.id} (dedupe_key match)`);
      return { success: "This announcement was already sent." };
    }
    console.error("[announcements] insert failed:", insertError);
    return { error: "Failed to create announcement." };
  }

  // Fan out: create notifications for each tenant
  // Use Promise.allSettled so one failure doesn't block others
  const results = await Promise.allSettled(
    tenantIds.map((tenantId) =>
      createNotificationWithDelivery({
        recipientProfileId: tenantId,
        type: "announcement",
        title,
        body,
        entityType: "announcement",
        entityId: announcement.id,
      })
    )
  );

  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed > 0) {
    console.warn(`[announcements] ${failed}/${tenantIds.length} deliveries failed for announcement ${announcement.id}`);
  }

  revalidatePath("/owner");
  revalidatePath("/manager");

  return {
    success: `Announcement sent to ${tenantIds.length} tenant${tenantIds.length === 1 ? '' : 's'}.`,
  };
}
```

### 1A. Hardening `getAdministeredPropertyIds` (helper used in `all_administered` scope)

Whether this helper already exists or needs to be added, it MUST satisfy these rules:
- Returns property IDs the user is currently authorized to administer
- Includes only properties with `active = true` (or the equivalent "not soft-deleted" flag)
- Includes only memberships where the user's `ownership_account_members.active = true` OR `property_managers.active = true`
- Excludes any membership marked terminated/inactive/revoked
- Document this contract in the function's JSDoc so future refactors don't drop the filters

If the existing helper does not enforce these filters, fix it before this sprint relies on it.

### 1B. Notification Type/Entity Consistency

When fanning out via `createNotificationWithDelivery`, assert in app code that the `type` and `entityType` are aligned:

```typescript
const NOTIFICATION_TYPE = "announcement" as const;
const ENTITY_TYPE = "announcement" as const;

// ...inside the fan-out loop:
createNotificationWithDelivery({
  recipientProfileId: tenantId,
  type: NOTIFICATION_TYPE,
  title,
  body,
  entityType: ENTITY_TYPE,
  entityId: announcement.id,
});
```

Use shared constants — do NOT duplicate the literal `"announcement"` string in multiple places. This prevents future drift between `type` and `entityType`.

### 1C. Recipient Count Computation

The "Will be sent to X tenants" count shown in the composer UI MUST be:
- Computed server-side via a dedicated server action (`getEstimatedRecipientCount(scope, propertyIds)`)
- The server action MUST apply the same `verifiedPropertyIds` permission filter as `createAnnouncement`
- The server action MUST return ONLY the count — never tenant IDs, names, or other identifying data
- The client never queries tenants directly. No client-side derivation from a tenant list.

Implementation:
```typescript
export async function getEstimatedRecipientCount(scope, propertyIds): Promise<number> {
  const { user } = await requireAuth("owner", "manager");
  // Same verification logic as createAnnouncement: build verifiedPropertyIds, then count.
  // Return ONLY the integer count.
}
```

### 2. Composer Component (`announcement-composer.tsx`)

A modal triggered from the dashboard:

```
┌──────────────────────────────────────────────┐
│  Send Announcement                       [x] │
│                                              │
│  Send to:                                    │
│  ○ All my tenants                            │
│  ○ Specific properties                       │
│    ☐ 1st Home — 131 Chaste Tree Circle      │
│    ☐ Mom's House — ...                       │
│                                              │
│  Title:                                      │
│  [Boil water advisory                     ]  │
│                                              │
│  Message:                                    │
│  ┌────────────────────────────────────────┐  │
│  │ Effective immediately, the city has    │  │
│  │ issued a boil water advisory...        │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  Will be sent to 12 tenants.                 │
│                                              │
│  [Cancel]                       [Send]       │
└──────────────────────────────────────────────┘
```

Requirements:
- Radio: All my tenants / Specific properties
- If "Specific properties": show checkbox list of administered properties
- Title input (required, max 200 chars)
- Body textarea (required, max 5000 chars)
- Live recipient count: query/derive on selection change
- Submit button disabled until: scope selected AND title non-empty AND body non-empty AND (if specific) at least 1 property selected
- On submit: call `createAnnouncement` action, show success message with count, close modal
- On error: show inline error, keep form open

### 3. Where to Trigger

Add a "Send Announcement" button:
- Owner dashboard: prominent button in the header or quick actions area
- Manager dashboard: same

Could also add to sidebar as a quick action. Keep the entry point obvious.

### 4. Tenant-Side Display

NO new tenant UI required. Announcements appear in the existing tenant notification system:
- In-app: existing notification bell shows the announcement
- Email: Resend email delivery (existing)
- Use existing notification `type: "announcement"` (or add it if not present in the type enum)

Verify the existing notification `type` field accepts `"announcement"`. If it has a CHECK constraint on type values, add `"announcement"` to the allowed list as part of the migration.

### 5. Plain Language

- "Send Announcement" (not "Broadcast Communication")
- "All my tenants" (not "Global recipient scope")
- "Specific properties" (not "Property-targeted scope")
- "Will be sent to X tenants" (not "Estimated recipient count: X")
- "Announcement sent to X tenants" (not "Broadcast successfully fanned out to X recipients")

## Validation Commands to Run

```bash
cd /Users/courtneysmith/Documents/Codex/Rental\ Properties
npm run gate:web
```

## Acceptance Criteria

1. [ ] Migration creates `announcements` table with `dedupe_key` column, scope/property_ids CHECK constraint, indexes, and RLS policies
2. [ ] Migration creates partial unique index on `(sender_profile_id, dedupe_key)` for idempotency
3. [ ] If `notifications.type` has a CHECK constraint, migration adds `'announcement'` to allowed values
4. [ ] `createAnnouncement` server action requires owner/manager auth
5. [ ] Action rate-limited (10 announcements per hour per user)
6. [ ] Action validates: scope is one of 2 values; title non-empty + max 200; body non-empty + max 5000
7. [ ] Action builds canonical `verifiedPropertyIds` array — never reuses raw form input downstream
8. [ ] Action verifies caller can administer EVERY targeted property before pushing to verified list
9. [ ] `getAdministeredPropertyIds` filters: active membership, non-soft-deleted properties, valid role
10. [ ] Action computes `dedupe_key` from sender + title + body + sorted verifiedPropertyIds + 5-min time bucket
11. [ ] Duplicate insert (unique violation `23505`) is treated as no-op success, not an error
12. [ ] Notification fan-out uses shared `NOTIFICATION_TYPE` and `ENTITY_TYPE` constants — type and entityType always aligned
13. [ ] Action handles partial fan-out failures gracefully (logs but doesn't fail the whole operation)
14. [ ] `getEstimatedRecipientCount` server action exists, applies same permission filter, returns only the integer count
15. [ ] Composer modal renders with scope radio, property checkboxes (when applicable), title input, body textarea
16. [ ] Composer shows recipient count via `getEstimatedRecipientCount` (NEVER queries tenants directly)
17. [ ] Composer submit disabled until form is valid
18. [ ] On success: composer closes, success message shows tenant count
19. [ ] Tenants receive in-app notification AND email (via existing notification system)
20. [ ] All user-facing text follows plain language rules
21. [ ] `gate:web` passes

## Report Format

```
gate:web: PASS | FAIL
migration_file: [name]
files_changed: [list]
acceptance_criteria: [1-21] PASS | FAIL each
notes: (any deviations or questions)
```

## Constraints

- Do NOT add SMS delivery
- Do NOT add scheduling/recurring announcements
- Do NOT allow editing or deleting after send
- Do NOT add tenant reply/thread on announcements
- Do NOT add a separate tenant-side announcement page — use existing notification system
- Use existing `createNotificationWithDelivery` for fan-out — do NOT build new delivery logic
- Verify caller can administer EVERY property they target (no implicit cross-property access)
- Do NOT include "Claude prompt" or recommended next steps sections. Report compact status only.
- Build a canonical `verifiedPropertyIds` array. Never reuse raw form `propertyIds` input downstream.
- `dedupe_key` is REQUIRED on every insert. The unique index `(sender_profile_id, dedupe_key)` is the idempotency boundary. Treat unique violation `23505` as no-op success.
- Recipient count for the UI MUST be computed by a dedicated server action, not by client-side tenant queries. Return only the integer.
- `NOTIFICATION_TYPE` and `ENTITY_TYPE` must be defined as shared constants. Do not hardcode `"announcement"` strings in multiple locations.
- Tenants do NOT read the `announcements` table directly. They receive content via existing notifications. Do NOT widen the SELECT policy without explicit user approval.
- Plain language in all user-facing text.
