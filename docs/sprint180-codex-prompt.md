# Sprint 180 — Owner Home: render on essentials, defer Home-only bundles (L2) · Category 8: Speed

## 1. Objective
Make the owner Home show its main content sooner. The server page render should load only the shared/essential bundles. The 5 Home-only bundles (`invitations`, `tickets`, `expenses`, `manager-payments`, `feedback`) should load right after first paint, through the **existing** section-data path (`GET /api/owner/section-data?section=daily-ops-home` plus the client section cache), with skeleton placeholders. Also count database round trips per bundle, so a later consolidation is data-driven.

## 2. Context
- Branch `main`, HEAD `0069e81` or a later docs-only commit. Next 15.5.27, React 19.2.8.
- Bundle plan (`apps/web/app/owner/page-data/bundle-plan.ts`):
  - `OWNER_SHARED_BUNDLES` = dashboard, portfolio, announcement-properties, notifications, notification-preferences, rent-collection-status (in `app/owner/owner-page-data.ts`);
  - when `initialOwnerHomePage` is true, the plan **adds** invitations, tickets, expenses, manager-payments, feedback (plus ownership-members for LLC accounts, which stays as it is).
- The section-data API (`app/api/owner/section-data/route.ts`, `app/owner/owner-section-data-core.ts`) already returns a section's non-shared bundles. The client cache (`components/dashboard/owner-section-cache.ts`) merges them and preloads on hover/focus. `"daily-ops-home"` is a valid section ID.
- The Home component (`components/dashboard/owner-daily-ops-home.tsx`) uses:
  - `summary.lateCharges` (from dashboard): "Needs you today";
  - `summary.joinedWithoutLease` (from invitations);
  - `openRepairCount` (tickets) and `newMessageCount`;
  - `FinancialOverviewPanel` (expenses and related);
  - the money card, which already fetches client-side.
  - Find exactly which props come from which bundle (`dashboard-home-loader.ts`, `dashboard-data-loader.tsx`).
- **Measured on production** (Sprint 179):
  - owner Home content visible: median ~2.35 s;
  - owner `data-assembly.total` ~1.74 s; essential-only bundles are expected to finish well under that;
  - TTFB ~0.25 s;
  - each bundle makes several PostgREST round trips of 50–100 ms each.

## 3. In scope
1. **Server:** when the initial owner request is the Home (`initialOwnerHomePage`), do **not** load the 5 Home-only bundles in the page render. The section and Rent pages stay unchanged. Put this behind one clear switch in `bundle-plan.ts`/`owner-page-data.ts` (for example a `deferHomeOnlyBundles` option), so it can be reverted easily.
2. **Client:** on first mount of the Home, if those bundles are missing, request `daily-ops-home` through the existing section cache fetch: same auth, abort and epoch guards, no new endpoint. Merge the result exactly as a section navigation does.
   - Until it arrives, the dependent Home areas show a same-size skeleton:
     - the "joined without lease" cards;
     - the repairs/messages line;
     - "More numbers" / `FinancialOverviewPanel`.
   - "Needs you today" late-rent cards and the summary tiles render immediately, from essential data.
   - On fetch failure, show a small "Some numbers didn't load. Refresh to try again." in that area. Never show a blank or broken state.
   - Hover/focus preloading of other sections is unchanged.
3. **Round-trip counting:** add a lightweight counter around the Supabase admin/server client used by the owner loaders, for example by wrapping `fetch` per request scope, so each `[perf:owner]` bundle event also logs `queries: <n>`, with no SQL and no data. Add the same for `[perf:tenant]`. Keep the overhead negligible.
4. **Tests:**
   - the bundle plan with the defer switch on Home excludes the 5 bundles, and the section pages are unchanged;
   - the Home renders late-rent cards with only essential data, plus the skeletons;
   - after the cache delivers `daily-ops-home`, the deferred areas render real data;
   - the fetch-failure message;
   - the counter increments per Supabase request and resets per request scope.

## 4. Out of scope
- Schema or DB functions, RLS, auth/permission changes, the Rent/section pages, tenant loading changes beyond the counter.
- `.claude/launch.json`, `docs/`, `CLAUDE.md`, `AGENTS.md`.

## 5. Exact files expected to change
- `apps/web/app/owner/page-data/bundle-plan.ts`
- `apps/web/app/owner/owner-page-data.ts`
- `apps/web/app/owner/page.tsx` (only if needed to pass the defer flag)
- `apps/web/components/dashboard/owner-section-cache.ts`
- `apps/web/components/dashboard/owner-daily-ops-home.tsx`
- `apps/web/components/dashboard/dashboard-home-loader.ts` (if the Home summary assembly needs to tolerate missing bundles)
- the Supabase client helper(s) for the counter: `apps/web/lib/supabase/admin.ts` and/or `server.ts`, and `lib/logger.ts`
- the tenant perf logging site
- tests for each

List every file with its purpose.

## 6. Implementation requirements
- Auth is unchanged: the deferred fetch goes through the existing authenticated GET route, which re-runs all checks.
- No layout jump bigger than the skeletons. Plain-language copy (follow `docs/plain-language.md`; the guard test must still pass).
- Each line at most 140 characters. Do not compact code (L-015).

## 7. Validation commands to run
`npm run gate:web`. Claude measures on production after deploy.

## 8. Acceptance criteria (binary)
1. The gate passes, including the plain-language guard, with the new tests from §3.4.
2. A page render for the Home loads only the shared bundles (plus ownership-members for LLC). `/owner?section=…` renders are unchanged (tests).
3. Claude's production measurement after deploy: owner Home "Needs you today" visible median ≤ 1.6 s, versus 2.35 s now. The deferred areas fill in within about 1.5 s after that. There are no console errors, and the 25 existing browser specs still pass.
4. `[perf:owner]` bundle events include `queries` counts in production logs.
5. Only §5 files changed.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Include the bundle → prop map you found and the predicted Home render cost (L-013). Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB writes or migrations, no deploy, commit or push. Never touch `.claude/launch.json`. No new dependencies.
