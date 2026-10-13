# Sprint 225 — Owner Home speed: one pass for wallet data, drop duplicate year-rent load (L2, perf) · rev 1

The owner approved this on 2026-10-13: the speed fix comes first, then 222.

## 1. Objective
Bring owner Home back under its speed budget. The fix removes duplicate and sequential database work on Home's critical path, and changes no visible numbers.

## 2. Context (HEAD `575a7bd`, branch `main`)
**Production evidence** (`[perf:owner]`, 2026-10-13 04:25Z, smoke owner, 1 home):
- `data-assembly.total` 2,345 ms;
- `home.wallet` 1,968 ms (**23 queries**) and `rent.year-received` 1,963 ms (**10 queries**), both in parallel, which is the critical path;
- the other loaders are 120–450 ms.
- Smoke `owner Home` p75 has crept from ~1.9 s (Sprint 224) to 2.8–3.7 s; the budget is 3 s.

**`lib/owner-wallet-home.ts` (`loadOwnerWalletHome`)** runs this sequential chain:
1. `getAdministeredProperties`;
2. then a `Promise.all`:
   - `getPortfolioData`;
   - `getOwnershipAccountsForUser`;
   - `loadRentRowsForProperties(ids, year)`: 4 **sequential** round trips (units → leases → charges → payments);
   - year `property_expenses`;
   - `loadOwnerHomeMoney(ids, today)` (`lib/owner-recent-activity.ts`), which **loads rent rows again** for the previous and current month (4 more sequential round trips), plus expenses, properties and profiles;
3. then **sequentially** `loadBankNeedState`: 3 parallel queries, then 1 more sequential query;
4. then **sequentially** `getChargeLines` (1).

**`app/owner/owner-page-data.ts:173`** also runs `loadOwnerYearRentReceived(activeAccountId)` (`lib/owner-ytd.ts`). It re-authenticates, re-loads the administered properties and accounts, and re-loads the year's rent rows (4 sequential). Its only consumer is `components/dashboard/dashboard-kpi-loader.ts:405` (`ownerYearRent.byPropertyId` via `selectedRentReceivedCents`).

**Semantics to keep exactly:**
- wallet `leftCents` per home = this month's rent received (`rentReceivedByPropertyId` semantics as used by `loadOwnerHomeMoney`) − this month's expenses;
- wallet `ytd.inCents` uses `rentOnlyReceivedByPropertyId` (with charge lines, Sprint 220);
- `recent` = the 5 newest items across rent payments and expenses over the previous + current month, with titles exactly as `loadOwnerHomeMoney` builds them;
- `ownerYearRent.byPropertyId` uses `rentReceivedByPropertyId` (all categories) for the calendar year.

## 3. In scope
1. **`loadOwnerWalletHome`: single pass.**
   - Load rent rows **once**, with `from = min(yearFrom, firstDayOfPreviousMonth)` and `to = yearTo`. Derive the year totals, the on-time counts, the late flags, this month's left, and the recent items from that one set by filtering on dates in code.
   - Load expenses **once** over the same window, with `id, property_id, category, description, amount_cents, expense_date`.
   - Tenant names for the recent items come from the `getPortfolioData` leases already loaded (`tenantName` keyed by lease id), falling back to "Tenant". No extra profiles query.
   - Property names come from `getPortfolioData`. No extra properties query.
   - **Move the money logic into a pure helper**, `buildHomeMoney({ rentRows, expenses, propertyNames, tenantNameByLeaseId, ids, today })`, in `lib/owner-recent-activity.ts`. It returns exactly what `loadOwnerHomeMoney` returns.
     - Keep `loadOwnerHomeMoney` as a thin wrapper (load, then `buildHomeMoney`) for any other caller.
     - The wallet no longer calls `loadOwnerHomeMoney`.
   - **Run `loadBankNeedState` in parallel** with the main loads. Chain it on the accounts promise inside the same `Promise.all`, not after it.
     - Merge its second sequential query into one by using a PostgREST inner join: `bank_transactions` with `bank_accounts!inner(owner_account_id)`, filtered `.in("bank_accounts.owner_account_id", ownerIds)` and `.not("bank_change","is",null)` with a head count.
   - **Run `getChargeLines` in parallel:** query `rent_charge_lines` by `lease_id in (portfolio lease ids)`, chained on the portfolio promise, instead of after the rent rows. Keep the same result shape.
   - **Also return `yearRentReceivedByPropertyId`**, which is `rentReceivedByPropertyId` (all categories, calendar year) for every administered home.
