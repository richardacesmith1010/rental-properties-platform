# Sprint 183 — Owner Home: administered IDs + portfolio in one round trip each (L3: DB functions, privacy-sensitive) · Category 8: Speed

Revision 2 — ChatGPT verdict APPROVE WITH CHANGES. All 5 required and 3 optional changes are adopted: exact legacy email semantics, a membership-gate matrix, a generic privacy invariant, an ordering/tie/NULL-vs-{} matrix, latency in acceptance, duplicate IDs, a NULL user, and `active IS NULL`.

## 1. Objective
These two steps run one after the other on every owner page (production `[perf:owner]`, 2026-10-06):
- `properties.administered-ids`: 4 queries, ~0.40 s;
- `portfolio.data`: 9–10 queries, ~0.54 s. Sprint 182 added a dependent profile round trip after leases, and every request also pays a failed `leases.notes` select plus its retry (the column does not exist live).

`dashboard.data` (1 query, 0.14 s), `ownership.accounts` (1 query) and capabilities (0 queries) are already done. On the Rent section, `stripe-connect.owner-map` (5 queries, 0.35 s) waits for `portfolio.data`; it is out of scope here and will be addressed later.

Target (L-013, sum of the remaining measured costs):
- `properties.administered-ids` ≈ 1 query, ≤ 0.15 s;
- `portfolio.data` ≈ 2 queries (RPC + the existing parallel manager-fee query), ≤ 0.2 s;
- owner `data-assembly.total` median ≤ 0.9 s (from ~1.5 s);
- owner Home visible median ≈ 1.3–1.7 s in production (from ~1.7–2.4 s). This is an **estimate, not an acceptance target**, because visible time includes render and network outside these steps.

## 2. Context
- Branch `main`, HEAD `4ab28e4` or a later docs-only commit. Next 15.5.27. Loaders use the service-role admin client with app-side authorization.
- **`getAdministeredPropertyIdsForAccount(userId, accountId)`** (`apps/web/lib/property-access.ts:~240`):
  1. It requires an **active membership of any role** in `ownership_account_members` (`account_id = accountId`, `profile_id = userId`, `active = true`). Without one it returns `[]`.
  2. It calls `getAdministeredProperties(userId)`, which returns the union of:
     - (a) properties whose `owner_account_id` is in the user's **owner-role** active memberships;
     - (b) properties with an active `property_managers` row for the user (`manager_profile_id = userId`, `active = true`).

     Both keep only properties with `active` not false.
  3. It filters to `ownerAccountId === accountId`.
  - Missing-schema paths fall back to `getLegacyAdministeredProperties` (`legacy:` account IDs). Keep those as the TS fallback.
- **`getPortfolioData(userId, accountId, administeredPropertyIds)`** (`apps/web/lib/portfolio.ts`, now exactly 500 lines) runs:
  - self profile;
  - then in parallel: properties (`in id`, ordered by `created_at` asc), units (`in property_id`, ordered by `unit_number` asc), tenant invitations (`role = 'tenant'`, `status in ('pending','accepted')`, `in property_id`), manager fees (`getManagerFeesForProperties`, 1 query);
  - then `ownership_accounts` (id, display_name) for the properties' `owner_account_id`, and leases for active units (ordered by `start_date` desc);
  - then (Sprint 182) scoped tenant profiles by `.in("id", leaseTenantIds)` / `.in("email", invitedEmails)` and `filterAllowedTenantProfiles`.
  - It filters to active properties, then to active units of active properties.
- Sprint 181 precedent:
  - `owner_dashboard_payload` / `ownership_accounts_payload` in `supabase/migrations/20261006_sprint181_owner_rpcs.sql`;
  - mapper in `apps/web/lib/dashboard-rpc.ts`;
  - fallback logs `owner_rpc_fallback_missing|error`;
  - SQL test pattern in `supabase/tests/sprint181_owner_rpcs_test.sql`;
  - parity script `scripts/verify-owner-rpc-parity.ts`.

  Follow the same structure.

