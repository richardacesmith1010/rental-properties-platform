# Sprint 101 — Database Integrity Constraints

## Objective

Add database-level constraints to prevent critical data integrity failures that application code alone cannot guarantee: duplicate charges, duplicate late fees, lease state inconsistency, non-atomic status transitions, and partial payments.

## Context

- Branch: `main`
- HEAD: `0dfc8d0` (Sprint 100)
- Tier 2 audit identified 4 critical and 4 high risks in data integrity
- **No existing data violates any proposed constraint** — verified via live DB queries (zero duplicates, zero inconsistent leases, zero partial payments)
- All constraints can be applied without backfill or data cleanup

### Live Data State (verified)

- 0 duplicate `(lease_id, due_date, category)` combinations in `rent_charges`
- 0 duplicate `parent_charge_id` values in `rent_charges`
- 0 leases where `active` and `lease_status` are inconsistent
- 0 partial payments (all existing payments match charge amounts)
- 2 active leases, both `active=true, lease_status='active'`

### Rent Charges Schema (current)

```
id (uuid), lease_id (uuid), due_date (date), amount_cents (integer),
status (text), created_at (timestamptz), category (text),
parent_charge_id (uuid), deleted_at (timestamptz), notes (text)
```

### Status Update Locations (all must be updated)

| File | Line | Transition | Current SQL |
|------|------|-----------|-------------|
| `lib/stripe-webhook-handlers.ts` | 213 | → paid | `.update({ status: "paid" }).eq("id", chargeId)` |
| `app/actions/charges.ts` | 425 | → paid | `.update({ status: "paid" })` |
| `lib/charge-generation.ts` | 246 | → late | `.update({ status: "late" })` |
| `app/actions/charge-management.ts` | 457 | → waived | `.update({ status: "waived" })` |
| `lib/stripe-webhook-handlers.ts` | 779 | → pending (ACH failure revert) | `.update({ status: "pending" })` |

## In Scope

1. **Migration:** Add `UNIQUE` constraint on `rent_charges(lease_id, due_date, category)` where `deleted_at IS NULL`
2. **Migration:** Add `UNIQUE` constraint on `rent_charges(parent_charge_id)` where `parent_charge_id IS NOT NULL AND deleted_at IS NULL`
3. **Migration:** Add `CHECK` constraint on `leases` enforcing `active`/`lease_status` consistency
4. **Application:** Update all status transitions to be atomic with `WHERE status IN (...)` guards
5. **Application:** Reject partial payments (amount must equal charge amount)

## Out of Scope

- Autopay lease-active filtering (Sprint 102)
- Soft-delete consistency audit (Sprint 102)
- Delinquency query fixes (Sprint 102)
- New features
- UI changes

## DB Migrations

### Migration 1: Rent Charge Unique Constraints

```sql
-- Prevent duplicate charges for same lease + due date + category
-- Uses partial index to exclude soft-deleted rows
CREATE UNIQUE INDEX IF NOT EXISTS uq_rent_charges_lease_due_category
  ON rent_charges (lease_id, due_date, category)
  WHERE deleted_at IS NULL;

-- Prevent duplicate late fees for same parent charge
-- Limited to category='late_fee' so future charge types linked to a parent are not blocked
CREATE UNIQUE INDEX IF NOT EXISTS uq_rent_charges_parent_late_fee
  ON rent_charges (parent_charge_id)
  WHERE parent_charge_id IS NOT NULL AND deleted_at IS NULL AND category = 'late_fee';
```

**Why partial unique indexes (not constraints):** Supabase/PostgreSQL unique constraints cannot have WHERE clauses. Partial unique indexes provide the same enforcement while respecting soft-deletes — you CAN create a new charge after soft-deleting the old one.

### Migration 2: Lease State Consistency

**Before writing the CHECK constraint, grep the codebase for ALL `lease_status` string literals.** Search `apps/web/` for every value assigned to or compared against `lease_status`. The charge generation code (line 143) filters out `'terminated'` and `'renewed'` — confirm whether `'renewed'` is a valid status used in production.

Include ALL valid inactive statuses in the constraint. Based on current codebase knowledge, the constraint should be:

```sql
-- Enforce: active=true ↔ lease_status='active'
-- Enforce: active=false ↔ lease_status IN ('terminated', 'expired', 'renewed')
ALTER TABLE leases
  ADD CONSTRAINT chk_lease_active_status_consistency
  CHECK (
    (active = true AND lease_status = 'active')
    OR (active = false AND lease_status IN ('terminated', 'expired', 'renewed'))
  );
```

**If the codebase grep reveals additional `lease_status` values beyond `'active'`, `'terminated'`, `'expired'`, and `'renewed'`, add them to the appropriate branch of the CHECK constraint.** Do NOT omit any valid status — the migration will fail on existing data if a status is missing.

