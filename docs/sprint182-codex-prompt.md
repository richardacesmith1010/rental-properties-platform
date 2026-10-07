# Sprint 182 — URGENT privacy hotfix: owners can see other owners' tenants (L3: privacy) · Category 1: Security

Replaces the planned Sprint 182 (speed RPCs), which moves to Sprint 183.

Revision 2 — ChatGPT verdict APPROVE WITH CHANGES. All 4 required and 3 optional changes are adopted: a post-query allowlist, fail-closed and error tests, an explicit email-match method, a full `profiles` read inventory, a dedup test, and an exact probe rule.

## 1. Objective
`getPortfolioData` (`apps/web/lib/portfolio.ts`) calls `fetchTenantProfiles`. That function loads up to 100 profiles with `role = 'tenant'` from the **whole platform**, unscoped, using the service-role admin client. They go into `PortfolioData.tenants`, which is serialized into the page for every owner and manager (`/owner`, `/manager`) and is also used by `app/api/ai/chat/route.ts`.

Proven in production on 2026-10-06: the smoke owner has 1 home and 1 tenant, yet its `/owner` HTML contains 14 distinct emails, including another owner's tenant and 8 non-test addresses. With no home selected, the lease form's tenant picker shows the full list on screen.

Fix: tenant data returned by `getPortfolioData` must contain only people tied to the caller's administered properties, plus the caller.

## 2. Context
- Branch `main`, HEAD `dd7f2fc` or a later docs-only commit. Next 15.5.27. Loaders use the service-role admin client with app-side scoping: `resolvedPropertyIds` are the user's administered property IDs.
- Today, `fetchTenantProfiles` serves **two** purposes:
  1. **Picker options.** `tenants` is built by `mergeTenantOptions`, which gives each tenant `propertyIds` from active leases (by tenant id) and from pending/accepted tenant invitations (by lowercased email) on `resolvedPropertyIds`.
  2. **Lease names.** `tenantById` resolves `tenantName`, `tenantEmail` and `tenantPhone` for every lease row. Because the global list is capped at 100 rows ordered by email, an owner's real tenant shows as "Unknown tenant" once the platform passes 100 tenants. This is a second bug, fixed by the same change.
- Consumers:
  - `lease-form.tsx` filters by `tenant.propertyIds.includes(draft.propertyId)`, and shows all tenants when no property is selected.
  - `lease-wizard.tsx` (`availableTenants`).
  - `render-section-cases.tsx`, `dashboard/index.tsx`, `app/manager/page.tsx`, `app/api/ai/chat/route.ts`, `lib/property-detail.ts`.

## 3. In scope
1. **Delete the unscoped fetch.** Remove `fetchTenantProfiles` and any other read of `profiles` that is not filtered by specific IDs or emails. Replace it with a scoped fetch that runs only when `resolvedPropertyIds.length > 0`:
   - `leaseTenantIds` = distinct `tenant_profile_id` of **all** lease rows already loaded for the administered units (active and inactive, because lease names need them);
   - `invitedEmails` = distinct lowercased `email` of pending/accepted tenant invitations on `resolvedPropertyIds` (already loaded);
   - profiles are fetched with `.in("id", leaseTenantIds)` and `.in("email", invitedEmails)`, where `invitedEmails` are lowercased.
     - **Only query-builder `.in()` calls are allowed.** No `.or(...)`, `.filter(...)`, `ilike` or any raw filter string that contains an email or an id.
     - Live data check (2026-10-06): 0 profiles and 0 invitations have mixed-case emails, so an exact match on lowercased emails is correct today. If a mixed-case profile email ever exists, that tenant is left out (fail closed). It is never widened.
     - Run the two queries in parallel, both selecting `id, email, full_name, phone`, with the existing missing-column fallback (no `phone`) kept.
   - **Defensive allowlist (required, defense in depth).** After the queries return, keep a profile only if `id ∈ leaseTenantIds` or `lower(email) ∈ invitedEmails`. Do this in one small pure function (for example `filterAllowedTenantProfiles(rows, leaseTenantIds, invitedEmails)`), and run it before anything is used to build `tenantById` or `tenants`. The caller's own profile is handled separately (its own `.eq("id", userId)` read) and is never derived from these rows.
   - If both lists are empty, make no profile query.
   - The leases query must finish before the scoped profile fetch. Do not add a sequential round trip that can run in parallel (for example, the invitation query can stay parallel with properties and units).
