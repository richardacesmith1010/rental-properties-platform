# Sprint 207 (rev 2; ChatGPT rev 1 REJECT, all REQUIRED + OPTIONAL adopted) — Monthly owner statement for client accounts (L3: money report) · Category 3 (Manager) / 5 (Money)

## 1. Objective
A manager can make a monthly **owner statement** (PDF and CSV) for each client account, to send to an owner who isn't on Domus. Each format is generated exclusively from the same `OwnerStatement` calculation and contains no accounting logic of its own.

**Approved design:** https://claude.ai/artifact/CT1mZ4eyHhrL1R2RJJ7uhH, row 2: screen 6 "Get an owner statement" sheet and screen 7 the PDF (letter). The figures in the design are samples.

## 2. Context (verified live 2026-10-08)
- **Migration (Claude applies before deploy; Codex must not touch the DB):** `supabase/migrations/20261009_sprint207_rent_charge_waived_at.sql` adds `rent_charges.waived_at timestamptz`. A trigger sets it to `now()` when status becomes `waived` and clears it when status leaves `waived`. Existing waived rows have `waived_at = NULL`, meaning "waived at an unknown time". Add the column to the DB types if the repo keeps them.
- **Client accounts (Sprints 205/206):** `lib/client-accounts.ts` (`isActiveClientManager`, which fails closed and throws on error), `lib/client-overview.ts`, client page `app/manager/clients/[accountId]/page.tsx` plus `components/dashboard/clients/client-detail.tsx`. Rent for client homes is always outside Domus (a DB trigger enforces it). The statement is for client accounts only.
- **Schema:**
  - `payments(id, rent_charge_id, paid_at timestamptz, amount_cents int, method ach|card|cash|check|other, reference_note, reversed_at timestamptz, …)`
  - `rent_charges(id, lease_id, due_date date, amount_cents, status pending|paid|late|waived, category rent|late_fee|deposit|utility|other, parent_charge_id, deleted_at, tenant_reported_paid_at, …)`
  - `leases(id, unit_id, tenant_profile_id, …)`, `units(id, property_id, unit_number)`, `properties(id, owner_account_id, name, address_line1, city, state, postal_code, active)`
  - `property_expenses(id, property_id, category mortgage|insurance|property_tax|hoa|repair|maintenance|utility|management_fee|legal|other, description, amount_cents, expense_date date)`
  - `profiles(id, full_name, email)`. `preparedBy` = the manager's `profiles.full_name` and `profiles.email`, via one query by `managerId`. Properties have **no time-zone column**: use `America/Denver` everywhere.
- **Existing PDF pattern:** `@react-pdf/renderer` (already a dependency). Routes are `app/api/pdf/*/route.ts` with `renderToBuffer` and `runtime = "nodejs"`. Templates and styles live in `lib/pdf/*-template.tsx` and `lib/pdf/pdf-styles.ts`. The `Content-Disposition: attachment` and `Cache-Control: private, no-store` pattern is in `app/api/pdf/receipts/route.ts`. Auth is `getCheckedAuthUser` / `requireRole` from `lib/auth.ts`.
- **CSV escaping:** `escapeCell` in `lib/csv-export-reports.ts` blocks formulas starting with `= + - @`. Reuse it, and add tab, CR and LF to its formula-prefix check, keeping `-`. That small fix is in scope.