**This is a hard constraint.** Any future code that sets `active=false` without also setting `lease_status` (or vice versa) will fail. This is intentional — it forces atomic state transitions.

### Migration Name

```
20260329_sprint101_db_integrity_constraints.sql
```

## Application Changes Required

### 1. Atomic Status Transitions — Add WHERE Guards

Every charge status update must include a `WHERE status IN (...)` clause to prevent concurrent writes from overwriting each other.

**`lib/stripe-webhook-handlers.ts` — `markChargePaid` (line 213):**

```typescript
// Before:
const { error } = await supabase.from("rent_charges").update({ status: "paid" }).eq("id", chargeId);

// After:
const { error, count } = await supabase
  .from("rent_charges")
  .update({ status: "paid" })
  .eq("id", chargeId)
  .in("status", ["pending", "late"])
  .select("id", { count: "exact", head: true });

if (error) {
  console.error("[stripe-webhook] markChargePaid:", error);
  return false;
}
if (count === 0) {
  // Zero rows updated — re-read the charge to determine why
  const { data: current } = await supabase
    .from("rent_charges")
    .select("status")
    .eq("id", chargeId)
    .maybeSingle();

  if (current?.status === "paid") {
    // Already paid by concurrent process — safe to continue
    return true;
  }
  if (current?.status === "waived") {
    // Waived by owner — payment exists but charge was resolved differently
    console.warn(`[stripe-webhook] markChargePaid: charge ${chargeId} was waived — proceeding`);
    return true;
  }
  // Unexpected state (deleted, missing, or unknown status) — treat as failure
  console.error(`[stripe-webhook] markChargePaid: charge ${chargeId} in unexpected state '${current?.status ?? "missing"}' — aborting`);
  return false;
}
return true;
```

**Why re-read on zero rows:** Not all zero-row cases are safe. `paid` and `waived` are terminal states where proceeding is correct. Any other state (deleted, missing, unknown) indicates a problem — return `false` so the webhook returns 500 and Stripe retries.

**`app/actions/charges.ts` — `recordManualPayment` (line 425):**

```typescript
// Before:
.update({ status: "paid" })

// After:
.update({ status: "paid" })
.in("status", ["pending", "late"])
```

**`lib/charge-generation.ts` — `applyLateFeesToOverdueCharges` (line 246):**

```typescript
// Before:
.update({ status: "late" })

// After:
.update({ status: "late" })
.in("status", ["pending"])  // Only pending charges become late
```

**`app/actions/charge-management.ts` — `waiveCharge` (line 457):**

```typescript
// Before:
.update({ status: "waived" })

// After:
.update({ status: "waived" })
.in("status", ["pending", "late"])  // Only pending/late charges can be waived
```

**`lib/stripe-webhook-handlers.ts` — `handleAsyncPaymentFailed` (line 779):**

```typescript
// Before:
.update({ status: "pending" })

// After:
.update({ status: "pending" })
.in("status", ["paid"])  // Only revert if currently paid (ACH failure scenario)
```

### 2. Charge Generation — Handle Unique Constraint Violation

In `lib/charge-generation.ts`, the charge insert (around line 435) must handle the new unique index violation gracefully:

```typescript
const { error } = await supabase.from("rent_charges").insert({
  lease_id, due_date, amount_cents, status: "pending", category: "rent"
});

if (error) {
  if (error.code === "23505") {
    // Duplicate charge — already exists for this lease+date+category
    // This is expected if cron runs twice. Skip silently.
    continue;
  }
  console.error("[charge-generation] insert failed:", error);
}
```

Same pattern for late fee insertion — handle `23505` as a no-op.

### 3. Reject Partial Payments + Guard Against Already-Paid Charges

In `app/actions/charges.ts` — `recordManualPayment`:

**3A. Check charge status BEFORE inserting payment record.**

Before the payment insert, verify the charge is still in a payable state. If the charge is already `paid` or `waived`, return an error immediately — do NOT insert a payment record:

```typescript
// Before inserting the payment, check current charge status:
const { data: currentCharge } = await supabase
  .from("rent_charges")
  .select("status")
  .eq("id", chargeId)
  .maybeSingle();

if (!currentCharge || currentCharge.status === "paid") {
  return { error: "This charge has already been paid." };
}
if (currentCharge.status === "waived") {
  return { error: "This charge has been waived and cannot be paid." };
}
```

This prevents a concurrent payment (from webhook or autopay) from resulting in a duplicate payment record.

**3B. Reject partial payments.**

Replace the existing overflow check with a strict equality check:

