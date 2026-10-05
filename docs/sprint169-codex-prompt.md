# Sprint 169 — Bank feed Phase 2: home money page, monthly profit, alerts, tax download (L2)

## 1. Objective
Let the owner open Domus and see how each home did this month. Build:
- a Home card showing In, Out and Left for this month;
- a money page per home (`/owner/money`) with month tabs, a profit breakdown, two kinds of alerts, a list of every item with a running balance, and "Download for taxes".

Approved design: `docs/bank-feed-design.md`. Mockup: https://claude.ai/artifact/Wp4XfbAcPvXTXmiGyY1FwU (boards "Monthly profit + alerts" and "1st Home ledger").

## 2. Context
- Branch `main`, HEAD `5ad9110` or a later docs-only commit. Phase 1 is live: `/owner/bank`, Sprints 167/168.
- **Source of truth for money:** existing records, not raw bank rows.
  - **Money in:** rent `payments` (where `reversed_at` is null) on `rent_charges` of leases on units of the property. `paid_at` gives the date.
  - **Money out:** `property_expenses` for the property. `expense_date` gives the date.
  - Bank-filed items already create these records, so nothing is counted twice. `bank_transactions` of kind `transfer` are never counted.
  - Optional source label: when a payment or expense has a linked `bank_transactions` row (`payment_id` / `expense_id`), show "From bank: {nickname}". Otherwise, for an expense, "Added by you". For a payment, "Paid online" when `stripe_payment_intent_id` is set; otherwise the payment `method` in plain words ("Bank transfer", "Cash", "Check", "Card", "Other").
- Existing patterns:
  - The GET route with session auth is `app/api/owner/section-data/route.ts`: `force-dynamic`, `Cache-Control: private, no-store`, and 401 without a session.
  - Property access: `canUserAdministerProperty` and `getAdministeredProperties` (`lib/property-access.ts`).
  - The owner Home component is `components/dashboard/owner-daily-ops-home.tsx`. It already has the static card "Sort your bank activity" from Sprint 167.
  - CSV escaping helper: `lib/csv-export-reports.ts` (`escapeCell` is private). Reuse it by exporting it, or by adding a function there.
- Real example: "1st Home" in October has rent $2,350 in; the expenses depend on what the owner has filed.

## 3. In scope
1. **Data module `lib/home-money.ts`** (server-only, unit-tested pure helpers plus one loader):
   - `loadHomeMoney(userId, propertyId, range: { from: "YYYY-MM-DD", to: "YYYY-MM-DD" })`:
     - check `canUserAdministerProperty`; return `null` if not allowed;
     - batched queries only, with no query per row;
     - returns `{ property: { id, name }, entries: Entry[], totals: { inCents, outCents, leftCents } }`, where
       `Entry = { id, date, kind: "rent"|"bill", title, detail, category, amountCents, direction: "in"|"out", source }`, sorted by date ascending, then id.
     - `title` for rent: "Rent from {tenant name}" (fall back to "Rent"). For a bill: the expense description before " · " if present, else the category label.
   - `runningBalance(entries)`: a pure helper that adds a `balanceCents` to each entry (in adds, out subtracts, starting at 0 for the range).
   - `groupByCategory(entries)`: a pure helper returning lines like `{ label, direction, amountCents }`.
     - All rent is one line: "Rent".
     - Bills group by their title label, for example "Mortgage", "Solar", "Water", "Pest control"; otherwise the category label.
     - Order: rent first, then bills by amount, largest first.
   - `loadHomeAlerts(userId, propertyId, today)`, two alert types:
     - **Late rent:** each active lease charge with category `rent`, due in the current month, status `pending` or `late`, where `today` > due date + grace days. Grace days = `leases.grace_period_days`, or 4 when null, so a rent due on the 1st is late after the 5th.
       - Text: "Rent from {tenant} hasn't arrived" / "It was due {Mon D}."
     - **Bill higher than usual:** for each bill label in the current month, compare its monthly total to the average of the same label over the previous 3 calendar months. Only use months where it appeared; at least 2 such months are required. Alert when current ≥ 1.3 × average.
       - Text: "{Label} is higher than usual" / "{$current} this month vs. about {$average} most months."
     - Return at most 5 alerts.
   - `homeMoneyCsv(entries)` returns these columns: Date, What, Type, Category, In, Out, Balance, Source.
     - Amounts are dollars with 2 decimals.
     - Use the shared CSV escape (formula-injection safe if the existing helper is; otherwise prefix cells that start with `= + - @` with `'`).
2. **GET route `app/api/owner/home-money/route.ts`** for the Home card:
   - Session auth; return 401 without a session.
   - Owner role only; otherwise 403.
   - Optional `account` param; same strictness as section-data (unknown params → 400).
   - Returns, for the owner's administered properties in that ownership account (at most 3 properties; the rest are counted as `moreCount`):
     `{ month: "YYYY-MM", homes: Array<{ propertyId, name, inCents, outCents, leftCents, alertCount }>, moreCount }`.
   - Headers: `Cache-Control: private, no-store`, `Vary: Cookie`.
   - Never return raw DB errors.
3. **Owner Home card** (`owner-daily-ops-home.tsx`, owner only):
   - Replace the static "Sort your bank activity" card with one "This month" card that fetches `/api/owner/home-money` on mount (abort on unmount). It shows:
     - per home: "{Home} · {Month}" with In (green), Out and Left (red if negative), plus a "Details" link to `/owner/money?property={id}`;
     - when `alertCount > 0`, a small amber line: "{n} thing(s) to check".
   - The footer keeps the existing "Sort your bank file" link to `/owner/bank`.
   - While loading, show a skeleton of the same height. On error, show only the bank link and "Numbers are not ready. Try again later."
   - No new data in the existing loaders.
