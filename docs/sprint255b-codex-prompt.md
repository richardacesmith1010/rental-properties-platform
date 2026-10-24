# Sprint 255b — Account wipe: safe scope (sole-owner accounts only), vendors, and every blocking table (L3: deletion) — rev 2 (rev 1 AWC)

## 1. Objective
Sprint 255a made every wipe one transaction. Claude's live-schema audit (2026-10-23) found three remaining problems:
1. **Scope can reach other owners' data (security, pre-existing).** `loadDeletionScope` takes `accountIds` from
   `getAdministeredOwnerAccountIds` and `propertyIds` from `getAdministeredPropertyIds`
   (`lib/property-access.ts:84-130, 297-319`). Both include properties the user only **manages**
   (`property_managers`), and both include **shared** ownership accounts where other people are also active owners.
   A co-owner running "Delete All Properties" or the full wipe would delete the shared account's homes, leases and
   money records for everyone. Live: 1 shared owner account exists; 0 owner profiles are assigned as managers.
2. **Vendors are never deleted.** The op `deleteIn("vendors", "property_id", …)` targets a column that does not
   exist (vendors are keyed by `owner_account_id` / `owner_profile_id`), so it is always skipped (2 live rows).
3. **Tables that would block a wipe** (0 rows today, no app code uses them): `inspections.lease_id`,
   `documents.lease_id|unit_id|property_id`, `communication_logs.unit_id|property_id` (NO ACTION), and
   `preventive_maintenance_schedules.assigned_vendor_id → vendors` (NO ACTION; the schedule itself cascades from its
   property).

## 2. Context
- HEAD: see `git log -1`. Files: façade `app/actions/account-wipe.ts`, `lib/account-wipe/scope.ts`,
  `lib/account-wipe/mutations.ts`; tests `app/actions/__tests__/account-wipe.test.ts`, `lib/__tests__/account-wipe-plan.test.ts`.
- **Claude decision (recorded in the handoff):** destructive scope = **sole-owner accounts only**. An account is
  wipe-eligible when the user has an active `ownership_account_members` row with `member_role = 'owner'` **and** no
  other profile has an active owner membership in it. `propertyIds` = properties whose `owner_account_id` is
  wipe-eligible. Manager assignments never add anything. For a shared account the full wipe only removes the user's
  own membership (today's `ownership_account_members` eq `profile_id` op); nothing else of that account is touched.
- **Catalog audit (Claude, live):** every incoming RESTRICT/NO ACTION foreign key into a wiped table has its child
  table inside the wipe (15 constraints: `document_packets.template_id`, `documents.*`, `inspections.lease_id`,
  `leases.renewed_from_lease_id`, `leases.unit_id`, `payment_distributions.account_id`, `properties.owner_account_id`,
  `communication_logs.*`, `maintenance_tickets.property_id|unit_id`, `maintenance_assignments.vendor_id`,
  `preventive_maintenance_schedules.assigned_vendor_id`).
- **Vendor children are never deleted by vendor id.** Assignments go only through the owner's own tickets (existing
  `maintenance_assignments` by `ticket_id` in `deleteMaintenance`), schedules only through the owner's own properties.
  If anything outside the scope still references a vendor, the vendor delete fails (`23503`) and the whole wipe rolls
  back — nothing outside the scope is ever deleted.
- **Database (Claude applies before deploy; do not edit SQL):** `supabase/migrations/20261104_sprint255b_account_wipe_
  allowlist.sql` adds `vendors.id`, `preventive_maintenance_schedules.property_id`, `documents.lease_id|property_id|
  unit_id`, `inspections.lease_id`, `communication_logs.property_id|unit_id`; keeps `vendors.property_id` (skipped) so
  the live 255a code keeps working. Rolled-back dry runs with synthetic rows: populated 13-step chain (assignment by
  ticket → ticket → schedule by property → vendor → inspection → lease document → lease → unit document → unit log →
  unit → property document → property log → property) deleted 1 row each, 0 left over; a vendor referenced by an
  out-of-plan ticket → `23503`, reference and vendor kept.
- Positions today: `deleteAllProperties` vendors op `account-wipe.ts:75`, leases/units/properties `:83-85`;
  `fullAccountWipe` vendors `:309`, leases/units `:326-327`, properties `:329`; `deleteAllLeases` leases `:229`;
  `deleteAllTenants` leases `:160`. `documents.storage_path` has no bucket used by the app: delete rows only.

## 3. In scope
1. **Scope (scope.ts).** Replace the two `getAdministered*` calls in `loadDeletionScope` with: read the user's active
   owner memberships (`ownership_account_members`: `profile_id = userId`, `member_role = 'owner'`, `active = true`),
   then all active owner memberships of those accounts (`account_id in …`, `member_role = 'owner'`, `active = true`);
   `accountIds` = accounts whose only active owner is the user; `propertyIds` = `properties.id` with
   `owner_account_id in accountIds`. Add `sharedAccountIds` (excluded accounts) to `DeletionScope` for logging only.
   Every other scope read is unchanged (it already derives from `accountIds` / `propertyIds`). Check every read error.
2. **Vendors.** Add `vendorIds` to `DeletionScope`: vendors with `owner_account_id in accountIds`, plus vendors with
   `owner_profile_id = userId` and `owner_account_id is null` (legacy personal). In `deleteAllProperties` and
   `fullAccountWipe`, replace the `vendors`/`property_id` op **at its position** with
   `preventive_maintenance_schedules` by `property_id` ∈ `propertyIds` ("Delete property maintenance schedules") then
   `vendors` by `id` ∈ `vendorIds` ("Delete vendors"). No op filters by `vendor_id` or `assigned_vendor_id`.