## 3. In scope
1. **Migration file only:** `supabase/migrations/20261007_sprint183_portfolio_rpcs.sql`. **Claude applies it.** Both functions follow the same rules:
   - `language sql`, `stable`, `security invoker`, `set search_path = ''`, fully schema-qualified, no dynamic SQL;
   - exact-signature `revoke execute ... from public, anon, authenticated; grant execute ... to service_role;`;
   - NULL or empty inputs return the empty payload and never broaden;
   - every collection is `coalesce(jsonb_agg(... order by <stable keys>), '[]'::jsonb)`, with each field's order documented in a SQL comment.
   - **a. `public.owner_administered_property_ids(p_user_id uuid, p_account_id uuid) returns jsonb`.** It returns `{"property_ids": [...]}`, ordered by id, exactly reproducing steps 1–3 above. The membership gate is any role, active; the union is (a) owner-role active memberships plus (b) active manager assignments; `coalesce(p.active, true) = true`; and it filters `owner_account_id = p_account_id`. A NULL user or account, or no active membership, returns `[]`.
   - **b. `public.owner_portfolio_payload(p_user_id uuid, p_property_ids uuid[]) returns jsonb`.** It returns:
     - `properties`: id, name, address_line1, city, state, postal_code, owner_account_id, active. Rows are in `p_property_ids` with `coalesce(active, true)`, ordered by created_at, id.
     - `units`: id, property_id, unit_number, bedrooms, bathrooms, monthly_rent_cents, square_feet, occupied, active. Only active units of the returned properties, ordered by unit_number, id.
     - `leases`: id, unit_id, tenant_profile_id, monthly_rent_cents, deposit_cents, due_day_of_month, start_date, end_date, lease_status, grace_period_days, late_fee_cents, collects_outside_domus, active. That is 13 columns. **The live `leases` table has no `notes` column** (verified 2026-10-06 via `information_schema`), so production runs the missing-column retry on every request today. The RPC must not reference `notes`, and the mapper sets `notes: null`, exactly as the legacy fallback does. Rows are for the returned units (all lease statuses, active and inactive), ordered by start_date desc, id.
     - `invitations`: email lowercased, property_id. Tenant role, status pending/accepted, property_id in `p_property_ids`. Ordered by property_id, email; distinct.
     - `ownership_accounts`: id, display_name for the returned properties' owner_account_id, ordered by id.
     - `tenant_profiles`: id, email, full_name, phone, **only** where `id` is in the returned leases' `tenant_profile_id`, or `email` **exactly equals** one of the returned (lowercased) invitation emails. Use `p.email = any(<lowercased invitation emails>)` with no `lower()` on the profile side; this reproduces the legacy `.in("email", invitedEmails)` exactly. Live check 2026-10-06: 0 mixed-case emails in `profiles` and in `invitations`. A mixed-case profile email is excluded on both paths (fail closed). Ordered by id. **No other profile may ever be returned.**
     - `self_profile`: id, email, full_name, phone for `p_user_id`, or JSON null.

     NULL or empty `p_property_ids` returns empty arrays plus `self_profile`. Manager fees are **not** in the RPC; `getManagerFeesForProperties` keeps running in parallel with the RPC.
2. **App integration (fallback as in Sprint 181).**
   - `getAdministeredPropertyIdsForAccount` calls RPC (a); `getPortfolioData` calls RPC (b), in parallel with the manager-fee query.
   - If the RPC is missing (`isMissingSchemaError`) or errors, run the existing code, kept as `getAdministeredPropertyIdsForAccountLegacy` / `getPortfolioDataLegacy`, and log `owner_rpc_fallback_missing` or `owner_rpc_fallback_error` with the RPC name and the sanitized code only.
   - The mapper builds the identical `PortfolioData` (same objects, same order, same defaults: `gracePeriodDays ?? 5`, `lateFeeCents ?? 0`, `leaseStatus ?? "active"`, "Unknown tenant", "Ownership Account", "Owner Account", "Unknown Property", "(you)").
   - **The Sprint 182 privacy layer stays:** `filterAllowedTenantProfiles` runs on the RPC's `tenant_profiles` (allowed IDs from the returned leases, allowed emails from the returned invitations) before `tenantById` / `tenants` are built, and the picker rule is unchanged (self plus tenants with non-empty `propertyIds`).
   - Put the RPC mapper in a new `apps/web/lib/portfolio-rpc.ts` so `portfolio.ts` stays ≤ 500 lines.
   - `getAdministeredProperties`, `getAdministeredPropertyIds` and the other callers of these functions are unchanged.
3. **SQL test** `supabase/tests/sprint183_portfolio_rpcs_test.sql`: one `DO $$ ... $$` block with fixed UUIDs that never touches existing rows, ending with `raise exception 'SPRINT183_SQL_TESTS_PASSED'` (forced rollback). Scenarios:
   - **Administered IDs (membership-gate matrix: the any-role active membership gate is separate from the owner-role/manager union):**
     - active owner-role member → its owned active properties (including one with `active IS NULL`), excluding the `active = false` one;
     - active non-owner-role member, no manager assignment → `[]`;
     - **inactive** member who is an active manager of a property in that account → `[]`;
     - active non-owner-role member + active manager of one property in the account → only that property;
     - active manager of a property in a **different** account → excluded for this account;
     - NULL user, NULL account → `[]`;
     - order: IDs sorted ascending (assert exact array).
   - **Portfolio:**
     - 1 property with 2 active units + 1 inactive unit, 1 active lease + 1 ended lease, and 1 pending invitation in mixed case → exact contents;
     - a profile whose stored email is mixed case and matches an invitation only case-insensitively → **excluded** (legacy parity);
     - **generic privacy invariant:** for every returned `tenant_profiles` row, assert `id ∈ returned leases' tenant_profile_id` or `email ∈ returned invitations' email`. Reverse direction: every lease tenant with an existing profile and every invitation email with an exact-match profile **is** returned. Also include a foreign tenant profile and a foreign invitation on another owner's property, and assert both are absent;
     - the same person reachable by lease and invitation → one profile row;
     - **ordering, with ties that exercise the secondary key:** two properties with equal `created_at`; two units with equal `unit_number` on different properties; two leases with equal `start_date`; two invitations on the same property. Assert the exact order of properties, units, leases, invitations, ownership_accounts and tenant_profiles;
     - a property with `active IS NULL` is included, and one with `active = false` is excluded (along with its units and leases);
     - duplicate IDs in `p_property_ids` → no duplicated rows;
     - `p_property_ids` NULL and `'{}'` tested **separately** → empty arrays plus `self_profile`;
     - `p_user_id` NULL with non-empty `p_property_ids` → collections returned, `self_profile` is JSON null.
