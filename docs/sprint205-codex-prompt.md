# Sprint 205 — Client accounts groundwork (L3: schema + authorization) · Category 3 (Manager)

## 1. Objective
Backend groundwork so a manager (Alia) can run homes for owners who are **not** on Domus (design: `docs/manager-client-accounts-design.md` rev 3, owner decisions §9). **No new screens in this sprint.** It must not change any access that exists today for owners, managers or tenants on normal (non-client) homes.

## 2. Context (verified live 2026-10-08)
- **Migration (Claude applies before deploy; Codex must not touch the DB):** `supabase/migrations/20261008_sprint205_client_accounts.sql`:
  - `properties.owner_profile_id` becomes nullable;
  - `ownership_accounts` gains `managed_client`, `claim_state` (`claimed`|`unclaimed`), `client_contact_email`, `claimed_at`, `claimed_by_profile_id`, plus a check that only managed clients can be unclaimed;
  - new table `ownership_account_managers(account_id, manager_profile_id, manager_role, active, created_at)` (RLS: a manager can read their own rows; writes service role only);
  - two service-role-only SQL functions: `create_client_account(p_manager, p_account_type, p_client_name, p_client_email) → account id`, and `add_client_home(p_manager, p_account, p_name, p_address_line1, p_city, p_state, p_postal_code, p_property_type) → property id`. The latter locks the account row, requires an unclaimed client account plus an active manager link, inserts the property with `owner_profile_id = NULL`, and creates the derived `property_managers` row.
- **Why the RLS doesn't need rewriting now (map, 2026-10-08):** about 90 policies check access; 35 use `properties.owner_profile_id = auth.uid()` and the rest use `can_administer_property(property_id)` (owner membership of the account **or** an active `property_managers` row) or `can_view_property` (`can_administer_property` or the tenant's active lease). For client homes, `owner_profile_id IS NULL`, so all 35 owner policies **fail closed**, and the manager reaches the home only through the same `property_managers` branch managers use today. Owner-only data (tax inputs, Sprint 202) requires `owner` **membership**, which a client account doesn't have. Keep that reasoning true; don't add new owner_profile_id-based grants.
- App code reading `properties.owner_profile_id`: `lib/property-access.ts` (type `owner_profile_id: string` at l.13; queries at ~30, ~44), `lib/stripe-connect.ts` (~83, ~334–340), `lib/manager-payments-data.ts` (~36, ~121, ~322, ~339), `lib/notification-preference-store.ts` (~106–134). (`vendors.owner_profile_id` and `document_templates.owner_profile_id` are different columns on other tables; leave them.)
- Today `createProperty` (`app/actions/properties.ts`) for a manager with no `ownerAccountId` auto-creates a personal account owned by the manager. **Leave that path unchanged in this sprint**; Sprint 206 replaces the manager add-home UI.
- Rent for client homes is **outside Domus** in v1 (owner decision). `leases.collects_outside_domus` exists.

