# Sprint 205 (rev 3) — Client accounts groundwork (L3: schema + authorization) · Category 3 (Manager)

ChatGPT re-review of rev 2: **APPROVE WITH CHANGES**. All 4 required changes are adopted in rev 3: (1) lock order for manager sync; (2) a membership contract on all client accounts; (3) an executable Stripe call-site inventory; (4) the invitation privilege test. Item 4 was reachable and is fixed in hotfix 205a. Optional items adopted: no claim metadata while unclaimed; `can_administer_property` uses `search_path = ''` and qualified names; failure-injection tests; post-deploy invariant queries.

Rev 1 was rejected by ChatGPT review. Rev 2 moves enforcement into the database: guard triggers and a hardened `can_administer_property`. That layer is already written and was **dry-run against live inside a rollback**, with 37 adversarial checks (see §2). Codex's job is the app layer on top of it.

## 1. Objective
Backend groundwork so a manager (Alia) can run homes for owners who are **not** on Domus. Design: `docs/manager-client-accounts-design.md` rev 3; owner decisions §9. **No new screens.** Access for owners, managers and tenants on normal homes must not change.

## 2. Context (verified live 2026-10-08)
**Migration** (Claude applies before deploy; Codex must not touch the DB): `supabase/migrations/20261008_sprint205_client_accounts.sql`. Read it. Summary:
- `ownership_accounts` gains `managed_client`, `claim_state` (`claimed`|`unclaimed`), `client_contact_email`, `claimed_at`, `claimed_by_profile_id`. Checks:
  - only managed clients can be unclaimed;
  - an unclaimed client has `created_by_profile_id = NULL`;
  - an unclaimed client has no `stripe_account_id`, Plaid token or item, or `join_code`.
- New table `ownership_account_managers(account_id, manager_profile_id, manager_role creator|manager, active, created_at, updated_at)`. This is the **only** source of manager authority for client accounts. RLS lets a manager read their own rows; all writes go through the service role.
- `properties.owner_profile_id` is nullable. A trigger allows NULL **only** for homes in an unclaimed client account, and then requires it.
- **Guard triggers** apply to every role, including the service role, unless the write comes from the client functions:
  - property ownership columns are read-only for users on **all** homes (this closes a live hole: today an assigned manager can rewrite `owner_profile_id`);
  - `property_managers` rows for client homes are derived and change only through the client functions or the sync trigger;
  - client flags and claim fields on `ownership_accounts` change only through the client functions;
  - no `ownership_account_members` rows on an unclaimed client;
  - no manager or owner `invitations` into unclaimed client homes or accounts (tenant invitations are allowed);
  - leases on unclaimed client homes are forced to `collects_outside_domus = true`;
  - deactivating an `ownership_account_managers` link deactivates that manager's derived `property_managers` rows.
- `can_administer_property` (manager branch): a client home also needs an active `ownership_account_managers` link. Branches 1 and 3 are unchanged. Branch 3, the creator branch, fails closed for clients because their creator field is NULL.
- Service-role-only functions:
  - `create_client_account(p_manager, p_account_type, p_client_name, p_client_email) → uuid`;
  - `add_client_home(p_manager, p_account, p_name, p_address_line1, p_city, p_state, p_postal_code, p_property_type) → uuid`.

  Both validate their inputs (errcode `22023`) and the manager (`42501`). `add_client_home` locks the account row and requires an unclaimed client plus an active link.
- **Dry-run results:** every guard fired, normal-home owner and manager access was unchanged, and same-manager multi-client isolation held (deactivating client A kept client B). Script: `supabase/tests/sprint205_client_accounts_test.sql`.

**Authorization map** (55 policies use `can_administer_property`/`can_view_property`). A client manager reaches client homes only through the manager branch, the same way managers reach normal homes today. Classification:

