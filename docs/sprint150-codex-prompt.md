# Sprint 150 — Faster owner section loads, part 3 (collapse query waves + batch Stripe lookup)

**Severity: L2** (read orchestration only; no auth decisions, money movement, schema, or UI changes).

## 1. Objective
Cut the owner section switch from ~2.6 s (Charges ~3.1 s) to ~2.0 s (Charges ~2.2 s) by removing serial query waves on the owner server path. Everything users see must stay identical.

## 2. Context
- Branch `main`, HEAD `672d451` or later docs-only. Sprint 149 (`c8c7493`) cached capability probes, parallelized profile/ownership/capabilities, and resolved administered property IDs once. Measured after 149 (prod, warm): Maintenance 2,836 · Portfolio 2,595 · Expenses 2,570 · Leases 2,590 · Charges 3,086 ms. DB service time is ~3–4 ms/request, so the cost is **round-trip waves**, not query weight.
- Remaining serial waves (verify by reading the code):
  - `apps/web/app/owner/owner-page-data.ts` `loadOwnerPageData`: after the main `Promise.all` (dashboard, portfolio, …) a **second** `Promise.all` runs the 8 ownership reads, then a **third** step awaits `arePropertyOwnersConnected(portfolio.properties…)`. The ownership reads only need `isLlcAccount`, `activeAccountId`, `ownershipAccounts` — all known before the main wave.
  - `apps/web/lib/stripe-connect.ts:473-480` `arePropertyOwnersConnected` calls `getOwnerStripeAccountForProperty` (`:355`) once per property — each does 2–4 sequential queries (properties → ownership_accounts → maybe account creator/members → profiles).
  - `apps/web/lib/dashboard.ts` `getDashboardData` (~`:121-400`): ~10 sequential awaits — profile → properties+units → leases → maintenance → tenant profiles → charge queries → late/pending/charge-id queries → payments → charge details → reminder notifications → edit history. Several are independent of the one before them (e.g. the profile role read vs. the properties/units read when IDs are passed in; maintenance vs. leases if it only needs unit IDs).
  - `apps/web/lib/portfolio.ts` `getPortfolioData` (~`:106-360`): self profile → properties/units/invitations → ownership_accounts → leases (+ schema fallbacks).
- A read-only `supabase` MCP is available for schema/data checks.

## 3. In scope
1. **Merge owner-page waves:** run the 8 ownership reads inside the main `Promise.all` (same conditions, same functions, same arguments). Start the owner-connected-map lookup as soon as portfolio resolves (chain off the portfolio promise inside the same `Promise.all`), not after the ownership wave. `approvedApplicationCount` and all returned fields unchanged.
2. **Batch the Stripe connection lookup:** add a batched path for `arePropertyOwnersConnected` that resolves N properties in a fixed number of queries using `.in()` (properties → ownership_accounts → creators/members as needed → profiles), with **exactly the same per-property decision rules** as `getOwnerStripeAccountForProperty` (account-level connected account first; then the existing fallbacks in the same priority order; legacy `owner_profile_id` path). Keep `getOwnerStripeAccountForProperty` for its other callers (payment paths) **unchanged** — do not route money paths through the new code.
3. **Collapse internal waves in `getDashboardData` and `getPortfolioData`:** wherever a query's inputs are already known, start it in the same `Promise.all` as its siblings. Keep the tenant short-circuit and every empty-input early return behaving exactly as today (if you start the profile read concurrently, discard other results when the role is tenant). Keep all `isMissingSchemaError` fallbacks and error handling identical. No query changes beyond ordering/batching.
4. Keep the existing `[perf:owner]` `measureOwner*` instrumentation working for every loader (names unchanged so before/after compare).

## 4. Out of scope
- Navigation model / client-side section cache (`components/dashboard/dashboard-section-loaders.ts` `router.replace`) — a later sprint.
- Auth/role/permission logic and its order relative to data reads; payment, checkout, webhook, or transfer code paths; schema; UI/copy; capability caching.
- No DB writes, deploy, env/secret changes, commit, or push.

## 5. Exact files expected to change
`apps/web/app/owner/owner-page-data.ts`, `apps/web/lib/stripe-connect.ts`, `apps/web/lib/dashboard.ts`, `apps/web/lib/portfolio.ts`, plus tests under `apps/web/lib/__tests__/` (and `apps/web/app/owner/` tests if they exist). ≤ 4 non-test files.

## 6. Implementation requirements
- Tests (Vitest):
  - `loadOwnerPageData`: ownership reads start before the main wave settles (deferred mocks prove overlap); owner-connected map starts once portfolio resolves without waiting on ownership reads; auth/role failure still short-circuits before any data read; returned object unchanged for a fixture.
  - Batched Stripe lookup: for a fixture covering every branch (account-level connected; account-level not onboarded → each fallback; legacy `owner_profile_id`; no owner; property missing), the batched map equals the map built from per-property `getOwnerStripeAccountForProperty`; query count is constant in N (e.g. 1 vs 10 properties issue the same number of queries).
  - `getDashboardData` / `getPortfolioData`: same output as before for existing fixtures, including tenant role, zero properties, zero units, zero leases, and missing-schema fallback cases.
- Report the sequential await depth (number of serial waves) on the owner path before/after, per loader.
- No PII in logs. Do not invent URLs or emails.

## 7. Validation commands
```bash
npm run gate:web
git diff --stat
```

## 8. Acceptance criteria (binary)
- Full `gate:web` passes (network enabled).
- Ownership reads and owner-connected map no longer wait in separate waves after the main `Promise.all`.
- `arePropertyOwnersConnected` issues a constant number of queries regardless of property count, with per-property results identical to the single-property function (tests).
- `getOwnerStripeAccountForProperty` and all payment code paths are byte-for-byte unchanged in behavior (no edits to its body).
- Dashboard/portfolio outputs identical for all existing and new fixtures; serial wave depth reduced.
- ≤ 4 non-test files changed.

## 9. Report format
Conform to `docs/codex-report-schema.json`. `self_verification.findings`: serial wave depth before/after for `loadOwnerPageData`, `getDashboardData`, `getPortfolioData`, `arePropertyOwnersConnected`; query count for the batched Stripe lookup at 1 and 10 properties; any query you could NOT parallelize and why.
No "Claude prompt" sections and no recommended next steps for Claude.

## 10. Constraints
No DB apply. No deploy. No env/secret changes. No commit/push — leave the working tree for Claude.
