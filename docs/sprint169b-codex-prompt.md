# Sprint 169b — Phase 2 fix-up: real tests, correct alerts, plain labels, batched queries (L2)

## 1. Objective
The uncommitted Sprint 169 work (`docs/sprint169-codex-prompt.md`) is in the working tree. Claude rejected it for:
- missing or placeholder tests: `home-money-route.test.ts` asserts a literal equals itself;
- correctness bugs;
- raw labels;
- query fan-out.

Fix all of it. Keep the feature and the file layout.

## 2. Context
- Branch `main`, HEAD `531f893`. The Sprint 169 changes are uncommitted; edit them.
- Files: `apps/web/lib/home-money.ts`, `apps/web/app/api/owner/home-money/route.ts`, `apps/web/app/owner/money/page.tsx`, `apps/web/components/home-money/home-money-page.tsx`, `apps/web/components/dashboard/owner-daily-ops-home.tsx`, and the tests.

## 3. In scope
1. **Late-rent bug:** `page.tsx` passes `${month}-28` as "today", so on Oct 3 the current month already shows "Rent … hasn't arrived".
   - Always pass the real UTC date for the current month.
   - For a past month, pass the last day of that month.
   - For "This year", pass today.
   - Test: due Oct 1, grace null, today Oct 3 → no alert, even on the current-month page.
2. **Plain labels:**
   - Month tabs read "Oct", "Sep", "Aug", then "This year". The Home card title reads "{Home} · October".
   - Dates in the list read "Oct 1".
   - The Type column reads "Rent" / "Bill".
   - `plainMethod`: `ach` → "Bank transfer", `card` → "Card", `cash` → "Cash", `check` → "Check", anything else → "Other".
   - The download button title reads "Download this home's money for taxes." (no "CSV").
3. **Stacked rows at 375 px:** below the `sm` breakpoint, render each item as a stacked row instead of the 650 px table:
   - first line: date and title;
   - second line: source;
   - third line: amount and balance.

   Keep the table from `sm` and up.
4. **Batched queries:**
   - Refactor so that one call loads the data for a date window: properties, units, leases, charges, payments, expenses, and bank links for **only** the payment and expense ids found.
   - `loadHomeAlerts` uses **one** load covering the 3 previous months plus the current month, and computes the monthly totals in memory.
   - The route loads money and alerts for each home with at most 2 window loads in total, not 5 per home.
   - No query inside a loop. Bank-link queries are filtered with `.in("payment_id", …)` and `.in("expense_id", …)`, never loaded unbounded for the whole property.
   - Check every query's `error`. On an error, throw a fixed message (the route returns 500, and the page shows "Numbers are not ready. Try again later.").
5. **Real tests**, replacing the placeholder tests. Use mocked `createAdminClient` and `createClient`, as other route tests in the repo do (for example the section-data route tests). Every case in `docs/sprint169-codex-prompt.md` §8 must have a real assertion:
   - **`home-money.test.ts`:**
     - running balance, ending −147.27;
     - `groupByCategory`, including Mortgage 2078.88 from two rows;
     - late rent: today Oct 5 → none; Oct 6 → alert; paid → none; waived → none; the custom grace case;
     - higher than usual: 92/90/94 then 130 → alert; then 110 → none; only 1 prior month → none;
     - reversed payment excluded from totals;
     - the CSV header and formula neutralising;
     - `plainMethod` mapping.
   - **`home-money-route.test.ts`:** call the real `GET`:
     - no session → 401;
     - a manager → 403;
     - unknown param → 400;
     - a foreign `account` falls back to the user's own;
     - only administered homes are returned;
     - at most 3 homes plus `moreCount`;
     - the `Cache-Control` header;
     - a DB error → 500 with no raw error text.
   - **`home-money-page.test.tsx`:**
     - "Left after bills" negative → red class and minus sign;
     - the month tab labels and hrefs;
     - the empty state link;
     - "Download for taxes" calls `homeMoneyCsv`;
     - the stacked rows render at the small breakpoint (assert the stacked markup exists).
   - **Page server test** (or an extracted pure resolver): a foreign `property` falls back to an allowed one; the "today" value per tab is correct.
   - **`owner-daily-ops-home.test.tsx`:**
     - the owner sees a skeleton, then numbers from a mocked `fetch`;
     - the error state shows the bank link;
     - the manager view shows no card.
6. Remove the stray blank line added to `owner-daily-ops-home.tsx`.

## 4. Out of scope
Any other feature or file. Schema changes. `.claude/launch.json`, `docs/`, `CLAUDE.md`, `AGENTS.md`.

## 5. Exact files expected to change
- The Sprint 169 files listed in §2, plus their tests.
- Optionally `apps/web/app/owner/money/resolve.ts`, a pure resolver for property, month and today.

Each file must be at most 400 lines and each line at most 140 characters. Do not compact code (L-015).

## 6. Implementation requirements
- Keep the auth and scoping rules of Sprint 169.
- Integer cents. Never log amounts, descriptions or names.
- Tests must assert behaviour. A test that only compares constants, or that never calls the code under test, counts as missing.

## 7. Validation commands to run
- `npx vitest run apps/web/lib/__tests__/home-money.test.ts apps/web/lib/__tests__/home-money-route.test.ts apps/web/components/__tests__/home-money-page.test.tsx apps/web/components/__tests__/owner-daily-ops-home.test.tsx` plus any new page or resolver test
- `npx tsc -p apps/web/tsconfig.json --noEmit`
- `npm run lint:web`

## 8. Acceptance criteria (binary)
1. Every test case listed in §3.5 exists, calls the real code, and passes.
2. The route makes no per-row queries. For one home, the route issues at most 2 window loads; assert this with a mocked client call count.
3. The current-month page never shows a late-rent alert before due date + grace.
4. Labels: "Oct", "Oct 1", "Rent", "Bill", "Bank transfer"; and "{Home} · October" on the Home card.
5. Targeted tests, typecheck and lint pass. Only §5 files changed. Limits hold.

## 9. Report format
JSON per `docs/codex-report-schema.json`. In `self_verification.findings`, list each test file with its number of test cases. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB writes, deploy, commit or push. Never modify or revert files outside §5. No new dependencies.