| Class | Tables (policies) | Client manager | How it's enforced |
|---|---|---|---|
| Operations | units, leases (insert/update), maintenance_* (6), inspections(+items), preventive_maintenance_schedules, rent_increase_history, inbox_threads, message_deliveries, communication_logs, document_packets/signers, property_files, rental_listings/applications, application_events, screening_reports, automation_rules/runs, audit_logs (select) | ✅ like managers today | existing RLS |
| Money records (outside Domus) | rent_charges (insert/update), property_expenses (4) | ✅ (marking paid, expenses) | existing RLS; Stripe is blocked separately |
| Lease money mode | leases | forced "outside Domus" | trigger |
| Ownership/authority | properties.update (ownership columns), property_managers (insert/update) | ❌ | triggers |
| Invitations | invitations_insert_admin_v2 | tenants only | trigger |
| Owner-only | property_tax_years, ownership_account_members, ownership_accounts update, Stripe/Plaid columns | ❌ | owner-membership RLS + triggers + checks (dry-run T7/T8/T11/T15) |

**Invitations (fixed by hotfix `20261008_sprint205a_invitations_lockdown.sql`, applied before this sprint).** Tested live in a rollback: a signed-in owner could insert owner, manager or tenant invitations for **any** account or home. `handle_new_user()` turns pending owner/manager invitations into memberships or manager rows at signup, so this allowed a takeover. Writes to `invitations` are now service-role only, and all app writes already use the admin client. No abuse found: only 5 invitations exist, all tenant, all from authorized inviters.

**Locking contract.** Every change to client manager authority (`add_client_home`, the sync trigger on `ownership_account_managers`, the future claim function) locks the `ownership_accounts` row **first**. **Membership contract:** on any managed-client account, claimed or not, `ownership_account_members` rows can be created or changed only by the controlled client functions. The v1.1 claim function will create the first owner membership atomically with the claim. Generic paths can never grant owner authority on a client account: join code, `inviteOwner`, the creator policy, `handle_new_user`.

**App code facts:**
- Most writes use the admin (service-role) client, so the triggers apply to them. Any app path that tries a blocked write will get a Postgres error, so it must **pre-check and refuse cleanly before** any side effect such as an email or a Stripe call.
- Readers of `properties.owner_profile_id`: `lib/property-access.ts` (type at l.13, queries ~30/~44), `lib/stripe-connect.ts` (~83, ~334–340), `lib/manager-payments-data.ts` (~36, ~121, ~322, ~339), `lib/notification-preference-store.ts` (~106–134). (`vendors`/`document_templates.owner_profile_id` are other tables; leave them.)
- `canUserAdministerOwnershipAccount` (`lib/ownership.ts:543`) returns true for any active member **or the creator**. For client accounts the creator is NULL, so it returns false for the client manager. **Keep it that way**: it guards owner-level actions.
- Stripe entry points: `app/actions/connect.ts`, `app/actions/charges.ts` + `lib/charge-checkout.ts`, `app/actions/autopay.ts` + `lib/stripe-autopay.ts` + `lib/autopay.ts` (scheduled autopay), `app/actions/withdrawals.ts` + `lib/withdrawals.ts`, `lib/distributions.ts`.
- `createProperty` (`app/actions/properties.ts`) for a manager without `ownerAccountId` auto-creates a personal account. **Leave unchanged** (Sprint 206).

## 3. In scope
1. **Central helper** `apps/web/lib/client-accounts.ts` (`import "server-only"`, admin client, explicit columns, every error checked and **thrown**, never treated as "not a client"):
   - `getClientState(accountId)` → `{ managedClient, claimState } | null`.
   - `getClientStateForProperty(propertyId)` → same, via `properties.owner_account_id`.
   - `isUnclaimedClientProperty(propertyId)` / `isUnclaimedClientAccount(accountId)` → boolean.
   - `isActiveClientManager(userId, accountId)` → boolean (`ownership_account_managers`, `active = true`).
   - `listClientAccountsForManager(userId)` → `[{ id, name, accountType, claimState, homeCount }]`, only the caller's active links. Count homes with one batched query, not one per client.
   - Every guard below uses these helpers, never ad-hoc queries.
   - **Failure-injection tests:** a DB error in each helper throws. It is never read as "not a client". For Connect, checkout and scheduled autopay, a helper error means no Stripe call.
