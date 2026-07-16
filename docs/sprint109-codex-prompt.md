# Sprint 109 — Application-Level Guards (Tier 2 Hardening)

## Objective

Close three deferred Tier 2 audit findings: autopay race conditions, soft-delete leakage in delinquency queries, and autopay charging terminated leases. All fixes are surgical, application-only, no migrations, no new features.

## Context

- Branch: `main`
- HEAD: previous sprint (post-Sprint 108)
- Tier 2 audit (earlier this session) identified four risks; one (R10 notification amount staleness) was already addressed in Sprint 99 via `recordedAmountCents`. This sprint closes the remaining three.
- Live data:
  - 0 soft-deleted charges currently (we'll be defensive anyway)
  - 1 active autopay enrollment exists, charges flow normally

### The Three Risks

**R2 — Autopay race condition (CRITICAL)**

In `lib/autopay.ts`:
- Line 62-69: query pending/late charges
- Line 139: iterate charges in for loop
- Line 142: create Stripe payment intent

Between line 62 (query) and line 142 (Stripe intent created), a manual payment or webhook can mark the charge as paid. Autopay then creates a second payment intent. Tenant gets double-charged.

**R5 — Soft-deleted charges still trigger delinquency (HIGH)**

In `lib/delinquency.ts`:
- Lines 38-42: query for delinquency escalation — NO `deleted_at IS NULL` filter
- Lines 205-210: query for rent due reminders — NO `deleted_at IS NULL` filter

A soft-deleted charge will still trigger escalation emails and reminder emails. The tenant gets harassed about a charge that was deleted.

**R7 — Autopay survives lease termination (HIGH)**

In `lib/autopay.ts`:
- `processAutopayCharges` iterates enrollments and their charges
- Does NOT check `lease.active = true`

When a lease is terminated, its `autopay_enrollments` row stays `enabled = true`. If any pending charge exists on that lease (which Sprint 101's CHECK constraint on `leases.active` should prevent, but defensive layering matters), autopay will charge it.

## In Scope

1. **Autopay race guard:** In `processAutopayCharges`, re-fetch charge status immediately before creating payment intent. Skip if status is no longer `pending` or `late`.
2. **Autopay lease-active filter:** Filter charges/enrollments by `lease.active = true` before processing.
3. **Delinquency soft-delete filter:** Add `.is("deleted_at", null)` to both `rent_charges` queries in `delinquency.ts`.
4. **Verification:** R10 (notification amount) is already correct via `recordedAmountCents` in Sprint 99 — no change needed but verify in tests.

## Out of Scope

- Schema changes / migrations
- New features
- UI changes
- Notification system changes (R10 already addressed)
- Autopay enrollment cleanup on lease termination (separate concern — handled by app logic when lease is terminated)
- Webhook changes
- Payment recording changes

## Exact Files Expected to Change

| File | Change |
|------|--------|
| `apps/web/lib/autopay.ts` | Add lease-active filter at query time; re-check charge status before creating Stripe intent |
| `apps/web/lib/delinquency.ts` | Add `.is("deleted_at", null)` to both rent_charges queries |
| `apps/web/lib/__tests__/autopay.test.ts` | New tests covering: race-guard skip, terminated lease skip |
| `apps/web/lib/__tests__/delinquency.test.ts` | New tests covering: soft-deleted charges excluded |

## Implementation Requirements

### 1. Autopay Race Guard (`lib/autopay.ts`)

Inside the `for (const charge of dueCharges)` loop (line 139), BEFORE calling `createOffSessionPaymentIntent` (line 142), re-fetch the charge status:

```typescript
for (const charge of dueCharges) {
  // Race guard: re-check charge status immediately before creating Stripe intent.
  // A manual payment or webhook may have marked it paid/waived since we queried at line 62.
  const { data: currentCharge, error: recheckError } = await supabase
    .from("rent_charges")
    .select("status, deleted_at")
    .eq("id", charge.id)
    .maybeSingle();

  if (recheckError) {
    console.error(`[autopay] re-check failed for charge ${charge.id}:`, recheckError);
    continue; // Skip this charge, don't break the loop
  }

  if (!currentCharge || currentCharge.deleted_at !== null) {
    console.log(`[autopay] charge ${charge.id} no longer exists or was deleted — skipping`);
    continue;
  }

  if (currentCharge.status !== "pending" && currentCharge.status !== "late") {
    console.log(`[autopay] charge ${charge.id} status is now '${currentCharge.status}' — skipping autopay`);
    continue;
  }

  // ... existing code: createOffSessionPaymentIntent etc.
}
```

**Important:** Use `continue` (skip this charge), NOT `break` (stop entire loop). The existing code already has a `break` on Stripe API failure — keep that. The race-guard skips are different and should not stop the loop.

### 2. Autopay Lease-Active Filter (`lib/autopay.ts`)

In the charge query (line 62-69), add a join filter to only include charges whose lease is active:

Look at the current query structure. If charges are joined with leases, filter `leases.active = true`. If not, modify the query to inner-join leases and filter, OR pre-fetch active lease IDs and filter charges with `.in("lease_id", activeLeaseIds)`.

Implementation choice (Codex picks based on existing code shape):

**Option A — inner join filter (preferred if Supabase query allows):**
```typescript
const { data: dueCharges, error } = await supabase
  .from("rent_charges")
  .select("id, lease_id, amount_cents, due_date, status, leases!inner(active)")
  .in("status", ["pending", "late"])
  .lte("due_date", todayIso)
  .eq("leases.active", true)
  .is("deleted_at", null);  // Also add soft-delete filter for consistency
```

**Option B — pre-fetch active leases:**
```typescript
const { data: activeLeases } = await supabase
  .from("leases")
  .select("id")
  .eq("active", true);

const activeLeaseIds = (activeLeases ?? []).map((l) => l.id);
if (activeLeaseIds.length === 0) return;

const { data: dueCharges, error } = await supabase
  .from("rent_charges")
  .select("...")
  .in("status", ["pending", "late"])
  .in("lease_id", activeLeaseIds)
  .is("deleted_at", null);
```

Either works. Pick the cleaner one.

### 3. Delinquency Soft-Delete Filter (`lib/delinquency.ts`)

**Line 38-42 query (delinquency escalation):**
```typescript
const { data: charges, error } = await supabase
  .from("rent_charges")
  .select("...")
  .in("status", ["pending", "late"])
  .lte("due_date", thresholdIso)
  .is("deleted_at", null);  // ADD THIS
```

**Line 205-210 query (rent due reminders):**
```typescript
const { data: charges, error } = await supabase
  .from("rent_charges")
  .select("...")
  .eq("status", "pending")
  .eq("category", "rent")
  .eq("due_date", reminderIso)
  .is("deleted_at", null);  // ADD THIS
```

Apply the same filter to any OTHER `rent_charges` query in `delinquency.ts` that doesn't already have it.

### 4. Tests

Add tests covering the new guards. Use the existing test patterns in the project.

**`autopay.test.ts`:**
- Charge marked paid between query and intent creation → autopay skips it (no Stripe intent created)
- Charge soft-deleted between query and intent creation → autopay skips it
- Lease terminated (`active = false`) → charges for that lease are not picked up at all
- Lease still active + charge pending → autopay proceeds normally

**`delinquency.test.ts`:**
- Soft-deleted charge (`deleted_at IS NOT NULL`) is excluded from delinquency escalation queue
- Soft-deleted charge is excluded from rent due reminder queue
- Non-deleted charges process normally

## Validation Commands to Run

```bash
cd /Users/courtneysmith/Documents/Codex/Rental\ Properties
npm run gate:web
```

## Acceptance Criteria

1. [ ] `lib/autopay.ts` re-fetches charge status immediately before `createOffSessionPaymentIntent`
2. [ ] Race-guard skips use `continue` (not `break`) — does not stop the loop for other charges
3. [ ] `lib/autopay.ts` charge query filters by `lease.active = true` (inner join or pre-fetched lease IDs)
4. [ ] `lib/autopay.ts` charge query filters `.is("deleted_at", null)`
5. [ ] `lib/delinquency.ts` line 38-42 query filters `.is("deleted_at", null)`
6. [ ] `lib/delinquency.ts` line 205-210 query filters `.is("deleted_at", null)`
7. [ ] Any other `rent_charges` query in `delinquency.ts` also filters `.is("deleted_at", null)`
8. [ ] New autopay test: charge paid between query and intent — autopay skips, no double charge
9. [ ] New autopay test: terminated lease — its charges are not picked up
10. [ ] New delinquency test: soft-deleted charges excluded
11. [ ] Existing autopay flow still works (happy path: active lease + pending charge → Stripe intent created)
12. [ ] Existing delinquency flow still works (active charges still get escalation/reminders)
13. [ ] No new features, no schema changes, no UI changes
14. [ ] `gate:web` passes

## Report Format

```
gate:web: PASS | FAIL
files_changed: [list]
acceptance_criteria: [1-14] PASS | FAIL each
notes: (any deviations or questions)
```

## Constraints

- Do NOT modify the webhook handlers
- Do NOT modify charge status update logic (already hardened in Sprint 99 + 101)
- Do NOT add new database tables or columns
- Do NOT remove the existing `break` on Stripe API errors in autopay
- The race-guard re-fetch MUST be a separate query immediately before `createOffSessionPaymentIntent` — not a stale read from the original query
- Skip with `continue`, never `break` for race-guard cases
- Do NOT include "Claude prompt" or recommended next steps sections. Report compact status only.
