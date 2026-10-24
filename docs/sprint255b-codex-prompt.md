# Sprint 255b — Account wipe covers vendors and every table that could block it (L3: deletion) — rev 1

## 1. Objective
Sprint 255a made every wipe one transaction. Claude's live-schema audit (2026-10-23) found what the wipe still misses:
1. **Vendors are never deleted.** Today's op `deleteIn("vendors", "property_id", …)` targets a column that does not
   exist (`vendors` is keyed by `owner_account_id` / `owner_profile_id`), so the database skips it. "Delete All
   Properties … and vendors" and the full wipe leave vendors behind (2 live rows today).
2. **Tables that would block a wipe if they had rows** (all 0 rows today; no app code reads or writes them):
   `inspections.lease_id → leases` (NO ACTION), `documents.lease_id / unit_id / property_id` (NO ACTION),
   `communication_logs.unit_id / property_id` (NO ACTION). With 255a a blocked wipe fails safely (nothing deleted),
   but the owner could never wipe.
3. **Vendor references:** `maintenance_assignments.vendor_id → vendors` is RESTRICT and
   `preventive_maintenance_schedules.assigned_vendor_id → vendors` is NO ACTION, so those rows must go first.

## 2. Context
- HEAD: see `git log -1`. Files: `app/actions/account-wipe.ts` (façade, six actions), `lib/account-wipe/scope.ts`
  (`loadDeletionScope`, `DeletionScope`), `lib/account-wipe/mutations.ts` (plan builder, `applyWipePlan`,
  `validateWipeRpcResult`), tests `app/actions/__tests__/account-wipe.test.ts`, `lib/__tests__/account-wipe-plan.test.ts`.
- **Database (Claude applies before deploy; do not edit SQL):** `supabase/migrations/20261104_sprint255b_account_wipe_
  allowlist.sql` adds to the allowlist: `vendors.id`, `maintenance_assignments.vendor_id`,
  `preventive_maintenance_schedules.property_id|assigned_vendor_id`, `documents.lease_id|property_id|unit_id`,
  `inspections.lease_id`, `communication_logs.property_id|unit_id`. `vendors.property_id` stays allowed (skipped) so
  the live 255a code keeps working until this ships. Rolled-back dry run passed: deleting a referenced vendor first →
  `23503` and the whole call rolls back; assignments → schedules → vendor deletes 1/1/1.
- Positions today: `deleteAllProperties` vendors op `account-wipe.ts:75`, leases/units/properties `:83-85`;
  `fullAccountWipe` vendors `:309`, leases/units `:326-327`, properties `:329`; `deleteAllLeases` leases `:229`;
  `deleteAllTenants` leases `:160`. `inspection_items` cascades from `inspections`; `preventive_maintenance_schedules`
  cascades from `properties` (but must still go before vendors).
- `documents.storage_path` has no bucket used by the app (no code path); delete rows only, no storage removal.

## 3. In scope
1. `DeletionScope` gains `vendorIds: string[]`: ids of vendors with `owner_account_id` in `accountIds`, plus vendors
   with `owner_profile_id = userId` **and** `owner_account_id is null` (legacy personal vendors). Two reads with
   `selectRows`, unique, inside `loadDeletionScope` (no query in a loop).