4. **Page `app/owner/money/page.tsx`** (server) plus `components/home-money/*` (client where needed):
   - `requireRole(["owner"])`. Resolve `?property=` among administered properties. If it is missing or not allowed, default to the first.
   - With more than one home, show a home picker.
   - Month tabs: the last 3 months plus "This year". Use `?month=YYYY-MM` or `?month=year`; the default is the current month.
   - Sections, in order:
     1. **Header:** "{Home} money".
     2. **Profit card:** "Left after bills" in large type (negative in red, with a minus sign), then the `groupByCategory` lines (in green with +, out with −).
     3. **"Heads up" alerts** (amber for "higher than usual", neutral for late rent). When there are none: "Nothing unusual this month."
     4. **"Every item" list:** Date, What (title plus the source in small text), Type, Amount and Balance. Use a scrollable table on desktop and stacked rows at 375 px.
        - Empty state: "Nothing here yet. Upload a bank file to fill this in." with a link to `/owner/bank`.
     5. **"Download for taxes" button:** downloads a CSV for the selected period, named `{home}-{period}.csv`. Build it in the browser from the loaded entries.
   - Plain-language copy only. Tokens: `var(--ink)`, `--muted`, `--accent`, `--surface`, `--line`, `domus-card`. Every tap target is at least 44 px. It must work in light and dark mode.
5. **Link from `/owner/bank`:** add one link, "See how your homes are doing", to `/owner/money`, in `components/bank-feed/page-shell.tsx`, near the header.

## 4. Out of scope
- Plaid, schema or migrations, any change to money records, notifications or emails.
- Changing the existing reports pages or `reports-pnl.ts` (do not refactor them).
- Managers and tenants.

## 5. Exact files expected to change
New:
- `apps/web/lib/home-money.ts`
- `apps/web/app/api/owner/home-money/route.ts`
- `apps/web/app/owner/money/page.tsx`
- `apps/web/app/owner/money/loading.tsx`
- `apps/web/components/home-money/` (at most 4 files)
- tests: `apps/web/lib/__tests__/home-money.test.ts`, `apps/web/lib/__tests__/home-money-route.test.ts`, `apps/web/components/__tests__/home-money-page.test.tsx`

Changed:
- `apps/web/components/dashboard/owner-daily-ops-home.tsx`
- `apps/web/components/__tests__/owner-daily-ops-home.test.tsx`
- `apps/web/components/bank-feed/page-shell.tsx`
- `apps/web/lib/csv-export-reports.ts` (only to export or reuse the escape helper)

Each file must be at most 400 lines, and each line at most 140 characters. Do not compact code to meet the limits (L-015).

## 6. Implementation requirements
- Integer cents everywhere. Format with the existing currency formatter (`formatCurrency` in `lib/format.ts`, if present).
- Dates are compared as `YYYY-MM-DD` strings in UTC. `paid_at` is converted to its UTC date.
- Reversed payments are excluded. Waived or deleted charges never produce late-rent alerts.
- Never log amounts, descriptions or tenant names. Logs use fixed operation names only.
- The page and the route both scope strictly to properties the user administers in the chosen ownership account. Never trust a `property` or `account` param without checking it.
- The user should never need to read instructions to understand this page. Every number has a plain label.

## 7. Validation commands to run
- `npx vitest run` on the three new test files plus `owner-daily-ops-home.test.tsx` and all `bank-feed-*` tests
- `npx tsc -p apps/web/tsconfig.json --noEmit`
- `npm run lint:web`

## 8. Acceptance criteria (binary)
1. Unit tests for `lib/home-money.ts` cover:
   - **Running balance:** +2350, −1039.44, −1039.44, −266.40, −92.00, −59.99 → final −147.27. Each step's balance is correct.
   - **`groupByCategory`:** "Rent" first, then "Mortgage" 2078.88 (two rows combined), "Solar", "Water", "Pest control".
   - **Late rent:**
     - due Oct 1, grace null, pending, today Oct 5 → no alert;
     - today Oct 6 → alert;
     - paid → no alert;
     - waived → no alert.
   - **Higher than usual:**
     - water 92, 90, 94 then 130 → alert;
     - 92, 90, 94 then 110 → no alert;
     - only 1 prior month → no alert.
   - **Reversed payment** excluded from totals.
   - **CSV:** correct header and rows; a description starting with "=" is neutralised; dollars have 2 decimals.
2. Route tests:
   - no session → 401;
   - non-owner → 403;
   - unknown param → 400;
   - only administered properties of the chosen account are returned (a foreign `account` falls back to the user's own);
   - at most 3 homes plus `moreCount`;
   - `Cache-Control: private, no-store`.
3. Page and component tests:
   - a foreign `property` falls back to an allowed one;
   - the profit card shows "Left after bills" with a negative value in red style;
   - the empty state links to `/owner/bank`;
   - the month tabs set `?month=`;
   - "Download for taxes" calls the CSV builder.
4. Home card tests:
   - an owner sees a skeleton, then numbers from a mocked fetch;
   - the error state shows the bank link;
   - the manager view shows no card.
5. The targeted tests, typecheck and lint pass. Only §5 files changed. Size and line limits hold.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
- No DB writes or migrations, no deploy, no commit, no push.
- Never modify, revert or format files outside §5. Never touch `.claude/launch.json`, `docs/`, `CLAUDE.md` or `AGENTS.md`.
- No new dependencies. Do not invent URLs or emails. The only new routes are `/owner/money` and `/api/owner/home-money`.
