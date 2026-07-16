# Sprint 104 — Tenant Activity System (MVP)

## Objective

Create a simple tenant activity log so property managers and owners can record infractions, notices, warnings, and notes tied to a tenant. This replaces external tracking (spreadsheets, notes apps) with an in-app timeline accessible from the lease view.

## Context

- Branch: `main`
- HEAD: `27a230d` (Sprint 103)
- A property manager requested the ability to "record activity taken on the account such as infractions received by tenants and notices sent out"
- No tenant activity tracking currently exists in Domus
- The `communication_logs` table exists but is unused and lacks the required fields — do NOT repurpose it. Create a new table.
- Activity entries are tied to `tenant_profile_id` (the person), not just `lease_id` — so history follows the tenant across leases
- The timeline should be accessible from within the Leases section, embedded in individual lease rows

### Integration Point

The Leases section (`components/dashboard/leases-section.tsx`) displays each lease with tenant name, contact info, dates, and actions using a `DataRow` pattern with inline controls. The tenant activity timeline must use an **inline expandable panel** below the lease row — consistent with the existing layout pattern. Do NOT use a modal or drawer.

## In Scope

1. **Database migration:** New `tenant_activity_log` table
2. **Server actions:** Create entry, fetch entries for a tenant
3. **UI component:** `TenantActivityTimeline` — timeline view + add entry form
4. **Integration:** Accessible from lease rows in Leases section
5. **Permissions:** Owner + manager can create/view. Tenant cannot see.

## Out of Scope

- Document upload or PDF attachment on activity entries
- Notifications triggered by activity entries
- Automation rules based on activity entries
- New sidebar navigation item (activity is contextual, not a top-level section)
- Changes to maintenance, charges, payments, or other sections
- Tenant-facing visibility of activity entries

## Database Migration

### New Table: `tenant_activity_log`

```sql
CREATE TABLE IF NOT EXISTS tenant_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES units(id) ON DELETE SET NULL,
  lease_id uuid REFERENCES leases(id) ON DELETE SET NULL,
  activity_type text NOT NULL CHECK (activity_type IN ('infraction', 'notice', 'warning', 'note')),
  title text NOT NULL CHECK (char_length(title) > 0 AND char_length(title) <= 200),
  description text DEFAULT '',
  created_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast tenant-scoped queries
CREATE INDEX idx_tenant_activity_tenant ON tenant_activity_log (tenant_profile_id, created_at DESC);

-- Index for property-scoped queries
CREATE INDEX idx_tenant_activity_property ON tenant_activity_log (property_id, created_at DESC);

-- RLS: property-scoped access — caller must administer the activity's property
ALTER TABLE tenant_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_activity_log_property_scoped ON tenant_activity_log
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      JOIN ownership_account_members oam ON p.owner_account_id = oam.account_id
      WHERE p.id = tenant_activity_log.property_id
        AND oam.profile_id = auth.uid()
        AND oam.active = true
    )
    OR EXISTS (
      SELECT 1 FROM property_managers pm
      WHERE pm.property_id = tenant_activity_log.property_id
        AND pm.manager_profile_id = auth.uid()
        AND pm.active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM properties p
      JOIN ownership_account_members oam ON p.owner_account_id = oam.account_id
      WHERE p.id = tenant_activity_log.property_id
        AND oam.profile_id = auth.uid()
        AND oam.active = true
    )
    OR EXISTS (
      SELECT 1 FROM property_managers pm
      WHERE pm.property_id = tenant_activity_log.property_id
        AND pm.manager_profile_id = auth.uid()
        AND pm.active = true
    )
  );
```

**Migration file name:** `20260405_sprint104_tenant_activity_log.sql`

### Column Rationale

- `tenant_profile_id` — the person, NOT the lease. History follows the tenant.
- `property_id` — which property this activity relates to
- `unit_id` — nullable. Relevant when tenant is in a specific unit.
- `lease_id` — nullable. Links to specific lease if applicable. NULL for activities not tied to a lease.
- `activity_type` — constrained to 4 types: `infraction`, `notice`, `warning`, `note`
- `title` — short summary (max 200 chars). Required.
- `description` — longer details. Optional.
- `created_by` — who logged this entry (owner or manager profile ID)
- `created_at` — when it was logged

## Exact Files Expected to Change