3. **Blocking tables.** In `deleteAllProperties` and `fullAccountWipe`, immediately **before** the existing `leases`
   delete: `inspections` by `lease_id` ("Delete lease inspections"), `documents` by `lease_id` ("Delete lease
   documents"); immediately **before** `units`: `documents` by `unit_id` ("Delete unit documents"),
   `communication_logs` by `unit_id` ("Delete unit communication logs"); immediately **before** `properties`:
   `documents` by `property_id` ("Delete property documents"), `communication_logs` by `property_id` ("Delete property
   communication logs"). In `deleteAllLeases` and `deleteAllTenants`, immediately before their `leases` delete:
   `inspections` and `documents` by `lease_id` (same labels). All via `plan.deleteIn` (empty arrays add nothing).
4. **Skips.** A valid success reply containing `{ label, skipped: true }` proves the function ran and committed (the
   table/column does not exist, so there was nothing to delete). Treat it as success, log one
   `sideEffectError(plan.action, "committed_with_skip")` per call, and continue with storage cleanup. Remove the
   vendors-only skip exception from `validateWipeRpcResult` (any op may skip; shape rules stay).

## 4. Out of scope
The SQL files. UI copy (a follow-up may explain shared accounts on the Account & Data page). `deleteAllManagers` /
`deleteAllFinancialData` op lists (their scope change comes from §3.1 only). Storage for `documents`.

## 5. Exact files expected to change
- `apps/web/lib/account-wipe/scope.ts`, `apps/web/lib/account-wipe/mutations.ts`, `apps/web/app/actions/account-wipe.ts`
- `apps/web/app/actions/__tests__/account-wipe.test.ts`, `apps/web/lib/__tests__/account-wipe-plan.test.ts`,
  `apps/web/lib/__tests__/account-wipe-scope.test.ts` (new)

## 6. Implementation requirements
- **Order proof.** Update the literal trace arrays only by the §3.2–3.3 insertions/replacement. Report a per-array
  diff vs HEAD; Claude checks that every changed line is a §3 entry at its stated position and nothing else moved.
- No `expect` inside mocks (L-028). Exact copy with `toEqual`. Lines ≤ 140 characters. L-002: every new read checked.
- Do not change `lib/property-access.ts` (other features use it).
- Undo: none by design (owner typed DELETE); safety is the single transaction plus the narrowed scope.

## 7. Validation
```
cd apps/web
npx vitest run app/actions/__tests__/account-wipe.test.ts lib/__tests__/account-wipe-plan.test.ts \
  lib/__tests__/account-wipe-split.test.ts lib/__tests__/account-wipe-scope.test.ts
npx tsc --noEmit
```
then from the repo root `npm run gate:web`.

## 8. Acceptance criteria
- S1 Scope (`account-wipe-scope.test.ts`, fake admin): user sole owner of `acct-solo`, co-owner of `acct-shared`
  (another active owner), inactive owner of `acct-old`, and assigned as manager to a property of `acct-other` →
  `accountIds = ["acct-solo"]`, `sharedAccountIds = ["acct-shared"]`, `propertyIds` = only `acct-solo`'s properties;
  nothing from `acct-shared`, `acct-old` or `acct-other` appears in any id list. Exact filters asserted.
- S2 Shared-account full wipe: the RPC plan contains no op whose values include any id of `acct-shared` or its
  properties, and does contain `ownership_account_members` eq `profile_id = userId`.
- S3 `vendorIds` = account vendors of `acct-solo` ∪ legacy personal vendors (`owner_profile_id = userId` and
  `owner_account_id is null`); a vendor of `acct-shared` and a vendor of another profile are excluded; empty and
  duplicate cases tested.
- S4 `deleteAllProperties` and `fullAccountWipe` traces contain the §3.2–3.3 entries at the stated positions; no op
  filters by `property_id` on `vendors`, `vendor_id`, or `assigned_vendor_id` anywhere.
- S5 `deleteAllLeases` / `deleteAllTenants` traces contain the two lease-linked deletes right before `leases`;
  `deleteAllManagers` / `deleteAllFinancialData` op lists are byte-identical to HEAD apart from scope-derived values.
- S6 A valid reply with a `skipped: true` entry → success message, storage cleanup runs, one `committed_with_skip`
  log; malformed replies (wrong count, wrong label, `rows: -1`, both `rows` and `skipped`) → `rpc_result_unknown`.
- S7 All 255a tests (A1–A8) still pass, changed only by the §3 insertions and scope fixtures.
- S8 Gate green (counts verbatim).

## 9. Report format
Compact status only: S1–S8 → test names, per-array diff summary, counts. Do NOT include 'Claude prompt' or
'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
Stay inside §5. Do not commit. Never run a wipe against a real database. Before deploy Claude (1) applies the
migration (superset, safe for the live 255a code) and checks body md5 + grants, (2) runs a fail-closed compatibility
check that every table/column in the 255b plans exists live (catalog query; any missing → stop), then deploys and runs
a read-only Account & Data walk and a service-role no-op plan touching every new table/column (rows 0, no skips).
Rollback: redeploy 255a, confirm the alias, then re-run the 255a migration verbatim
(`supabase/rollback/20261104_sprint255b_account_wipe_allowlist_rollback.sql`).
The user should never need to read instructions to complete this flow (no UI change).