## 3. In scope
1. **`lib/owner-statement.ts`** (`import "server-only"`; admin client; explicit columns; every error checked and thrown; batched `.in()` with no per-row queries; integer cents only):
   - `getOwnerStatement(managerId, accountId, month: "YYYY-MM")`:
     1. Calls `isActiveClientManager(managerId, accountId)` first. False → throw `StatementAccessError`.
     2. Loads the account (must be `managed_client`), with active and archived homes in the account. Archived homes are included only if they have activity in the month.
   - **Month window:** from `month`-01 00:00 to the next month's 01 00:00 in `America/Denver`, converted to UTC instants for `timestamptz` comparisons. For `date` columns compare `YYYY-MM-DD` strings.
   - **Payment rows to load:** payments on charges of the account's homes where (`paid_at` ∈ month) OR (`reversed_at` ∈ month), plus every payment needed for rule 9 (`paid_at` < nextMonthStart on candidate charges). Deduplicate by payment id. A payment with both `paid_at` and `reversed_at` in the month produces two lines.
   - **Charge state as of a cutoff `C` (= nextMonthStart):**
     - *deleted as of C* means `deleted_at IS NOT NULL AND deleted_at < C`;
     - *waived as of C* means `status = 'waived' AND (waived_at IS NULL OR waived_at < C)`, where NULL means waived at an unknown time and counts as waived.
   - **Rules (cash basis; each rule gets at least one test):**
     1. **Payments recorded:** payments with `paid_at` ∈ month, on charges that are not deleted as of C, and category ≠ `deposit`. Each is a `+amount` line dated by the Denver date of `paid_at`.
     2. **Reversals:** a non-deposit payment with `reversed_at` ∈ month adds a `−amount` line labeled `Reversed`, dated by the Denver date of `reversed_at`, whatever month it was paid in. This applies only if the charge is not deleted as of C. Paid and reversed in the same month gives both lines, netting to 0.
     3. **Line labels:** `late_fee`, `utility` and `other` count when paid (rule 1). Labels: `Rent`, `Late fee`, `Utility`, `Other`.
     4. **Deposits:** deposit payments never touch `paymentsCents`, `homes[].paymentsCents` or `net`.
        - A deposit paid in the month is a `notCounted` line `Security deposit held` (+amount, Denver date of `paid_at`).
        - A deposit reversed in the month is a `notCounted` line `Security deposit returned` (−amount, Denver date of `reversed_at`).
     5. **Waived:** charges with `waived_at` ∈ month are `notCounted` lines `Waived` (amount, Denver date of `waived_at`). Charges waived with `waived_at IS NULL` are never listed and never owed. Never in the totals.
     6. **Tenant "I paid" reports** (`tenant_reported_paid_at`) never count unless a payment row exists.
     7. **Expenses:** `property_expenses` with `expense_date` ∈ month, for the account's homes. Line date = `expense_date`. Labels: `Mortgage`, `Insurance`, `Property tax`, `HOA`, `Repair`, `Upkeep` (maintenance), `Utility`, `Management fee`, `Legal`, `Other`.
     8. **Net** = payments recorded (including negative reversal lines) − expenses.
     9. **Still owed at month end.** Take each charge with `due_date` ≤ month end and category ≠ `deposit` that is not deleted as of C and not waived as of C. Its owed amount is `max(0, amount − Σ payments with paid_at < C and (reversed_at IS NULL or reversed_at ≥ C))`. Include it when > 0. Line date = `due_date`. An overpayment is never negative.
     10. **Deletion policy:** a payment on a charge deleted before C is excluded from that month (it was undone). A charge deleted on or after C still shows normally in that month's statement, so later deletions don't rewrite past months.
   - **Wording:** the report is a month-end snapshot. Every amount is computed only from timestamps, so a statement for a past month doesn't change when charges are later waived or deleted. The only exception is legacy waivers with `waived_at = NULL`.
   - **Homes:** `homes` = every active home of the account (zero rows included), plus any archived home with at least one payment, reversal, deposit, waiver, expense or owed line in the statement.
   - **Stable sorting:**
     - payments: by date, then homeLabel, then payment id (`+` line before `−` line for the same id);
     - expenses: by date, homeLabel, id;
     - notCounted: by date, label, homeLabel;
     - owed: by dueDate, homeLabel;
     - homes: by name, then id.
   - **Returns** `OwnerStatement`:
     - `{ account: { id, name, accountType }, month, monthLabel ("October 2026"), periodLabel ("October 1 – 31, 2026"), preparedBy: { name, email }, generatedAt }`;
     - `totals: { paymentsCents, expensesCents, netCents, stillOwedCents }`;
     - `homes: [{ id, name, paymentsCents, expensesCents, netCents }]`, including homes with all zeros, active ones only, sorted by name;
     - `payments: [{ date, homeLabel, tenantLabel, kindLabel, methodLabel, amountCents }]` sorted by date;
     - `expenses: [{ date, homeLabel, kindLabel, note, amountCents }]`;
     - `notCounted: [{ label, homeLabel, date, amountCents }]`;
     - `owed: [{ homeLabel, dueDate, amountCents }]`.
   - `homeLabel` is the home name, plus `, Unit {unit_number}` when the home has more than 1 unit. `tenantLabel` is the first initial + `. ` + last name from `full_name`, `Tenant` if it's missing. `methodLabel` comes from `lib/payment-method-label.ts`.
   - **Invariants (asserted in code and tested; throw `StatementInvariantError` on failure, never render):**
     - `totals.paymentsCents === Σ payments.amountCents === Σ homes.paymentsCents`;
     - the same for expenses;
     - for every home, `netCents === paymentsCents − expensesCents`;
     - `totals.netCents === totals.paymentsCents − totals.expensesCents`;
     - `totals.stillOwedCents === Σ owed.amountCents`;
     - every owed amount is > 0.