2. **Server actions** `apps/web/app/actions/client-accounts.ts` (`"use server"`, `requireAuth("manager")`, rate limits 20/h create and 60/h home):
   - `createClientAccount(prev, formData)`. Zod: `{ accountType: "individual"|"llc", clientName: trimmed 1–120, clientEmail?: email ≤ 254 }`. Calls `admin.rpc("create_client_account", …)` with `p_manager = user.id`.
   - `addClientHome(prev, formData)`. Zod: `{ accountId: uuid, name 1–120, addressLine1 1–200, city 1–100, state /^[A-Za-z]{2}$/, postalCode /^\d{5}(-\d{4})?$/, propertyType? (the 6 allowed values) }`. First check `isActiveClientManager(user.id, accountId)`; if false, return `You can't add homes for this client.` with **no RPC call**. Then call `admin.rpc("add_client_home", …)`.
   - Strings, the complete list (L-020):
     - success: `Client added.` / `Home added.`;
     - Postgres `22023`: `Please check the details and try again.`;
     - `42501`: `You can't add homes for this client.` (home) / `Could not add the client. Please try again.` (client);
     - any other error: `Could not add the client. Please try again.` / `Could not add the home. Please try again.`;
     - rate limit: `Too many requests. Please try again later.`
   - Both call `revalidatePath("/manager")`.
3. **Null safety.** Every reader of `properties.owner_profile_id` accepts `null`: update the type, never compare `null` to a user id as a match, and never crash. One test per reader with a null-owner property.
4. **Clean refusals before side effects** (the DB would block these anyway; the app must fail clearly and first):
   - **Manager invite.** `inviteManager` (`app/actions/invitations.ts`) for a property where `isUnclaimedClientProperty` is true: refuse before `inviteUserByEmail` and before any `property_managers` write. Message: `This home's managers are set by its client account.`
   - **Owner invite.** `inviteOwner` for an unclaimed client account: refuse before any email or member write. Message: `This client can't have owners yet.`
   - **Lease create/renew/update** (`lease-mutations.ts`, `lease-lifecycle-actions.ts`, `entity-updates.ts` lease update): if the property is an unclaimed client home, set `collects_outside_domus = true` in the payload. That keeps the UI and DB in sync; the DB trigger stays authoritative.
   - **Stripe: one shared guard, at the lowest shared layer.** Add `assertStripeEligibleProperty(propertyId)` / `assertStripeEligibleAccount(accountId)` to `lib/client-accounts.ts`. They throw `StripeNotEligibleError` when the client state is unclaimed **or the lookup fails** (fail closed). Every caller maps that to `Online payments aren't available for this home yet.` Call the guard inside the lowest shared money module (`lib/stripe-connect.ts`, `lib/charge-checkout.ts`, `lib/stripe-autopay.ts`, `lib/withdrawals.ts`, `lib/distributions.ts`), not only in actions, so a future caller can't skip it.
   - **Call-site inventory (required in the report).** Run `grep -rnE "stripe\.[a-zA-Z]+\.(create|update|confirm|capture|del)" apps/web/app apps/web/lib`. Also list every function that calls `lib/stripe.ts`'s client, plus cron, webhook and retry paths. For each call site, give `file:function → guard used`, or a one-line proof that no guard is needed (for example, a webhook that only reacts to an existing Stripe object, which an unclaimed client can't have because the DB check forbids Stripe IDs on unclaimed accounts).
   - **Race note (document, no code).** `claim_state` only moves unclaimed → claimed, and while unclaimed the DB forbids `stripe_account_id`. So a check-then-call race can't move money for an unclaimed client.
   - Refuse at these entry points, before any Stripe API call or DB write:
     - Connect onboarding and links (`connect.ts`) for an unclaimed client account;
     - checkout (`prepareCheckoutContext`) for a charge on an unclaimed client home;
     - autopay setup (`autopay.ts`) for such a lease;
     - the scheduled autopay run (`lib/autopay.ts`): **skip** such leases and log `[autopay] skipped client home`;
     - withdrawals and distributions for an unclaimed client account.

     One test per entry point, asserting that the Stripe mock was **not** called.
5. **Owner-only stays closed (tests).** With a client-account fixture (a linked manager, no members, creator NULL):
   - `canUserAdministerOwnershipAccount(manager, client)` is false;
   - `getTaxSummaryReport` returns no client homes for the manager;
   - `inviteOwner` is refused.