4. **Tests (Vitest), each calling the real function and asserting on real output (L-017):**
   - parity, RPC path vs legacy path deep-equal, for these fixtures: no homes; 1 home with an active lease and an invitation; 2 homes with an inactive lease and an inactive unit; manager-only access;
   - fallback used when the RPC is missing, and when it errors, with the correct fixed log name;
   - **allowlist still applied on the RPC path:** a mocked RPC returning an extra foreign profile → it is removed from `tenants` and from lease names;
   - administered-ids RPC path equals legacy for owner, manager and non-member fixtures.
5. **Parity script:** extend `scripts/verify-owner-rpc-parity.ts` (or add `scripts/verify-portfolio-rpc-parity.ts`). It runs read-only with `--user <uuid> [--account <uuid>]` and compares legacy vs RPC administered IDs (as sets) and `PortfolioData` (deep-equal). It prints `PARITY OK` or a JSON diff with IDs only (no emails or names).
6. **Perf logs:** keep the step names. `queries` should be 1 for `properties.administered-ids` and ~2 for `portfolio.data`.

## 4. Out of scope
- `stripe-connect.owner-map`, `stripe-connect.status`, dashboard, ownership and capabilities.
- RLS, auth and role logic, invitations logic, client components, user-facing copy, the tenant and manager pages (beyond sharing these loaders).
- Applying the migration (Claude), deploy.
- `.claude/launch.json`, `docs/`, `CLAUDE.md`, `AGENTS.md`.

## 5. Exact files expected to change
- `supabase/migrations/20261007_sprint183_portfolio_rpcs.sql` (new, not applied)
- `supabase/tests/sprint183_portfolio_rpcs_test.sql` (new)
- `apps/web/lib/property-access.ts`
- `apps/web/lib/portfolio.ts`
- `apps/web/lib/portfolio-rpc.ts` (new)
- `scripts/verify-owner-rpc-parity.ts` or `scripts/verify-portfolio-rpc-parity.ts` (new)
- tests: `apps/web/lib/__tests__/dashboard-portfolio-data.test.ts`, plus new `portfolio-rpc.test.ts` and `property-access-rpc.test.ts` under `apps/web/lib/__tests__/`

Each line must be at most 140 characters, and every file must be ≤ 500 lines (L-015). No compaction tricks.

## 6. Implementation requirements
- `p_user_id` is always the authenticated session user and `p_property_ids` are always the TS-computed administered IDs. Never client input.
- Check every RPC `error`. Logs use fixed names only, with no row data.
- The legacy fallback stays until Claude confirms parity in production; a later sprint removes it.
- Never print real emails, names or phones in tests, scripts or the report.

## 7. Validation commands to run
- `npm run gate:web`
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- the parity script with `--help` (prints usage). The DB run is Claude's.

## 8. Acceptance criteria (binary)
1. The migration defines both functions exactly as in §3.1, with exact-signature grants to `service_role` only, and documented ordering and null contracts.
2. In `owner_portfolio_payload`, `tenant_profiles` is derived only from the returned leases and invitations; no other path to `public.profiles` exists in the function except `self_profile` by `p_user_id`. The report quotes these SQL lines.
3. The SQL test file covers every §3.3 scenario and ends with the forced rollback.
4. All §3.4 tests exist as separate `it(...)` blocks with real assertions, and they pass. The existing Sprint 182 tests a–j still pass.
5. The parity script exists and prints usage.
6. The gate passes, and only §5 files changed.
7. **Claude, after applying and deploying:**
   - `SPRINT183_SQL_TESTS_PASSED`;
   - parity OK for the smoke owner, the smoke manager and the real owner;
   - `verify-tenant-scope.ts` still OK for all 3;
   - the live leak probe is still 6 emails;
   - production `queries` match §3.6;
   - production per-step medians over ≥ 5 owner Home requests: `properties.administered-ids` ≤ 0.15 s, `portfolio.data` ≤ 0.2 s, `data-assembly.total` ≤ 0.9 s. Sampling as in L-013/L-018: the smoke-speed run, then the per-request `[perf:owner]` lines;
   - 27/27 browser specs, Sentry clean, CI green.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Include the predicted per-step costs and the SQL lines for acceptance item 2. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB writes, no migration apply, no deploy, commit or push. Never touch `.claude/launch.json`. No new dependencies.
