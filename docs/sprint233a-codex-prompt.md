# Sprint 233a — Speed: measure each step inside the owner Home wallet (L1, no behavior change)

## 1. Objective
Owner Home p75 is 1.6–2.6 s in production (target ≤ 1.5 s). Its slowest server step is
`home.wallet` (686–1,202 ms, 18 queries). We cannot see which part of it is slow. Add a timing log
around each sub-step so the next sprint can target the real cost. Nothing the user sees changes.

## 2. Context
- HEAD: `70af079` (main).
- `apps/web/lib/owner-wallet-home.ts` (172 lines): `loadOwnerWalletHome(userId, today)`.
  Order today: `getAdministeredProperties` (awaited alone first), then one `Promise.all` of
  `getPortfolioData`, `getOwnershipAccountsForUser`, `loadRentRowsForProperties`, the
  `property_expenses` query, `loadBankNeedState` (after accounts), the `rent_charge_lines` query
  (after portfolio) and `countMyDueTasks`. The no-homes branch runs accounts → bank needs + tasks.
- `apps/web/lib/logger.ts` exports `measurePerf(scope, name, work, meta?)`; it logs
  `[perf:<scope>] {..., name, durationMs, status, queries}`.
- Called from `apps/web/app/owner/owner-page-data.ts:174` as `home.wallet` (keep that log as is).
- Production evidence (2026-10-15 03:08 UTC, 6 Home loads): home.wallet 686–1,202 ms, 18 queries;
  data-assembly.total 1.04–2.03 s; single-query steps ~95–100 ms each.

## 3. In scope
Wrap each sub-step of `loadOwnerWalletHome` in `measurePerf("owner", "home.wallet.<step>", ...)`.

## 4. Out of scope
Any change to query order, parallelism, queries, results, error handling or the returned object.
Region or config changes. Any other loader.

## 5. Exact files expected to change
1. `apps/web/lib/owner-wallet-home.ts`
2. `apps/web/lib/__tests__/owner-wallet-home-perf.test.ts` (new)

## 6. Implementation requirements
1. Step names (exactly): `home.wallet.administered`, `home.wallet.portfolio`, `home.wallet.accounts`,
   `home.wallet.rent-rows`, `home.wallet.expenses`, `home.wallet.bank-needs`,
   `home.wallet.charge-lines`, `home.wallet.tasks`. Use the same names in the no-homes branch for
   the steps it runs.
2. Wrap the existing call/promise only. Keep the same `Promise.all` shape and the same dependency
   chains (bank needs after accounts, charge lines after portfolio). No new awaits on the critical path.
3. `home.wallet.charge-lines` must time only the `rent_charge_lines` query, not the wait for portfolio.
   `home.wallet.bank-needs` must time only `loadBankNeedState`, not the wait for accounts.
4. Lines ≤ 140 characters. File must stay ≤ 500 lines.

## 7. Validation commands
```
cd apps/web && npx vitest run lib/__tests__/owner-wallet-home-perf.test.ts components/__tests__/wallet-home.test.tsx
cd apps/web && npx vitest run lib/__tests__ --reporter=dot
cd apps/web && npx tsc --noEmit
npm run lint:web
```
Do NOT run `npm run gate:web` (its runtime verifier needs the database). Claude runs it.

## 8. Acceptance criteria
`owner-wallet-home-perf.test.ts` calls the real `loadOwnerWalletHome` with mocked data modules and
a spy on `measurePerf` (or `logPerfEvent`), and asserts:
1. With homes: all 8 step names are measured exactly once each, with scope `"owner"`.
2. Without homes: `home.wallet.administered`, `home.wallet.accounts`, `home.wallet.bank-needs` and
   `home.wallet.tasks` are measured; the other four are not.
3. The returned object is deep-equal to what the same mocks produced before the change
   (build the expected object in the test from the fixture; do not compare the function to itself).
4. `charge-lines` starts only after portfolio resolves, and `bank-needs` only after accounts resolve
   (assert call order with deferred promises).
Existing `wallet-home.test.tsx` passes unedited.

## 9. Report format
Compact status only: files changed with line counts, test counts, command results.
Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No new dependencies. Only the two files in §5 may change. No copy changes.