2. **`owner-page-data.ts`:** remove the `rent.year-received` loader. Derive `ownerYearRent` from the wallet result:
   - if the wallet is ok: `{ ok: true, byPropertyId: wallet.yearRentReceivedByPropertyId }` (the KPI code already filters to the selected or active homes);
   - otherwise `{ ok: false, error: 'load_failed' }`.
   - Keep `lib/owner-ytd.ts` only if something else imports it (grep the full tree, L-006); otherwise delete it and its tests.
3. Keep the `[perf:owner]` `home.wallet` measurement and its `queries` count.

## 4. Out of scope
- UI changes.
- The other loaders.
- Manager or tenant pages.
- Changing what any number means.
- Caching.

## 5. Exact files expected to change
- `apps/web/lib/owner-wallet-home.ts`
- `apps/web/lib/owner-recent-activity.ts`
- `apps/web/app/owner/owner-page-data.ts`, `apps/web/app/owner/page-data/types.ts` (only if the types need it)
- `apps/web/lib/owner-ytd.ts` (delete only if unused)
- Tests: `apps/web/lib/__tests__/owner-wallet-home.test.ts`, the owner-recent-activity tests, `owner-page-data.test.ts`, and any owner-ytd tests.

## 6. Implementation requirements
- Lines ≤ 140 characters; files ≤ 500 lines (aim for ≤ 250).
- Check every Supabase error. No query inside a loop.
- Use integer cents.
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory.

## 7. Validation commands to run
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- `cd apps/web && npx vitest run`
- `npm run build --workspace @domus/web`

## 8. Acceptance criteria (binary; named tests that call real code)
1. **Parity:** for a fixture with 2 homes across 2 accounts (rent payments this month and last month, late fees, a charge with a water line, expenses this month, last month and earlier in the year), the new `loadOwnerWalletHome` returns **identical** values to the old behavior for:
   - every home's `leftCents`, `isLate`, `rentDueThisYear` and `rentOnTimeThisYear`;
   - `ytd.inCents` and `ytd.outCents`;
   - `recent` (order, titles, amounts, directions, property names).
   - Compute the "old" expected values with `buildHomeMoney` and the existing pure rent-received helpers, written as plain expected numbers in the test, not by calling the code under test.
2. **January edge:** with `today` in January, the previous month is December of the prior year; `leftCents` and `recent` still match, and `ytd` covers only the current year.
3. **Query budget:** with a query-counting fake admin, a wallet load issues **at most 14** queries (down from 23). Rent rows are loaded exactly once. There's no `profiles` or `properties` query beyond `getPortfolioData`'s own.
4. **Parallelism:** `loadBankNeedState` and the charge lines start before the rent-row chain finishes (assert with a deferred-promise fake).
5. **`ownerYearRent`:** `owner-page-data` no longer calls `loadOwnerYearRentReceived`; `ownerYearRent` equals the wallet's `yearRentReceivedByPropertyId`; a wallet failure → `{ ok: false }`. The KPI value for a selected home is unchanged versus a fixture computed with `rentReceivedByPropertyId`.
6. `buildHomeMoney` has unit tests for left, recent (top 5, newest first) and the tenant-name fallback.
7. Lint, typecheck, the full suite and the build are green.

**Claude will verify in production:** `[perf:owner] home.wallet` with `queries ≤ 14`, there's no `rent.year-received` line, and the smoke `owner Home` p75 is ≤ 2.5 s over two runs.

**Expected target** (L-013, summing the remaining measured costs at the 04:25Z latency):
- `properties.administered-ids` ~260 ms;
- plus the longest remaining chain, the rent rows at 4 sequential round trips of ~150–200 ms (~0.6–0.8 s);
- plus compute;
- so `home.wallet` ≈ 0.9–1.1 s and `data-assembly` ≈ 1.2–1.5 s.

## 9. Report format
JSON per `docs/codex-report-schema.json`, with the test names mapped to §8. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
- No DB access, deploy, commit or push. Don't run `gate:web`.
- Don't touch `.claude/launch.json`, `apps/ios`, `apps/mobile`, `docs/`, or "* 2.*" files.
