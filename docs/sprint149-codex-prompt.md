# Sprint 149 — Faster owner section loads (fixes 1 + 2 from the Sprint 148 diagnosis)

**Severity: L2** (read orchestration + caching of schema-capability probes; no auth decisions, money, or schema changes).

## 1. Objective
Cut the owner section switch from ~3 s to ~2 s by (1) caching the feature-capability probes across requests and (2) running independent owner-page reads concurrently and resolving administered property IDs once. Outputs shown to users must be identical.

## 2. Context
- Branch `main`, HEAD `c45fc67` or later docs-only. Diagnosis: Sprint 148 report (Codex) — section switches do `router.replace` → full force-dynamic `/owner` RSC reload (`components/dashboard/dashboard-section-loaders.ts:313-321`, `app/owner/page.tsx`), 65–78 Supabase requests, ~2.57 s server critical path; DB service time ~3–4 ms/request.
- **Fix 1 target:** `apps/web/lib/feature-capabilities.ts:238-291` `getFeatureCapabilities()` fires 22 table/column probes + 2 storage-bucket probes on every navigation using the cookie-bound `createClient()`. These probes answer "does this table/column/bucket exist" — global schema facts, not per-user data. Under contention they took up to ~2.9 s (the >5 s case).
- **Fix 2 targets:** `apps/web/app/owner/owner-page-data.ts:474-566` awaits role → profile → ownership accounts → capabilities → administered property IDs → manager-payment visibility serially; profile, ownership accounts, and capabilities are independent after auth/role. Administered property access is re-resolved in `lib/dashboard.ts:139-155`, twice in `lib/portfolio.ts:166-171`, via `lib/property-access.ts:240-265` and `lib/ownership.ts:155-170`.

## 3. In scope
1. **Cache capabilities:** wrap the probe work in a cross-request cache (`unstable_cache` from `next/cache` or equivalent) with `revalidate: 300` seconds and a fixed cache key/tag (e.g. `feature-capabilities`). Because cached functions must not read cookies, run the probes with a cookie-free client (the service-role admin client `lib/supabase/admin` is acceptable — the probes only check existence, never return user rows). **Never cache a degraded/failed probe result:** if any probe errors for reasons other than "missing schema", return the live (uncached) result for that request and do not store it. Keep the returned DTO, derivations, and warning text identical. Export a way to bust the cache (tag) for tests.
2. **Concurrency in `loadOwnerPageData`:** after the existing auth + role checks succeed (unchanged, still first), start profile, ownership-account, and capability reads concurrently (`Promise.all`); keep every later step that genuinely depends on an earlier result after it. No change to which checks run or to their outcomes.
3. **Resolve administered property IDs once per request:** compute them once in `loadOwnerPageData` (after auth) and pass them into `getDashboardData` and `getPortfolioData` (optional parameter; when absent, those functions behave exactly as today so other callers are unaffected). Remove the duplicate resolution only on the owner path.
4. Do NOT change: the section/navigation mechanism, bundle selection, `dashboard.ts`/`portfolio.ts` internal query waves beyond accepting the passed IDs, Stripe connection lookups (Sprint 148 fix 3 — later).

## 4. Out of scope
- Auth/role/permission logic (same checks, same order relative to data reads), payments, schema, UI/copy.
- Fix 3 (dashboard/portfolio internal waves, batched Stripe lookup), client-side section caching.
- No DB writes, deploy, env/secret changes, commit, or push.

## 5. Exact files expected to change
`apps/web/lib/feature-capabilities.ts`, `apps/web/app/owner/owner-page-data.ts`, `apps/web/lib/dashboard.ts`, `apps/web/lib/portfolio.ts`, and tests. `lib/property-access.ts` / `lib/ownership.ts` only if a small exported helper is needed (say why). ≤ 6 non-test files.

## 6. Implementation requirements
- Tests (Vitest): capabilities — second call within the window performs zero probe queries; a non-schema probe error is not cached (next call re-probes); "missing schema" results still map to the same DTO/warnings; `loadOwnerPageData` — auth/role failure still short-circuits before any data read; profile/ownership/capabilities requested concurrently (assert overlap via deferred mocks); `getDashboardData`/`getPortfolioData` given pre-resolved IDs return output identical to the no-IDs path for the same fixture and do not re-query property access; other callers of those functions unchanged.
- Measure: report request counts per owner load before/after (static count of awaited Supabase calls on the owner path is acceptable).
- No PII in logs. Do not invent URLs or emails.

## 7. Validation commands
```bash
npm run gate:web
git diff --stat
```

## 8. Acceptance criteria (binary)
- Full `gate:web` passes (network enabled).
- Capability probes cached (≤ 1 probe wave per 5 min per server instance); failed probes never cached; DTO unchanged.
- Independent owner-page reads run concurrently; auth/role still first.
- Property IDs resolved once on the owner path; dashboard/portfolio outputs identical (tests).
- ≤ 6 non-test files.

## 9. Report format
Conform to `docs/codex-report-schema.json`. `self_verification.findings`: before/after Supabase call count on the owner path, the cache key/revalidate/bust approach, the client used for probes and why it is safe, and the new await order in `loadOwnerPageData`.
No "Claude prompt" sections and no recommended next steps for Claude.

## 10. Constraints
No DB apply. No deploy. No env/secret changes. No commit/push — leave the working tree for Claude.