6. **Unchanged access (regression tests, pinned before you change code).** For a normal owner home, the owner, the assigned manager and the tenant get the same results as today from `canUserAdministerProperty`, the property listing helpers, `inviteManager`, `inviteOwner`, `createLease` and checkout.
7. **Isolation (tests):**
   - managers A and B: `listClientAccountsForManager` returns only each manager's own clients; `addClientHome` by B into A's client is refused with **no RPC call**;
   - same manager, clients X and Y, with X's link inactive: X is excluded from the list and X's homes are refused, while Y still works.

## 4. Out of scope
- Any UI (Sprint 206), owner statements (207), claim (208).
- Rewriting RLS policies.
- Changing `createProperty`'s manager path.
- The pre-existing invitation-policy finding.
- Notifications (OFF).
- Applying the migration or any DB access.

## 5. Exact files expected to change
New:
- `apps/web/lib/client-accounts.ts`
- `apps/web/app/actions/client-accounts.ts`
- tests

Changed:
- `apps/web/lib/stripe-autopay.ts`
- `apps/web/lib/property-access.ts`, `apps/web/lib/stripe-connect.ts`, `apps/web/lib/manager-payments-data.ts`, `apps/web/lib/notification-preference-store.ts`
- `apps/web/app/actions/invitations.ts`, `apps/web/app/actions/lease-mutations.ts`, `apps/web/app/actions/lease-lifecycle-actions.ts`, `apps/web/app/actions/entity-updates.ts`
- `apps/web/app/actions/connect.ts`, `apps/web/lib/charge-checkout.ts`, `apps/web/app/actions/autopay.ts`, `apps/web/lib/autopay.ts`
- `apps/web/app/actions/withdrawals.ts` and/or `apps/web/lib/withdrawals.ts`, `apps/web/lib/distributions.ts`
- the validations module (Zod)
- the DB types file, if the repo keeps one

List every file in the report. Any other file = explain why.

## 6. Implementation requirements
- Exact strings; sentences ≤ 12 words; the plain-language guard passes.
- Every Supabase result is checked; explicit column lists; helpers fail closed by throwing.
- Lines ≤ 140; files ≤ 500 (split if needed); no new dependencies; no `eslint-disable`.
- Behavior on non-client homes is unchanged.

## 7. Validation commands to run
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- new tests, plus every test importing a changed file
- `lib/__tests__/plain-language.test.ts`
- `npm run build --workspace @domus/web`

## 8. Acceptance criteria (binary)
1. Null `owner_profile_id` is handled by every reader and never grants access (one test per reader).
2. The actions create clients and homes only for the caller's own active links. Refusals happen before any RPC. RPC error codes map to the exact strings.
3. Every Stripe entry point, plus manager and owner invites, refuses unclaimed client homes and accounts **before** any external call or write. One test each, asserting the mock was not called. The shared guard sits in the lowest money modules. The report includes the complete call-site inventory. Helper failures fail closed (tested).
4. Lease create/renew/update sends `collects_outside_domus = true` for client homes.
5. Owner-only access stays closed; normal-home behavior is unchanged (tests pinned first); the isolation tests pass.
6. All tests are real assertions (L-017); lint, typecheck, guard and build pass; only the listed files changed.

## 8b. Post-deploy (Claude)
0. Apply 205a first (done before dispatch) and re-run the forged-invitation test; expect `42501`.
1. Dry-run the final migration plus the test script in a rollback; then apply.
2. Run `supabase/tests/sprint205_client_accounts_test.sql`; every line must match its header expectations.
3. Run one service-role lease update test.
4. Confirm function grants are service-role only, plus `get_advisors` security.
4a. **Concurrency test:** two parallel sessions. One runs `add_client_home` with a `pg_sleep` after locking. The other deactivates the manager link. The final state must have no active derived `property_managers` row for an inactive link.
4b. **Invariant queries (must return 0 rows):** normal homes with NULL owner; unclaimed client homes with a non-NULL owner; active links missing an active derived row; active derived rows whose link is inactive or missing; members on managed-client accounts.
5. Smoke 3 roles, CI, Sentry.

## 9. Report format
JSON per `docs/codex-report-schema.json`. List every owner_profile_id reader changed and every guarded entry point (file:function). Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB access or migration apply; no deploy, commit or push. Never touch `.claude/launch.json`. Notifications stay OFF.
