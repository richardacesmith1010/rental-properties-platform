# Sprint 70 — Codex Implementation Prompt

## 1. Objective

Fix rent charge generation to prevent backdated charges and limit pre-generation to only the next upcoming month. Fix the property/lease deletion cascade so wiping properties cleanly removes all related data. Add ability for owners/managers to delete pending charges.

## 2. Context

- **Branch**: `main`
- **HEAD**: `5cee078`
- **Production URL**: `https://domusbase.com`
- **Supabase project**: `vawqdqkaguhdgfhdebqw`

**Bugs found:**

1. **Backdated charges**: When a lease is created on March 22 with due_day=1, the charge generator creates a charge for March 1 (already passed). The tenant shouldn't owe for a month that was mostly over when they signed.

2. **Over-generation**: `getCandidateMonths()` generates charges for current month + next 2 months (3 total). It should only generate the NEXT upcoming charge — not 2 months ahead.

3. **Missing cascade on property delete**: The "Delete All Properties" wipe in Account & Data doesn't cascade-delete leases, units, charges, or related data. Orphaned records remain.

**Key files:**
- `apps/web/lib/charge-generation.ts` — core charge generation logic
  - `getCandidateMonths()` returns 3 months (current + next 2)
  - `buildDueDatesByLeaseId()` filters by lease start/end but NOT by lease creation date
  - Duplicate prevention uses `(lease_id, due_date)` composite key
- `apps/web/app/actions/account-wipe.ts` — property deletion logic

## 3. In Scope

### Part A: Fix Charge Generation — No Backdating
- When generating charges, skip any due date that is BEFORE the lease's `created_at` date
- A lease created on March 22 should NOT get a charge for March 1
- The first charge should be for the next due date on or after the lease creation date

### Part B: Fix Charge Generation — Only Next Month
- Change `getCandidateMonths()` to return only 2 months: current month + next month
- Do NOT pre-generate month+2
- Charges for future months will be generated when the cron runs in that month

### Part C: Fix Property Deletion Cascade
- When "Delete All Properties" runs, it must also delete:
  - All units belonging to those properties
  - All leases on those units
  - All rent_charges on those leases
  - All maintenance tickets on those properties
  - All expenses on those properties
  - All property_managers on those properties
  - All related notification records

### Part D: Fix Lease Creation — Set Correct First Charge Date
- When a lease is created, the system should note when the first charge is due
- If lease starts mid-month (e.g., March 22) and due_day is 1, the first charge is April 1
- If lease starts before the due_day (e.g., March 22 and due_day is 25), the first charge is March 25

### Part E: Delete Pending Charge

Add a `deletePendingCharge(chargeId)` server action that:
1. Auth check — caller must be property owner or assigned property manager
2. Fetch the charge, verify status is `pending` (cannot delete `paid` or `late` charges)
3. Delete the charge from `rent_charges`
4. Revalidate the dashboard path
5. Return `{ success: true }`

**UI**: Add a delete/trash icon button on pending charge cards in the owner's Charges section. Show a confirmation dialog: "Delete this pending charge of $X due on {date}? This cannot be undone."

- Only show the delete button on charges with status `pending`
- Do NOT show delete on `paid` or `late` charges
- Managers assigned to the property can also delete pending charges

**Files to modify:**
- `apps/web/app/actions/charges.ts` — add `deletePendingCharge` action
- `apps/web/components/dashboard/charges-section.tsx` — add delete button on pending charge cards with confirmation

### Part F: Unit Tests
- Test: lease created March 22, due_day=1 → first charge is April 1, NOT March 1
- Test: lease created March 22, due_day=25 → first charge is March 25
- Test: lease created March 1, due_day=1 → first charge IS March 1
- Test: getCandidateMonths returns exactly 2 months, not 3
- Test: charges are not generated for due dates before lease.created_at

## 4. Out of Scope

- Changing payment processing logic
- Modifying Stripe integration
- Changing the cron schedule
- Late fee calculation changes
- CLAUDE.md / AGENTS.md edits

## 5. Exact Files Expected to Change