2. **`lib/owner-statement-csv.ts`:** `ownerStatementToCsv(statement)`. One CSV with sections and a blank row between each:
   - `Summary`: rows `Payments recorded`, `Expenses`, `Net`, `Still owed`;
   - `By home`;
   - `Payments recorded`;
   - `Expenses`;
   - `Not counted`;
   - `Still owed`.

   Amounts are plain decimals (`1450.00`; negatives `-1450.00`). They're trusted numeric cells, formatted from integer cents by our own code, and written with plain CSV quoting **without** the formula prefix, using a new `escapeAmountCell(cents)`. Every text cell (names, labels, notes, dates) uses `escapeCell`, which keeps its formula protection.
3. **PDF:** `lib/pdf/owner-statement-template.tsx` matches the approved design: header, 4 totals, By home table with a total row, Payments recorded, Expenses, Not counted above, Still owed, and the footer `Rent for these homes is paid outside Domus. These are the payments and expenses your manager recorded for {Month}.` Long lists flow onto more pages with repeated table headers and `Page X of Y`. Empty sections show `None this month.`
4. **Routes:** `GET app/api/pdf/owner-statement/route.ts` and `GET app/api/owner-statement/csv/route.ts`, with query `accountId` (uuid) and `month` (`^\d{4}-(0[1-9]|1[0-2])$`, not after the current Denver month, at most 36 months back).
   - Auth: signed-in user with role `manager`, else 401/403.
   - Rate limit 30/h per user, else 429.
   - `StatementAccessError` → 404 (don't leak existence).
   - Bad input → 400.
   - Other errors → 500 with `{ ok: false, error: "Could not make the statement. Please try again." }`.
   - **Denver "today":** the latest allowed month is the current `America/Denver` month, computed on the server, never from the browser or machine time zone. The clock is injectable (`now` parameter) for tests.
   - Filenames: `owner-statement-{slug(account name)}-{YYYY-MM}.pdf` / `.csv`. The slug is lowercase a–z0–9 and `-`, max 40 characters.
   - Headers: `Cache-Control: private, no-store`, `Content-Disposition: attachment`.
5. **Server action** `getOwnerStatementSummary(accountId, month)` in `app/actions/owner-statement.ts` (`requireAuth("manager")`, Zod) returns `{ success: true, totals, homeCount }` for the sheet. Errors: `You can't see this client.` / `Could not load the statement. Please try again.`
6. **UI** (client page; match screen 6):
   - An `Owner statement` button in the client page header (≥ 44 px) opens a sheet (`mobile-drawer` on phone, `modal-overlay` on desktop).
   - Sheet contents: title `Owner statement`; line `{Client} · {N} homes. Send this to the owner each month.`; a `Month` select of the last 12 Denver months, newest first, defaulting to the previous month on Denver day 1–10 and the current month otherwise. The default and the month list come from the server (`America/Denver`) as props, never from the browser time zone.
   - Totals box: `Payments recorded`, `Expenses`, `Net`, and `Still owed` in the warn color when > 0. It loads via the action and shows `Loading…` while loading.
   - Buttons `Download PDF` and `Download CSV` are `<a href>` to the routes with a `download` attribute.
   - Note: `Counts payments you marked paid this month. Deposits are listed but not counted.`

7. **Small 206c follow-up.** After `createClientAccount` succeeds in `ClientsSection`, call `router.refresh()` (`next/navigation`). That way the page header, which reads the server-loaded `clients` prop, switches from `Add` to `Add client` without a manual reload. Test: `refresh` is called once on success and not on error.

## 4. Out of scope
Statements for owner (non-client) accounts; emailing the statement (notifications OFF); claim; DB changes; editing payments or expenses.

## 5. Exact files expected to change
New:
- `apps/web/lib/owner-statement.ts`
- `apps/web/lib/owner-statement-csv.ts`
- `apps/web/lib/pdf/owner-statement-template.tsx`
- `apps/web/app/api/pdf/owner-statement/route.ts`
- `apps/web/app/api/owner-statement/csv/route.ts`
- `apps/web/app/actions/owner-statement.ts`
- `apps/web/components/dashboard/clients/owner-statement-sheet.tsx`
- tests

Changed:
- `apps/web/components/dashboard/clients/client-detail.tsx`
- `apps/web/components/dashboard/clients/clients-section.tsx` (item 7 only)
- `apps/web/lib/csv-export-reports.ts` (the `escapeCell` `\t`/`\r` change only)
- the validations module

## 6. Implementation requirements
- Exact copy. Sentences ≤ 12 words. The plain-language guard passes. Never write "charge" in UI or file text.
- Money is integer cents end to end, formatted only at render (`$1,450.00`, negatives `−$1,450.00`).
- Every Supabase result is checked. No query inside a loop.
- Lines ≤ 140; files ≤ 500. No new dependencies.
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory.

## 7. Validation commands to run
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- New tests, plus every test importing a changed file
- `lib/__tests__/plain-language.test.ts`
- `npm run build --workspace @domus/web`

## 8. Acceptance criteria (binary)
1. **Rules 1–10 each have a real test** with a fixture. Also test:
   - the Denver month edge: a payment at 2026-11-01T05:30Z counts in **October**, and one at 2026-11-01T07:00Z counts in November;
   - a payment from September reversed in October gives one `−` line in October;
   - a partial payment is owed only for the remainder;
   - an overpayment gives 0 owed;
   - a deposit paid in September and returned in October: October totals are unchanged, with a `Security deposit returned` line;
   - a charge waived in November (`waived_at` in Nov) is still owed in the October statement;
   - a legacy waived charge (`waived_at` NULL) is never owed;
   - a charge soft-deleted in November keeps its October payment in the October statement;
   - a charge deleted in October drops its October payment;
   - a reversal exactly at `nextMonthStart` doesn't reduce the prior month's owed amount;
   - each invariant throws on tampering;
   - Denver clock edges: day 10 → previous month, day 11 → current month, the UTC date differing from the Denver date, and December → January;
   - an archived home with activity is included, and an archived home without activity is not.
2. **Reconciliation test:** for a fixture with 3 homes, 2 units on 1 home, mixed categories, a reversal, a deposit, a waiver and expenses:
   - the totals equal the hand-computed numbers;
   - the CSV `Summary` rows equal `statement.totals`;
   - the CSV section line counts equal the statement arrays;
   - the invariant check throws on a tampered statement.
3. **Access:**
   - an inactive or foreign manager → `StatementAccessError` → route 404, with no data queries after the access check;
   - an owner or tenant role → 403;
   - signed out → 401;
   - bad month or uuid → 400;
   - a future month → 400;
   - rate limit → 429.
4. **CSV:** `escapeCell` protects text starting with `=`, `+`, `-`, `@`, tab, CR or LF (test each one). `escapeAmountCell(-145000)` gives `"-1450.00"` with no prefix. A text cell `-1+1` is still prefixed.
5. **UI:**
   - the button opens the sheet;
   - the default month rule (day 10 vs day 11);
   - the totals render;
   - the download links have the right hrefs;
   - the action's error text renders.
6. **PDF:** the template renders with `renderToBuffer` for an empty month and for a 60-payment month (multi-page) without throwing.
7. All tests are real assertions (L-017). Lint, typecheck, guard and build pass. Only the listed files changed.

## 8b. Post-deploy (Claude)
1. As the smoke manager, create a test client, home, unit and lease.
2. Record by SQL (service role): payments across the month edge, a reversal, a deposit, a waiver and expenses.
3. Download the PDF and CSV from the live sheet. Check every number against a hand calculation and a SQL query, and check the PDF visually.
4. Check access: another account gets 404, and owner and tenant get 403.
5. Clean up the test data. Then smoke, CI and Sentry.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB access or migrations, no deploy, commit or push. Never touch `.claude/launch.json`. Notifications stay OFF.