2. **`tenants` (picker options).** It equals the scoped profiles **whose computed `propertyIds` is non-empty**, plus the caller's own profile (kept as today: `"<name> (you)"`, with `propertyIds` computed the same way). With zero administered properties, `tenants` is `[self]` only (or `[]` if the self profile is missing). No other profile may appear.
3. **Lease names.** `tenantById` is built from the scoped profiles, so every lease of the owner resolves its tenant regardless of platform size. Keep the existing "Unknown tenant" fallback for a genuinely missing profile.
4. **Audit.** Search `apps/web/lib`, `apps/web/app` and `apps/web/components` for any other admin-client read of `profiles` (or of other users' personal data) that is not filtered to IDs or emails derived from the caller's own scoped records, and whose result reaches a page, server-action response or API response. Fix any such read in the same way, **only if it is in the §5 files**. Report every other finding in the report without changing it.
5. **Tests** (`apps/web/lib/__tests__/dashboard-portfolio-data.test.ts`, extending the existing mocks). Each case below must call `getPortfolioData` and assert on its real output; no tautologies (L-017):
   - a. **Foreign tenant excluded:** the mocked platform has a tenant profile with no lease or invitation on the caller's properties. It must not appear in `tenants`, and the mock must show that no `profiles` query was made without an `id`/`email` filter.
   - b. **Invited tenant included:** a tenant with a pending invitation on property P (invitation email in a different letter case than the profile email) appears with `propertyIds` containing P.
   - c. **Lease tenant named:** an active-lease tenant appears in `tenants` with the right `propertyIds`. Its lease has the correct `tenantName`, `tenantEmail` and `tenantPhone`, even when the mocked platform holds more than 100 other tenant profiles.
   - d. **Inactive-lease tenant:** the lease row is named correctly, but the tenant is **not** in `tenants`, unless it also has an invitation or an active lease.
   - e. **Zero properties:** `tenants` equals `[self]`, and no tenant-profile query is made.
   - f. **Self:** the caller is always present once, labelled `(you)`, and never duplicated even when the caller is also a lease tenant.
   - g. **Missing `phone` column fallback** still returns tenants, with `phone: null`.
   - h. **Fail closed:** the mocked scoped profile query deliberately returns an extra foreign profile (over-broad mock). The allowlist removes it, so it appears in neither `tenants` nor any lease's name/email/phone. Assert on the output, not only on the query shape.
   - i. **Query error:** the scoped profile query returns a non-schema error. `portfolio_tenant_profiles_error` is logged with the code only. Leases degrade to "Unknown tenant". No other `profiles` query (broader or retry) is made, and `tenants` is `[self]`.
   - j. **Dedup across paths:** the same person is reachable by an active lease on P1 and an invitation (different case) on P2. They appear once in `tenants`, with `propertyIds` = {P1, P2}.
6. **Live probe script** `scripts/verify-tenant-scope.ts`, runnable with `npx tsx` from the repo root, using `apps/web/.env.local`. Given `--user <uuid>`:
   - it computes the user's administered property IDs and runs `getPortfolioData` read-only;
   - it checks that every `tenants[i]` is the caller, or holds an **active** lease on those properties, or has a **pending/accepted** tenant invitation on them by email (the exact picker rule; inactive leases do not qualify);
   - it checks that every lease's tenant id is in the scoped lease set;
   - it prints `TENANT SCOPE OK (<n> tenants)` or a list of offending profile IDs (IDs only, never emails or names), and exits non-zero on failure;
   - `--help` prints usage.

## 4. Out of scope
- The `PortfolioData` / `TenantOption` types and shapes, all client components, RLS, the auth and role logic, `getAdministeredProperties`, invitations logic and speed work.
- Applying migrations (none expected), deploy, commit.
- `.claude/launch.json`, `docs/`, `CLAUDE.md`, `AGENTS.md`.

## 5. Exact files expected to change
- `apps/web/lib/portfolio.ts`
- `apps/web/lib/__tests__/dashboard-portfolio-data.test.ts`
- `scripts/verify-tenant-scope.ts` (new)
- Only if the §3.4 audit finds a leak inside them: `apps/web/lib/property-detail.ts`, `apps/web/app/api/ai/chat/route.ts`. Anything else is reported only.

Each line must be at most 140 characters (L-015). `portfolio.ts` must stay ≤ 500 lines.

## 6. Implementation requirements
- Never read `profiles` without an `id`/`email` filter derived from the caller's scoped leases or invitations, or the caller's own id.
- Check every query `error`. A non-schema error on the scoped profile fetch must not silently widen the scope. It may degrade to "Unknown tenant" names, but it must log a fixed message `portfolio_tenant_profiles_error` with the sanitized Postgres code only (no row data).
- Don't change the user-facing copy.
- Keep the existing legacy and missing-schema fallbacks for properties, units and leases unchanged.

## 7. Validation commands to run
- `npm run gate:web`
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- `npx vitest run apps/web/lib/__tests__/dashboard-portfolio-data.test.ts` (or the workspace equivalent)
- `npx tsx scripts/verify-tenant-scope.ts --help` prints usage. The DB run is Claude's.

## 8. Acceptance criteria (binary)
1. `fetchTenantProfiles` is gone. The report lists an **inventory of every `.from("profiles")` in `portfolio.ts`** (line, filter). Each one is filtered by the caller's id, by `.in("id", leaseTenantIds)` or by `.in("email", invitedEmails)`; none is unfiltered or role-only. No `.or(`/`.filter(`/`ilike` appears on a `profiles` query.
1b. The allowlist function exists and runs before `tenantById` and `tenants` are built (test h proves it).
2. Test cases a–j exist as separate `it(...)` blocks, call `getPortfolioData`, and pass.
3. The existing tests in `dashboard-portfolio-data.test.ts`, `owner-page-data.test.ts`, `property-detail.test.ts` and `ai-assistant.test.ts` still pass unchanged (or with only mock changes needed for the new query shape, each one listed in the report).
4. `verify-tenant-scope.ts` exists and prints usage.
5. The gate passes, and only §5 files changed.
6. The audit findings are listed in the report (file:line, what data, reachable surface), even if there are none.
7. **Claude, after deploying:**
   - the live probe of the smoke owner's `/owner` HTML shows only emails tied to the smoke graph (no `+alt` tenant, no non-test emails);
   - `verify-tenant-scope.ts` passes for the smoke owner, the smoke manager and the real owner;
   - the real owner's leases still show tenant names;
   - 25/25 browser specs pass, Sentry is clean and CI is green.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Include the audit findings list and the query count change for `portfolio.data`. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB writes, no migration, no deploy, commit or push. Never touch `.claude/launch.json`. No new dependencies. Never print real emails, names or phones in logs, tests output or the report (use fixtures and IDs).
