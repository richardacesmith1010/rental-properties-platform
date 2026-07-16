# Sprint 113 — Remove Deprecated `properties.management_fee_cents` Column

## Objective

Eliminate the legacy manager fee storage in `properties.management_fee_cents`. Sprint 98 made `manager_payment_configs` the single source of truth, but the column was kept as a fallback for backward compatibility. Now we migrate any remaining data and drop the column entirely — eliminating one source of confusion and preventing future bugs where someone updates the wrong place.

## Context

- Branch: `main`
- HEAD: post-Sprint 112
- Sprint 98 introduced `manager_payment_configs` as the source of truth and added fallback reads from `properties.management_fee_cents` when no config exists
- Live data: 2 demo properties still rely on the legacy column with no `manager_payment_configs` row:
  - Riverside Apartments (`07ed1466-9b55-4181-8e36-7f1466eb842e`): `management_fee_cents = 12000`, manager: Jordan Kim
  - Oak Park Duplex (`daf1d3d7-1424-4bf0-be2e-d3be42ac2d25`): `management_fee_cents = 9000`, manager: Jordan Kim

We need to:
1. Backfill `manager_payment_configs` for any property with non-null/non-zero `management_fee_cents` and no active config
2. Remove fallback reads in code
3. Drop the column

### Where the Column Is Read

- `apps/web/lib/payment-fees.ts` → `getManagerFeeForProperty` (Sprint 98) — fallback path
- `apps/web/lib/stripe-connect.ts` → `getManagerStripeAccountForProperty` indirectly via `getManagerFeeForProperty`
- Possibly other read sites — Codex must grep the entire `apps/web/` tree

### Backfill Strategy

For each property where `management_fee_cents IS NOT NULL AND management_fee_cents > 0` AND there's no active `manager_payment_configs` row:
- Find the active manager via `property_managers` (where `active = true`, take most recent if multiple)
- If a manager exists: create a `manager_payment_configs` row with `payment_type = 'flat'`, `flat_amount_cents = management_fee_cents`, `manager_profile_id = <found>`, `label = 'Property Management Fee'`, `active = true`
- If NO manager exists: skip that property (legacy fee was inactive anyway — no one to pay)

## In Scope

1. Migration that backfills `manager_payment_configs` from legacy column
2. Migration that drops the `management_fee_cents` column from `properties`
3. Code cleanup: remove fallback reads in `payment-fees.ts` and any other location
4. Tests covering the cleaned-up paths

## Out of Scope

- Other columns or schema changes
- New features
- UI changes
- Anything related to autopay, distributions, or transfers
- Modifying `manager_payment_configs` schema

## Database Migration

**Migration file:** `20260505_sprint113_drop_management_fee_cents.sql`

```sql
-- Step 1: Backfill manager_payment_configs from legacy management_fee_cents
-- Only for properties that have a fee + an active manager + no existing active config
INSERT INTO manager_payment_configs (
  property_id,
  manager_profile_id,
  payment_type,
  flat_amount_cents,
  label,
  active
)
SELECT
  p.id AS property_id,
  pm.manager_profile_id,
  'flat' AS payment_type,
  p.management_fee_cents AS flat_amount_cents,
  'Property Management Fee' AS label,
  true AS active
FROM properties p
JOIN LATERAL (
  SELECT manager_profile_id
  FROM property_managers
  WHERE property_id = p.id
    AND active = true
  ORDER BY created_at ASC
  LIMIT 1
) pm ON TRUE
WHERE p.management_fee_cents IS NOT NULL
  AND p.management_fee_cents > 0
  AND NOT EXISTS (
    SELECT 1 FROM manager_payment_configs mpc
    WHERE mpc.property_id = p.id
      AND mpc.active = true
  );

-- Step 2: Drop the deprecated column
ALTER TABLE properties DROP COLUMN IF EXISTS management_fee_cents;
```

**Verification queries** (Codex should NOT run these in the migration; they're for human verification after apply):

```sql
-- Should return 0 rows after migration
SELECT count(*) FROM information_schema.columns
WHERE table_name = 'properties' AND column_name = 'management_fee_cents';

-- Should show 2 new configs (Riverside + Oak Park)
SELECT property_id, payment_type, flat_amount_cents, label
FROM manager_payment_configs
WHERE label = 'Property Management Fee';
```

## Code Cleanup

### `apps/web/lib/payment-fees.ts` — `getManagerFeeForProperty`

Current implementation (Sprint 98) reads from `manager_payment_configs` first, falls back to `properties.management_fee_cents`. **Remove the fallback entirely.** If no `manager_payment_configs` row exists, return `{ feeCents: 0, managerProfileId: null }`.

Update return type and logic accordingly. The function should now ONLY query `manager_payment_configs`.

### `apps/web/lib/stripe-connect.ts` — `getManagerStripeAccountForProperty`

Verify this function only uses `getManagerFeeForProperty` — it should. If it has any direct read of `management_fee_cents`, remove it.

### Codebase Sweep

Codex MUST grep the entire `apps/web/` tree for:
- `management_fee_cents` (any reference)
- `properties.management_fee_cents`

Every match must be:
- Removed if it's a read of the deprecated column
- Updated if it's reading from the new source (likely already correct)
- Left if it's only in test fixtures (those should also be cleaned up)

### Tests

Update any test that:
- Sets `management_fee_cents` on a property fixture → switch to inserting a `manager_payment_configs` row
- Tests the fallback behavior → remove the test (no fallback exists anymore)

Add a test verifying:
- `getManagerFeeForProperty` returns `{ feeCents: 0, managerProfileId: null }` when no `manager_payment_configs` row exists
- `getManagerFeeForProperty` returns the config-based fee when a row exists

## Validation Commands to Run

```bash
cd /Users/courtneysmith/Documents/Codex/Rental\ Properties
npm run gate:web
```

## Acceptance Criteria

1. [ ] Migration file `20260505_sprint113_drop_management_fee_cents.sql` exists
2. [ ] Migration backfills `manager_payment_configs` for properties with legacy fee + active manager + no existing config
3. [ ] Migration drops `properties.management_fee_cents` column
4. [ ] `apps/web/lib/payment-fees.ts` — `getManagerFeeForProperty` reads ONLY from `manager_payment_configs`
5. [ ] `apps/web/lib/payment-fees.ts` — function returns `{ feeCents: 0, managerProfileId: null }` when no config exists
6. [ ] No code in `apps/web/` reads from `properties.management_fee_cents` (grep returns zero matches)
7. [ ] Test fixtures that set `management_fee_cents` on properties have been updated to insert `manager_payment_configs` rows instead
8. [ ] Test verifying `getManagerFeeForProperty` with no config returns zero fee
9. [ ] Test verifying `getManagerFeeForProperty` with a config returns the configured fee
10. [ ] All existing tests still pass
11. [ ] `gate:web` passes

## Report Format

```
gate:web: PASS | FAIL
migration_file: [name]
files_changed: [list]
acceptance_criteria: [1-11] PASS | FAIL each
notes: (any deviations or questions)
```

## Constraints

- Do NOT remove the column WITHOUT first backfilling configs — the migration must do both in order
- Do NOT modify `manager_payment_configs` schema
- Do NOT add new features
- Do NOT modify autopay, distributions, or transfer logic
- Do NOT change the return signature of `getManagerStripeAccountForProperty` (Sprint 112 already updated it)
- The backfill MUST use the most recent active `property_managers` row when multiple exist for one property
- The backfill MUST skip properties with no active manager (no one to pay)
- Do NOT include "Claude prompt" or recommended next steps sections. Report compact status only.