## 3. In scope
1. **Types and null safety.** Update the DB types (if the repo keeps generated types) and every reader of `properties.owner_profile_id` to accept `null` without crashing or granting anything. A null owner must never match a user id. Add a test per reader with a null-owner property.
2. **Client helpers** `apps/web/lib/client-accounts.ts` (`import "server-only"`):
   - `isClientAccount(accountId)` → `{ managedClient, claimState }` (explicit columns, error checked).
   - `isActiveClientManager(userId, accountId)` → boolean (from `ownership_account_managers`, `active = true`).
   - `listClientAccountsForManager(userId)` → `[{ id, name, accountType, claimState, homeCount }]` (explicit columns; only the caller's active links).
3. **Server actions** `apps/web/app/actions/client-accounts.ts` (`"use server"`, `requireAuth("manager")`, rate limits 20/h create, 60/h home):
   - `createClientAccount(prev, formData)`: Zod `{ accountType: "individual"|"llc", clientName: 1–120 chars, clientEmail?: email }` → `admin.rpc("create_client_account", …)` with `p_manager = user.id`. Strings: success `Client added.`; failures `Could not add the client. Please try again.` / `Too many requests. Please try again later.`
   - `addClientHome(prev, formData)`: Zod `{ accountId: uuid, name, addressLine1, city, state (2 letters), postalCode, propertyType? }` → first `isActiveClientManager(user.id, accountId)` (else `You can't add homes for this client.`), then `admin.rpc("add_client_home", …)`. Success `Home added.`; failure `Could not add the home. Please try again.`
   - Both: `revalidatePath("/manager")`; every error checked; list every returned string (L-020).
4. **Outside-Domus default.** Wherever a lease is created (find the create-lease action(s)), if the property's account has `managed_client = true` and `claim_state = 'unclaimed'`, force `collects_outside_domus = true` server-side (ignore the form value). Test.
5. **Stripe blocked for unclaimed clients (server-side):** refuse, with `Online payments aren't available for this home yet.`, in Stripe Connect onboarding/link creation for an unclaimed client account; card/ACH checkout (`lib/charge-checkout.ts` `prepareCheckoutContext`) for a charge whose property is in an unclaimed client account; autopay setup for such a lease; payouts/distributions/withdrawals for such an account. Find each entry point (grep `stripe` server actions); add the check close to the start; a test per entry point.
6. **Owner-only stays closed (tests, not new code):** with a client account fixture, assert a manager linked to it gets `false` from `canUserAdministerOwnershipAccount` for owner-only uses (tax summary/inputs, bank feed, payouts, LLC votes, account wipe/transfer) and that `getTaxSummaryReport` returns no client homes for them.
7. **Unchanged access (regression tests):** for a normal owner home: owner, assigned manager and tenant results from `canUserAdministerProperty` / property listing helpers are identical to before (pin current behavior first, then change code).
8. **Cross-client isolation (tests):** manager A with client X and manager B with client Y: `listClientAccountsForManager` returns only their own; `addClientHome` by B into X is refused and writes nothing; the property listing helpers for A never include Y's homes.

## 4. Out of scope
Any UI or screen (Sprint 206); owner statements (207); claim (208); rewriting existing RLS policies or `can_administer_property`; changing `createProperty`'s manager path; notifications (OFF); applying the migration.

## 5. Exact files expected to change
New: `apps/web/lib/client-accounts.ts`, `apps/web/app/actions/client-accounts.ts`, tests. Changed: `apps/web/lib/property-access.ts`, `apps/web/lib/stripe-connect.ts`, `apps/web/lib/manager-payments-data.ts`, `apps/web/lib/notification-preference-store.ts`, the lease-create action(s), `apps/web/lib/charge-checkout.ts`, the autopay setup action, the payout/distribution/withdrawal entry points, the validations module (Zod), the DB types file if any. List every file.

## 6. Implementation requirements
Exact strings; sentences ≤ 12 words; plain-language guard passes. Every Supabase result checked; explicit column lists. Lines ≤ 140; files ≤ 500; no new dependencies; no `eslint-disable`. Owner/manager/tenant behavior on non-client homes unchanged.

## 7. Validation commands to run
`npm run lint:web`; `npx tsc --noEmit -p apps/web/tsconfig.json`; new tests + every test importing a changed file; `lib/__tests__/plain-language.test.ts`; `npm run build --workspace @domus/web`.

## 8. Acceptance criteria (binary)
1. Null `owner_profile_id` is handled everywhere it's read and never grants access.
2. Managers can create a client account and add homes to their own client accounts only; homes get `owner_profile_id = NULL` and a `property_managers` row; another manager is refused with no write.
3. Leases on unclaimed client homes are always "outside Domus"; every Stripe entry point refuses unclaimed client homes/accounts.
4. Owner-only features stay closed to client managers; non-client access is unchanged (pinned tests).
5. All tests are real assertions; lint, typecheck, guard and build pass; only listed files changed.

## 8b. Post-deploy (Claude)
Apply the migration and verify (columns, check constraint, RLS on the new table, function grants service-role only). In SQL as the service role: create a test client account for the smoke manager plus one home; simulate the smoke manager (`set role authenticated`, JWT sub) and confirm they can see it through existing policies and **cannot** see/insert `property_tax_years` for it; simulate the smoke owner and confirm they can't see it; then delete the test client data. Smoke 3 roles, CI, Sentry.

## 9. Report format
JSON per `docs/codex-report-schema.json`; list every Stripe entry point guarded and every owner_profile_id reader changed. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB access or migration apply, no deploy, commit or push. Never touch `.claude/launch.json`. Notifications stay OFF.
