# Sprint 181 — Owner Home critical path in one round trip each (L3: DB functions) · Category 8: Speed

## 1. Objective
Cut the owner Home's critical path (measured in production, L-018) from about 25 PostgREST round trips to about 3. The current chain:
- `ownership.accounts`: 8 queries, ~0.55 s;
- `properties.administered-ids`: 4 queries, 0.11–0.30 s;
- `dashboard.data`: 12 queries, ~1.0 s;
- `feature.capabilities` runs alongside: 22 queries, ~0.4 s, on every request because its cache never hits.

Target: owner Home "Needs you today" visible median ≤ 1.5 s in production (from ~2.4 s), and owner `data-assembly.total` ≤ 0.8 s.

## 2. Context
- Branch `main`, HEAD `9d95a8c` or a later docs-only commit. Next 15.5.27. The loaders use the **service-role admin client**, with app-side authorization: the user's administered property IDs are computed first (`lib/property-access.ts`), and every loader is scoped to them.
- **`getDashboardData`** in `apps/web/lib/dashboard.ts` (line ~121, about 450 lines, 18 `.from(` calls, ~12 executed for a 1-home owner) builds `DashboardData` (late charges, KPIs, next rent due and so on).
- **`getOwnershipAccountsForUser`** in `apps/web/lib/ownership.ts` (line ~155) runs 5 query sites and 8 executed queries.
- **`getFeatureCapabilities`** in `apps/web/lib/feature-capabilities.ts`:
  - it probes ~26 tables, columns and buckets;
  - it wraps them in `unstable_cache` (revalidate plus tag) and a process cache;
  - but when any probe result is `cacheable: false`, it throws `UncacheableCapabilitiesResult`, which skips caching.
  - **Production shows 22 queries on every request**, so some probe is uncacheable on every run. All these features have been live for months.
- Per-bundle `queries` counts are logged in `[perf:owner]` (Sprint 180).

## 3. In scope
1. **Capabilities, no runtime probes in the request path.**
   - Find which probe is uncacheable on every run, and report it.
   - Then make `getFeatureCapabilities()` return the production capability set **without querying** on page requests: a static "all features available" set, or one derived once at build time.
   - Keep the probe logic as an explicit check run by `npm run verify:phase10-runtime` (or a new `verify:capabilities` script), so environment drift is still detectable.
   - `ownerSectionAvailability` and the derived flags must be identical to today's production values (test with a fixture equal to the current production result).
2. **DB function `public.owner_dashboard_payload(p_property_ids uuid[], p_today date) returns jsonb`.**
   - **Write the migration file only:** `supabase/migrations/20261006_sprint181_owner_rpcs.sql`. **Claude applies it.**
   - It returns, in **one** call, exactly the raw rows and aggregates `getDashboardData` needs for those properties (the exact fields you find).
   - The TypeScript keeps building the same `DashboardData` shape from the payload.
   - Requirements:
     - `language sql` or `plpgsql`, `stable`, `security invoker`, `set search_path = ''`, fully schema-qualified names;
     - it filters strictly by `p_property_ids`;
     - `revoke execute ... from public, anon, authenticated; grant execute ... to service_role;`.
3. **DB function `public.ownership_accounts_payload(p_user_id uuid) returns jsonb`.** Same rules. It returns what `getOwnershipAccountsForUser` assembles today (member rows, creator rows, property account IDs, and so on) in one call. It is callable only by `service_role`.
4. **App integration.**
   - `getDashboardData` and `getOwnershipAccountsForUser` call the RPCs through the admin client.
   - **Fallback:** if the RPC is missing (`isMissingSchemaError`) or errors, log a fixed name and run the existing implementation, kept as `getDashboardDataLegacy` / `getOwnershipAccountsForUserLegacy`.
   - The app's authorization is unchanged: administered IDs are still computed in TypeScript and passed in. `p_user_id` is always the authenticated session user, never client input.
5. **Parity proof.**
   - Unit tests: for fixtures (no homes, 1 home with a late and a pending charge, 2 homes with a paid charge, an LLC account), the RPC-path assembly produces output deep-equal to the legacy path.
   - Also add `scripts/verify-owner-rpc-parity.ts`, runnable with `npx tsx` from the repo root using `apps/web/.env.local`. Given `--user <uuid>`, it computes administered IDs, runs both paths read-only, and prints `PARITY OK` or a JSON diff. Claude runs it against production for the smoke owner and the real owner.
6. **Perf logs:** keep the step names; `queries` must drop to ~1 for each of these steps.

## 4. Out of scope
- RLS changes, auth or permission logic, other loaders, client changes, the tenant page.
- **Applying the migration** (Claude), deploy.
- `.claude/launch.json`, `docs/`, `CLAUDE.md`, `AGENTS.md`.

## 5. Exact files expected to change
- `apps/web/lib/feature-capabilities.ts` and its probe script / `package.json` script entry
- `apps/web/lib/dashboard.ts`
- `apps/web/lib/ownership.ts`
- `supabase/migrations/20261006_sprint181_owner_rpcs.sql` (new, not applied)
- `scripts/verify-owner-rpc-parity.ts` (new)
- tests for capabilities, dashboard parity and ownership parity

If `dashboard.ts` exceeds 500 lines after the change, move the payload mapper to `apps/web/lib/dashboard-rpc.ts`. Each line at most 140 characters (L-015).

## 6. Implementation requirements
- The functions are `security invoker` and callable only by `service_role`, with an empty `search_path`. No dynamic SQL. Every input array is filtered with `= any(p_property_ids)`.
- Check every RPC `error`. Logs use fixed names only; no row data.
- The legacy fallback stays until Claude confirms parity in production (a later sprint removes it).

## 7. Validation commands to run
- `npm run gate:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- `npx tsx scripts/verify-owner-rpc-parity.ts --help` must print usage. A DB run is not possible until Claude applies the migration.

## 8. Acceptance criteria (binary)
1. The capabilities path makes **0 queries** on page requests (unit test: no client calls). The probe check is runnable as a script. The flags equal the production fixture.
2. The migration defines both functions exactly as in §3.2–3.3, with grants restricted to `service_role`.
3. The parity unit tests pass for all 4 fixtures, and the fallback test passes (the legacy path is used when the RPC is missing).
4. The parity script exists and prints usage.
5. The gate passes. Only §5 files changed.
6. **Claude, after applying the migration and deploying:**
   - parity OK for the smoke owner and the real owner;
   - production `queries` ≈ 1 for `dashboard.data` and `ownership.accounts`, and 0 for capabilities;
   - owner Home visible median ≤ 1.5 s;
   - 25/25 browser specs pass, and Sentry is clean.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Name the uncacheable probe, give the predicted per-step costs, and list the exact fields each function returns. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB writes, no migration apply, no deploy, commit or push. Never touch `.claude/launch.json`. No new dependencies (`tsx` is already available through npx; if not, say so).