2. `deleteAllProperties` and `fullAccountWipe`: replace the `vendors`/`property_id` op **at the same position** with,
   in this order: `maintenance_assignments` by `vendor_id` ∈ `vendorIds` ("Delete vendor assignments"),
   `preventive_maintenance_schedules` by `assigned_vendor_id` ∈ `vendorIds` ("Delete vendor maintenance schedules"),
   `vendors` by `id` ∈ `vendorIds` ("Delete vendors"). Then, immediately **before** the existing `leases` delete:
   `inspections` by `lease_id` ∈ `leaseIds` ("Delete lease inspections"), `documents` by `lease_id` ∈ `leaseIds`
   ("Delete lease documents"); immediately **before** the existing `units` delete: `documents` by `unit_id` ("Delete
   unit documents"), `communication_logs` by `unit_id` ("Delete unit communication logs"); immediately **before** the
   existing `properties` delete: `preventive_maintenance_schedules` by `property_id` ("Delete property maintenance
   schedules"), `documents` by `property_id` ("Delete property documents"), `communication_logs` by `property_id`
   ("Delete property communication logs"). All via `plan.deleteIn` (empty arrays add nothing).
3. `deleteAllLeases` (scope `leaseIds`) and `deleteAllTenants` (its `tenantLeaseIds`): immediately before their
   `leases` delete add `inspections` by `lease_id` and `documents` by `lease_id` (same labels as above).
4. `validateWipeRpcResult`: **no** skip is allowed any more (remove the vendors/property_id exception) — any
   `skipped: true` fails validation.

## 4. Out of scope
The SQL files. `deleteAllManagers`, `deleteAllFinancialData`. UI copy. Storage for `documents`. Vendor rows of
accounts the owner does not administer.

## 5. Exact files expected to change
- `apps/web/lib/account-wipe/scope.ts`, `apps/web/lib/account-wipe/mutations.ts`, `apps/web/app/actions/account-wipe.ts`
- `apps/web/app/actions/__tests__/account-wipe.test.ts`, `apps/web/lib/__tests__/account-wipe-plan.test.ts`

## 6. Implementation requirements
- **Order proof.** Update the literal trace arrays only by the exact insertions/replacement in §3 (fixture: one
  account vendor `vendor-1` and one legacy personal vendor `vendor-legacy`). Report a diff of each literal array vs
  HEAD; Claude checks that every changed line is one of the §3 entries at its stated position and nothing else moved.
- No `expect` inside mocks (L-028). Exact copy with `toEqual`. Lines ≤ 140 characters. L-002: both new reads checked.
- Undo: none by design (owner typed DELETE); safety is the single transaction.

## 7. Validation
```
cd apps/web
npx vitest run app/actions/__tests__/account-wipe.test.ts lib/__tests__/account-wipe-plan.test.ts lib/__tests__/account-wipe-split.test.ts
npx tsc --noEmit
```
then from the repo root `npm run gate:web`.

## 8. Acceptance criteria
- V1 `loadDeletionScope` returns `vendorIds` = account vendors ∪ legacy personal vendors (unique); the two reads have
  the exact filters (`owner_account_id in accountIds`; `owner_profile_id = userId` and `owner_account_id is null`);
  empty `accountIds` → only the legacy read result.
- V2 `deleteAllProperties` and `fullAccountWipe` literal traces contain the §3 entries at the stated positions, and no
  `vendors`/`property_id` op remains anywhere.
- V3 `deleteAllLeases` and `deleteAllTenants` traces contain the two lease-linked deletes right before `leases`.
- V4 `deleteAllManagers` and `deleteAllFinancialData` traces are byte-identical to HEAD.
- V5 `validateWipeRpcResult` rejects any `skipped: true` entry (including a vendors one) → `rpc_result_unknown`, no
  storage removal.
- V6 All 255a tests (A1–A8) still pass, updated only by the §3 insertions.
- V7 Gate green (counts verbatim).

## 9. Report format
Compact status only: V1–V7 → test names, per-array diff summary, counts. Do NOT include 'Claude prompt' or
'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
Stay inside §5. Do not commit. Never run a wipe against a real database. Claude applies the migration first (superset,
safe for the live 255a code), verifies body md5 and grants, deploys, runs a read-only Account & Data walk and a
service-role no-op plan using every new table/column (rows 0). Rollback: redeploy 255a, then re-run the 255a migration
verbatim (`supabase/rollback/20261104_sprint255b_account_wipe_allowlist_rollback.sql`).
The user should never need to read instructions to complete this flow (no UI change).
