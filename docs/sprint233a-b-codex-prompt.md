# Sprint 233a-b — Nested perf timers must not hide queries from the outer timer (L1)

## 1. Objective
Sprint 233a (uncommitted, in the working tree) wrapped sub-steps of `loadOwnerWalletHome` in
`measurePerf`. `measureQueryCount` starts a fresh `AsyncLocalStorage` scope, so queries inside a
nested timer are no longer counted by the outer `home.wallet` timer (18 → ~0). Make nested scopes
also count toward every enclosing scope.

## 2. Context
- HEAD `d984fa2` plus 233a's uncommitted changes to `apps/web/lib/owner-wallet-home.ts` and the new
  `apps/web/lib/__tests__/owner-wallet-home-perf.test.ts`. Keep them.
- `apps/web/lib/logger.ts`: `queryScope = new AsyncLocalStorage<{ queries: number }>()`;
  `countSupabaseRequest` does `scope.queries++` on the current store only; `measureQueryCount`
  runs work in a new `{ queries: 0 }` scope.

## 3. In scope
Give each scope a link to the scope that was active when it started, and increment the whole chain.

## 4. Out of scope
Log format, `measurePerf` signature, which URLs count, anything in `owner-wallet-home.ts`.

## 5. Exact files expected to change
1. `apps/web/lib/logger.ts`
2. `apps/web/lib/__tests__/logger-query-count.test.ts` (new, or extend an existing logger test file
   if one exists — say which in the report)

## 6. Implementation requirements
1. Scope type `{ queries: number; parent?: <same type> }`. `measureQueryCount` sets
   `parent: queryScope.getStore()` when it creates the new scope.
2. `countSupabaseRequest` increments the current scope and every `parent` up the chain.
3. Each scope's `onComplete` still reports only its own total (which now includes its children).
4. Lines ≤ 140 characters.

## 7. Validation commands
```
cd apps/web && npx vitest run lib/__tests__/logger-query-count.test.ts lib/__tests__/owner-wallet-home-perf.test.ts
cd apps/web && npx vitest run lib/__tests__ --reporter=dot
cd apps/web && npx tsc --noEmit
npm run lint:web
```
Do NOT run `npm run gate:web`. Claude runs it.

## 8. Acceptance criteria
Tests call the real `measureQueryCount` / `countSupabaseRequest`:
1. One scope, 2 `/rest/v1/` requests → reports 2.
2. Outer scope with 1 own request and an inner scope with 3 → inner reports 3, outer reports 4.
3. Two sibling inner scopes run in parallel (`Promise.all`) with 2 and 3 requests → each reports its
   own count; the outer reports 5.
4. A non-`/rest/v1/` URL is not counted at any level.
5. A request outside any scope throws nothing and counts nowhere.

## 9. Report format
Compact status only: files changed, test counts, command results. Do NOT include "Claude prompt" or
"recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
Only the files in §5 may change (plus leaving 233a's two files as they are). No new dependencies.