| File | Change |
|------|--------|
| `supabase/migrations/20260405_sprint104_tenant_activity_log.sql` | **NEW** — migration |
| `apps/web/app/actions/tenant-activity.ts` | **NEW** — server actions: `createTenantActivity`, `getTenantActivityLog` |
| `apps/web/components/dashboard/tenant-activity-timeline.tsx` | **NEW** — timeline display + add entry form |
| `apps/web/components/dashboard/leases-section.tsx` | Add "Activity" button per lease row that opens the timeline |

## Implementation Requirements

### 1. Server Actions (`app/actions/tenant-activity.ts`)

**`createTenantActivity(formData)`**
- Auth: `requireAuth("owner", "manager")`
- Rate limit: `checkRateLimit(`tenant-activity:${user.id}`, 30, 60_000)`
- Validate: `activity_type` is one of `['infraction', 'notice', 'warning', 'note']`
- Validate: `title` is non-empty, max 200 chars

**Input derivation (critical — do NOT trust hidden fields independently):**

- **If `leaseId` is provided:** Query the lease and derive `tenantProfileId`, `propertyId`, and `unitId` from it server-side. Do NOT use the values from form data for these fields. This prevents mismatched entries from tampered requests.
  ```typescript
  const { data: lease } = await supabase
    .from("leases")
    .select("tenant_profile_id, unit_id")
    .eq("id", leaseId)
    .maybeSingle();
  // Then derive unit → property
  const { data: unit } = await supabase
    .from("units")
    .select("property_id")
    .eq("id", lease.unit_id)
    .maybeSingle();
  // Use: tenantProfileId = lease.tenant_profile_id, propertyId = unit.property_id, unitId = lease.unit_id
  ```

- **If `leaseId` is absent** (freeform entry not tied to a specific lease): Validate `tenantProfileId` and `propertyId` from form data independently. Verify the tenant has a relationship to that property (e.g., an active or past lease linking them). Verify `propertyId` exists and user can administer it (`canUserAdministerProperty`).

- After resolving all fields: verify user can administer the resolved `propertyId` (`canUserAdministerProperty`)
- Insert into `tenant_activity_log` with `created_by = user.id`
- Check insert error
- Revalidate path

**`getTenantActivityLog(tenantProfileId, propertyId)`**
- Auth: `requireAuth("owner", "manager")`
- **Property-scoped access check:** Verify the caller can administer `propertyId` via `canUserAdministerProperty(user.id, propertyId)`. If not, return empty array or error. Do NOT return entries for properties the caller does not control.
- Query `tenant_activity_log` filtered by `tenant_profile_id` AND `property_id`
- Order by `created_at DESC`
- Limit 50 entries
- Join `profiles` on `created_by` to get author name
- Return array of activity entries
- **`propertyId` is required, not optional.** The caller must specify which property's activity they're viewing. This ensures scoped access.

### 2. Timeline Component (`components/dashboard/tenant-activity-timeline.tsx`)

**Props:**
```typescript
interface TenantActivityTimelineProps {
  tenantProfileId: string;
  propertyId: string;
  unitId?: string;
  leaseId?: string;
  tenantName: string;
  entries: TenantActivityEntry[];
  onCreateActivity: (formData: FormData) => Promise<ActionState>;
}
```

**Layout:**
```
┌──────────────────────────────────────────────┐
│  Activity for [Tenant Name]                  │
│                                              │
│  [+ Add Entry]                               │
│                                              │
│  ── Mar 28, 2026 ───────────────────────     │
│  ⚠️ Warning · Late Payment Notice            │
│  Sent formal notice regarding overdue rent.  │
│  Logged by Ace · 2:30 PM                     │
│                                              │
│  ── Mar 15, 2026 ───────────────────────     │
│  📝 Note · Move-in inspection complete       │
│  All rooms inspected. Minor scuff on...      │
│  Logged by Ace · 10:15 AM                    │
│                                              │
│  (empty state: "No activity recorded yet.")  │
└──────────────────────────────────────────────┘
```

**Activity Type Icons/Badges:**
- `infraction` — red badge
- `notice` — amber badge
- `warning` — orange badge
- `note` — gray/blue badge

**Add Entry Form** (inline or modal):
```
┌──────────────────────────────────────────────┐
│  Type:  [Dropdown: Infraction/Notice/...]    │
│  Title: [Short text input]                   │
│  Details: [Textarea, optional]               │
│                                              │
│  [Cancel]  [Save Entry]                      │
└──────────────────────────────────────────────┘
```

- Form uses hidden inputs for `tenantProfileId`, `propertyId`, `unitId`, `leaseId`
- Submit calls `onCreateActivity` server action
- On success: form clears, new entry appears at top of timeline
- On error: show error message inline