```typescript
// Before (around line 375):
if (amountCents > charge.amount_cents) {
  return { error: "Payment amount cannot exceed the charge amount." };
}

// After:
if (amountCents !== charge.amount_cents) {
  return { error: "Payment amount must match the charge amount exactly." };
}
```

This is a temporary rule. If partial payments are needed in the future, they should be implemented with remainder tracking — not by silently marking charges as fully paid.

**Note:** This only affects `recordManualPayment`. Stripe payments (card/ACH) always charge the full amount by design — the session is created with the charge's `amount_cents`.

### 4. Lease State Updates — Ensure Atomic Transitions

Search for all places that update `leases.active` or `leases.lease_status`. Both columns must be updated together in the same `.update()` call to satisfy the new CHECK constraint.

Known locations:
- `lib/charge-generation.ts` — sets `active=false, lease_status='expired'` (already atomic)
- `app/actions/lease-lifecycle-actions.ts` — `terminateLease`, `renewLease`

Verify each sets BOTH columns in the same update. If any sets only one column, it will fail the CHECK constraint. Fix by including both columns.

## Validation Steps

```bash
cd /Users/courtneysmith/Documents/Codex/Rental\ Properties
npm run gate:web
```

After migration is applied, verify constraints exist:

```sql
-- Verify unique indexes
SELECT indexname FROM pg_indexes
WHERE tablename = 'rent_charges'
AND indexname IN ('uq_rent_charges_lease_due_category', 'uq_rent_charges_parent_late_fee');

-- Verify CHECK constraint
SELECT conname FROM pg_constraint
WHERE conrelid = 'leases'::regclass AND conname = 'chk_lease_active_status_consistency';
```

## Acceptance Criteria

1. [ ] Migration creates partial unique index `uq_rent_charges_lease_due_category` on `(lease_id, due_date, category) WHERE deleted_at IS NULL`
2. [ ] Migration creates partial unique index `uq_rent_charges_parent_late_fee` on `(parent_charge_id) WHERE parent_charge_id IS NOT NULL AND deleted_at IS NULL AND category = 'late_fee'`
3. [ ] Migration creates CHECK constraint `chk_lease_active_status_consistency` on `leases` with ALL valid `lease_status` values discovered by codebase grep (at minimum: `active`, `terminated`, `expired`, `renewed`)
4. [ ] `markChargePaid` uses `.in("status", ["pending", "late"])` guard — on zero rows updated, re-reads charge status: returns `true` if `paid` or `waived`, returns `false` otherwise
5. [ ] `recordManualPayment` uses `.in("status", ["pending", "late"])` guard on charge status update
6. [ ] `applyLateFeesToOverdueCharges` uses `.in("status", ["pending"])` guard
7. [ ] `waiveCharge` uses `.in("status", ["pending", "late"])` guard
8. [ ] `handleAsyncPaymentFailed` uses `.in("status", ["paid"])` guard for revert
9. [ ] Charge generation handles `23505` (unique violation) gracefully — skips duplicate, does not crash
10. [ ] Late fee generation handles `23505` gracefully — skips duplicate, does not crash
11. [ ] `recordManualPayment` checks charge status BEFORE inserting payment record — rejects if already `paid` or `waived`
12. [ ] `recordManualPayment` rejects payments where `amountCents !== charge.amount_cents`
13. [ ] All lease state updates set BOTH `active` and `lease_status` in the same `.update()` call
14. [ ] Migration file named `20260329_sprint101_db_integrity_constraints.sql`
15. [ ] `gate:web` passes (lint + typecheck + build)

## Report Format

```
gate:web: PASS | FAIL
migration_applied: YES | NO
files_changed: [list]
acceptance_criteria: [1-15] PASS | FAIL each
notes: (any deviations or questions)
```

## Rollback Plan

If constraints cause issues after migration:

```sql
-- Drop unique indexes (safe — does not drop data)
DROP INDEX IF EXISTS uq_rent_charges_lease_due_category;
DROP INDEX IF EXISTS uq_rent_charges_parent_late_fee;

-- Drop CHECK constraint (safe — does not drop data)
ALTER TABLE leases DROP CONSTRAINT IF EXISTS chk_lease_active_status_consistency;
```

Application code with `.in("status", ...)` guards is backward-compatible — the WHERE clause is additive and works with or without the constraints.

## Constraints

- Migration must be safe: no data deletion, no column drops, no table restructuring
- Application changes must be backward-compatible with the pre-migration schema (guards work with or without constraints)
- Do NOT modify autopay processing logic (Sprint 102)
- Do NOT modify delinquency queries (Sprint 102)
- Do NOT add new features
- Do NOT modify UI
- Do NOT modify auth or middleware
- Handle unique constraint violations (`23505`) as no-ops, not errors
- Do NOT include "Claude prompt" or recommended next steps sections. Report compact status only.