### Modified Files (5-6)
1. `apps/web/lib/charge-generation.ts` — fix getCandidateMonths (2 months), add created_at filter to buildDueDatesByLeaseId
2. `apps/web/app/actions/account-wipe.ts` — fix cascade deletion for properties
3. `apps/web/app/actions/charges.ts` — add deletePendingCharge action
4. `apps/web/components/dashboard/charges-section.tsx` — add delete button on pending charges
5. `apps/web/lib/__tests__/charge-generation.test.ts` — add/update unit tests (create if doesn't exist)

## 6. Implementation Requirements

### Part A: No Backdating

In `buildDueDatesByLeaseId()`, add a filter that checks each candidate due date against the lease's `created_at` timestamp:

```typescript
// BEFORE: only checks lease date bounds
const validDueDates = candidateDueDates.filter(dueDate =>
  dueDate >= lease.start_date && dueDate <= lease.end_date
);

// AFTER: also checks lease creation date
const leaseCreatedDate = new Date(lease.created_at);
leaseCreatedDate.setHours(0, 0, 0, 0); // normalize to start of day

const validDueDates = candidateDueDates.filter(dueDate => {
  const due = new Date(dueDate);
  return due >= leaseCreatedDate && // NOT before lease was created
         due >= new Date(lease.start_date) &&
         due <= new Date(lease.end_date);
});
```

**IMPORTANT**: The `created_at` column already exists on the `leases` table. Make sure the charge generation query includes it in the SELECT.

### Part B: Only Next Month

Change `getCandidateMonths()`:

```typescript
// BEFORE: 3 months
function getCandidateMonths() {
  const today = new Date();
  const baseYear = today.getUTCFullYear();
  const baseMonth = today.getUTCMonth();
  return [
    { year: baseYear, month: baseMonth },
    { year: baseMonth === 11 ? baseYear + 1 : baseYear, month: (baseMonth + 1) % 12 },
    { year: baseMonth >= 10 ? baseYear + 1 : baseYear, month: (baseMonth + 2) % 12 }
  ];
}

// AFTER: 2 months only
function getCandidateMonths() {
  const today = new Date();
  const baseYear = today.getUTCFullYear();
  const baseMonth = today.getUTCMonth();
  return [
    { year: baseYear, month: baseMonth },
    { year: baseMonth === 11 ? baseYear + 1 : baseYear, month: (baseMonth + 1) % 12 },
  ];
}
```

### Part C: Property Deletion Cascade

In `account-wipe.ts`, the "delete all properties" function needs to cascade properly. The order matters due to foreign key constraints:

```typescript
// 1. Get all property IDs for this owner
// 2. Get all unit IDs for those properties
// 3. Get all lease IDs for those units
// 4. Delete rent_charges WHERE lease_id IN (lease IDs)
// 5. Delete leases WHERE unit_id IN (unit IDs)
// 6. Delete maintenance_tickets WHERE property_id IN (property IDs)
// 7. Delete expenses WHERE property_id IN (property IDs)
// 8. Delete property_managers WHERE property_id IN (property IDs)
// 9. Delete units WHERE property_id IN (property IDs)
// 10. Delete properties WHERE id IN (property IDs)
```

Use the admin/service-role client for this cascade to bypass RLS.

### Part D: Lease Creation First Charge

This doesn't require code changes to lease creation — the charge generator fix in Part A handles it. When the cron runs, it will correctly skip due dates before the lease was created.

However, if the lease creation action has any inline charge generation (check first), apply the same filter there.

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] `getCandidateMonths()` returns exactly 2 months (current + next), not 3
2. [ ] Charges are never generated for due dates before the lease's `created_at` date
3. [ ] Lease created March 22 with due_day=1 gets first charge April 1
4. [ ] Lease created March 22 with due_day=25 gets first charge March 25
5. [ ] Lease created March 1 with due_day=1 gets first charge March 1
6. [ ] "Delete All Properties" cascades to units, leases, charges, tickets, expenses, managers
7. [ ] No orphaned records after property deletion
8. [ ] Duplicate charge prevention still works
9. [ ] 5+ unit tests passing for charge generation logic
10. [ ] `npm run gate:web` passes
11. [ ] No regressions to existing charge or payment functionality

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
CANDIDATE_MONTHS: 2 | 3
BACKDATE_PREVENTION: working | broken
CASCADE_DELETE: working | broken
TESTS_UNIT: xxx/xxx
NOTES: [any issues]
```

## 10. Constraints

- Do NOT create database migrations
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT modify E2E test files
- Do NOT install new npm dependencies
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Do NOT change the cron route structure
- Do NOT modify payment processing or Stripe integration
- The duplicate prevention logic must remain intact
- The charge generation must still work correctly for leases that span month boundaries