### 3. Leases Section Integration (`leases-section.tsx`)

Add a "View Activity" or "Log Activity" button next to the existing "Message" button (around line 268). Clicking it expands an **inline panel below the lease row** showing `TenantActivityTimeline`. This is consistent with the existing `DataRow` control pattern.

**Do NOT use a modal or drawer.** The timeline is contextual to the lease row and should expand/collapse in place.

The button must pass `leaseId` to the timeline component. The component fetches activity entries on expand (lazy load) and derives `tenantProfileId`, `propertyId`, and `unitId` from the lease data already available in the row.

**Data loading:** Activity entries for the visible tenant(s) should be fetched either:
- On-demand when the user clicks "View Activity" (lazy load)
- Or pre-fetched in the page data and passed down

Prefer lazy loading to avoid slowing the initial page load.

### 4. Plain Language (CLAUDE.md §18)

- "Activity" (not "Tenant Activity Log System")
- "Add Entry" (not "Create Activity Record")
- "Infraction" label in dropdown: "Infraction" (keep as-is — PMs know this term)
- "Notice" label: "Notice Sent"
- "Warning" label: "Warning"
- "Note" label: "Note"
- "No activity recorded yet." (not "No tenant_activity_log entries found")
- "Logged by [Name]" (not "Created by profile_id")

## Validation Commands to Run

```bash
cd /Users/courtneysmith/Documents/Codex/Rental\ Properties
npm run gate:web
```

## Acceptance Criteria

1. [ ] Migration creates `tenant_activity_log` table with all specified columns, constraints, indexes, and property-scoped RLS policy (NOT global role-based)
2. [ ] RLS policy scopes access to callers who are active ownership account members OR active property managers for `tenant_activity_log.property_id`
3. [ ] `createTenantActivity`: when `leaseId` is provided, derives `tenantProfileId`, `propertyId`, `unitId` from the lease server-side — does NOT trust hidden form fields
4. [ ] `createTenantActivity`: when `leaseId` is absent, validates `tenantProfileId` + `propertyId` independently and verifies tenant-property relationship
5. [ ] `createTenantActivity`: requires owner/manager auth, checks `canUserAdministerProperty` on the resolved `propertyId`, rate-limited
6. [ ] `getTenantActivityLog`: requires `propertyId` (not optional), verifies caller can administer that property, returns entries ordered by `created_at DESC` with author name
7. [ ] `TenantActivityTimeline` component renders entries as a chronological timeline with type badges, title, description, author, and timestamp
8. [ ] `TenantActivityTimeline` shows empty state "No activity recorded yet." when no entries exist
9. [ ] Add entry form has: type dropdown (infraction/notice/warning/note), title input, description textarea
10. [ ] Form validates: type required, title required + max 200 chars
11. [ ] Form submits successfully and new entry appears without page reload
12. [ ] Leases section has an inline expandable panel per lease row (NOT a modal/drawer) for tenant activity
13. [ ] Activity entries are tied to `tenant_profile_id` (follows the tenant across leases)
14. [ ] Tenant role cannot access activity entries (RLS enforced at property scope)
15. [ ] All user-facing text follows plain language rules
16. [ ] `gate:web` passes

## Report Format

```
gate:web: PASS | FAIL
migration_file: [name]
files_changed: [list]
acceptance_criteria: [1-16] PASS | FAIL each
notes: (any deviations or questions)
```

## Constraints

- Do NOT repurpose the `communication_logs` table — create new table
- Do NOT add document upload or file attachment to activity entries
- Do NOT add notifications triggered by activity entries
- Do NOT add a new top-level sidebar navigation item for activity
- Do NOT modify maintenance, charges, payments, or auth code
- Do NOT make activity entries visible to tenants
- RLS must be property-scoped, NOT global role-based. Caller must administer the activity's property.
- When `leaseId` is provided, ALWAYS derive tenant/property/unit from the lease server-side. NEVER trust hidden form fields independently.
- UI integration MUST use inline expandable panel below the lease row. Do NOT use modal or drawer.
- `getTenantActivityLog` MUST require `propertyId` and verify caller can administer it.
- Do NOT create automation rules based on activity types
- Activity must be tied to `tenant_profile_id`, not just `lease_id`
- Lazy-load activity entries when the user opens the timeline — do NOT fetch for all tenants on page load
- Do NOT include "Claude prompt" or recommended next steps sections. Report compact status only.
- Plain language in all user-facing text.
