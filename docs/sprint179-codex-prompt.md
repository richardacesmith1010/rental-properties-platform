# Sprint 179 — Owner and tenant load speed: cut server data assembly (L2) · Category 8: Speed

## 1. Objective
Cut the time before the owner Home, Rent and tenant Home show content, by shrinking the server data assembly that runs before render. The plan is driven by measured production timings (L-013): every target below is the sum of the costs that remain after the named fixes.

## 2. Context
- Branch `main`, HEAD `7a45283` or a later docs-only commit. Next 15.5.27, React 19.2.8. Owner pages: `apps/web/app/owner/page.tsx`, `app/owner/owner-page-data.ts`, `app/owner/page-data/*`. The section API is `app/api/owner/section-data` and `app/owner/owner-section-data-core.ts`. Tenant: `app/tenant/page.tsx`.
- **Measured 2026-10-06 on production** (smoke owner with 1 home; tenant with 1 lease; mobile viewport; 5 runs each):
  - Owner `/owner`: content visible median 2.74 s, p75 2.96 s; TTFB ~0.32 s.
  - `/owner?section=charges`: visible 2.33 s.
  - `/owner/money`: visible 1.48 s.
  - `/owner/bank`: visible 1.13 s.
  - `/tenant`: visible 2.33 s, p75 2.39 s.
  - Section switches after the first open are 30–70 ms (cache works).
- **Server `[perf:owner]` breakdown of `/owner`** (`data-assembly.total` ≈ 1.81–1.89 s):
  1. `auth.role` 120–157 ms.
  2. In parallel:
     - `profile.summary` 133–465 ms;
     - `feature.capabilities` 250–431 ms;
     - `ownership.accounts` 454–538 ms.
  3. In sequence:
     - `properties.administered-ids` ~105 ms;
     - then `manager-payments.visibility` ~206–230 ms.
  4. Bundles in parallel. The longest are:
     - `dashboard.data` 851–908 ms;
     - `maintenance.admin-tickets` 490–881 ms;
     - `expenses.owner` ~637 ms;
     - `portfolio.data` 376–506 ms;
     - `stripe-connect.status` 374–487 ms (a live Stripe API call);
     - `invitations.owner` ~452 ms;
     - `stripe-connect.owner-map` 326–513 ms.
  - Section-data API calls show the same prefix, with `inbox.threads` ~743 ms.
- `ownership_accounts` already stores `stripe_status`, `stripe_onboarding_complete` and `stripe_last_verified_at`, refreshed daily by `/api/cron/verify-stripe-accounts`.

## 3. In scope (each change keeps output identical; add or keep tests)
1. **`feature.capabilities`:** cache the result in-process (module-level) with a 10-minute TTL. These are schema or feature probes that do not change per request. On error, do not cache.
2. **`stripe-connect.status` and `stripe-connect.owner-map`:** stop calling Stripe live on every page render.
   - Read the stored `ownership_accounts` Stripe fields.
   - Call Stripe live only when `stripe_last_verified_at` is null or older than 24 h, and then write back the fresh status.
   - The onboarding return flow and webhook updates must keep refreshing the stored fields as today. Verify that they do.
3. **Sequential prefix:** run `properties.administered-ids` and `manager-payments.visibility` in parallel (or derive visibility from data already loaded). Start the bundle loads as early as their inputs allow. Do not change auth or permission checks: auth/role must still complete before any data is read.
4. **The slowest loaders** (`dashboard.data`, `maintenance.admin-tickets`, `ownership.accounts`, `expenses.owner`, `inbox.threads`):
   - inspect their queries;
   - remove sequential awaits that can be `Promise.all`;
   - remove N+1 queries (use `.in()`);
   - select only the columns used.
   - If a query needs an index, **do not** add a migration; instead list the exact index (table, columns) in the report, and Claude will apply it.
5. **Tenant `/tenant`:** add the same `[perf:tenant]` timing logs if they are missing (fixed names, no PII, matching the owner logger pattern), then apply the same kinds of fixes to its slowest steps.
6. **Speed smoke:** add `apps/web/tests/e2e/smoke-speed.spec.ts`. It is read-only, logs in like the other smoke specs, and measures "content visible" for:
   - `/owner` (text "Needs you today");
   - `/owner?section=charges` (main visible);
   - `/tenant` (text "Report a problem").

   Run each 5 times after one warm-up load. Log the median and p75. Fail when the p75 exceeds the budgets: owner Home 2,000 ms, Rent 2,000 ms, tenant Home 2,000 ms. These first budgets catch regressions; Claude tightens them after measuring the results. Wire the spec into `scripts/smoke-web.sh` after the mobile layout spec.

## 4. Out of scope
- Changing what data any page shows, auth or permission logic, schema or migrations (Claude applies indexes), client bundle or JS changes, caching user-specific data across users.
- `.claude/launch.json`, `docs/`, `CLAUDE.md`, `AGENTS.md`.

## 5. Exact files expected to change
- The loader and data files behind each named `[perf]` step. Find them via the `measure(name, …)` call sites in `app/owner/owner-page-data.ts`, `app/owner/page-data/*` and `lib/*`.
- `lib/feature-capabilities.ts`
- the Stripe status helper(s): `lib/owner-bank-status.ts`, `lib/stripe-connect.ts`, or wherever `stripe-connect.status` and `owner-map` are computed
- `app/tenant/page.tsx` and its loaders
- `apps/web/tests/e2e/smoke-speed.spec.ts` (new)
- `scripts/smoke-web.sh`
- tests for each changed loader

List every file with the perf step it targets.

## 6. Implementation requirements
- Output equivalence: for each changed loader, an existing or new unit test proves the returned data is unchanged for a fixture.
- Caches are process-local, never hold user data across users (the capabilities cache is global, not user data), and expire.
- Check every query `error`. Logs use fixed names only.
- Each line at most 140 characters. Do not compact code (L-015).

## 7. Validation commands to run
- `npm run gate:web`
- Claude measures on production after deploy (your sandbox cannot launch Chromium).

## 8. Acceptance criteria (binary)
1. The gate passes. Each changed loader has an equivalence test. The capabilities cache has TTL and error-not-cached tests. The Stripe status uses stored fields when they are fresh, and calls Stripe only when they are stale (tests with a mocked Stripe).
2. The report states, per `[perf]` step, the expected new cost and why, and gives the **predicted `data-assembly.total`** as the sum of the remaining costs on the critical path (L-013).
3. The speed spec exists, is read-only, and is wired into the smoke.
4. Only §5 files changed. Any needed index is listed for Claude.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Include the predicted per-step costs and the index list. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB writes or migrations, no deploy, commit or push. Never touch `.claude/launch.json`. No new dependencies.
