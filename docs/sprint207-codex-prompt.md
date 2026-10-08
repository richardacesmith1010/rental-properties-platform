# Sprint 207 — Monthly owner statement for client accounts (L3: money report) · Category 3 (Manager) / 5 (Money)

## 1. Objective
A manager can make a monthly **owner statement** (PDF and CSV) for each client account, to send to an owner who isn't on Domus. Both files come from **one** server function, so they always match each other and the underlying records.

**Approved design:** https://claude.ai/artifact/CT1mZ4eyHhrL1R2RJJ7uhH, row 2: screen 6 "Get an owner statement" sheet and screen 7 the PDF (letter). The figures in the design are samples.

## 2. Context (verified live 2026-10-08)
- **Client accounts (Sprints 205/206):** `lib/client-accounts.ts` (`isActiveClientManager`, which fails closed and throws on error), `lib/client-overview.ts`, client page `app/manager/clients/[accountId]/page.tsx` plus `components/dashboard/clients/client-detail.tsx`. Rent for client homes is always outside Domus (a DB trigger enforces it). The statement is for client accounts only.
- **Schema:**
  - `payments(id, rent_charge_id, paid_at timestamptz, amount_cents int, method ach|card|cash|check|other, reference_note, reversed_at timestamptz, …)`
  - `rent_charges(id, lease_id, due_date date, amount_cents, status pending|paid|late|waived, category rent|late_fee|deposit|utility|other, parent_charge_id, deleted_at, tenant_reported_paid_at, …)`
  - `leases(id, unit_id, tenant_profile_id, …)`, `units(id, property_id, unit_number)`, `properties(id, owner_account_id, name, address_line1, city, state, postal_code, active)`
  - `property_expenses(id, property_id, category mortgage|insurance|property_tax|hoa|repair|maintenance|utility|management_fee|legal|other, description, amount_cents, expense_date date)`
  - `profiles(id, full_name)`. Properties have **no time-zone column**: use `America/Denver` everywhere.
- **Existing PDF pattern:** `@react-pdf/renderer` (already a dependency). Routes are `app/api/pdf/*/route.ts` with `renderToBuffer` and `runtime = "nodejs"`. Templates and styles live in `lib/pdf/*-template.tsx` and `lib/pdf/pdf-styles.ts`. The `Content-Disposition: attachment` and `Cache-Control: private, no-store` pattern is in `app/api/pdf/receipts/route.ts`. Auth is `getCheckedAuthUser` / `requireRole` from `lib/auth.ts`.
- **CSV escaping:** `escapeCell` in `lib/csv-export-reports.ts` blocks formulas starting with `= + - @`. Reuse it, and add `\t` and `\r` to its formula-prefix check. That small fix is in scope.

## 3. In scope
1. **`lib/owner-statement.ts`** (`import "server-only"`; admin client; explicit columns; every error checked and thrown; batched `.in()` with no per-row queries; integer cents only):
   - `getOwnerStatement(managerId, accountId, month: "YYYY-MM")`:
     1. Calls `isActiveClientManager(managerId, accountId)` first. False → throw `StatementAccessError`.
     2. Loads the account (must be `managed_client`), with active and archived homes in the account. Archived homes are included only if they have activity in the month.
   - **Month window:** from `month`-01 00:00 to the next month's 01 00:00 in `America/Denver`, converted to UTC instants for `timestamptz` comparisons. For `date` columns compare `YYYY-MM-DD` strings.
   - **Rules (cash basis; each rule gets one test):**
     1. **Payments recorded** = payments on charges of this account's homes with `paid_at` in the month and category ≠ `deposit`. Each is a `+amount` line.
     2. **Reversals:** a payment with `reversed_at` in the month adds a `−amount` line labeled `Reversed`, whatever month it was paid in. Paid and reversed in the same month gives both lines, netting to 0.
     3. **Late fees** (`late_fee`), `utility` and `other` count when paid (rule 1). Line labels: `Rent`, `Late fee`, `Utility`, `Other`.
     4. **Deposits** (`deposit`) paid in the month are listed under "Not counted above" as `Security deposit held`. They're never in the totals.
     5. **Waived** charges (`status = waived`) with `due_date` in the month are listed under "Not counted above" as `Waived`. Never in the totals.
     6. **Tenant "I paid" reports** (`tenant_reported_paid_at`) never count unless a payment row exists.
     7. **Expenses** = `property_expenses` with `expense_date` in the month, for the account's homes. Labels: `Mortgage`, `Insurance`, `Property tax`, `HOA`, `Repair`, `Upkeep` (maintenance), `Utility`, `Management fee`, `Legal`, `Other`.
     8. **Net** = payments recorded (including negative reversal lines) − expenses.
     9. **Still owed at month end:** for each charge with `deleted_at IS NULL`, `due_date ≤ month end`, status ≠ `waived` and category ≠ `deposit`, take amount − the sum of its payments with `paid_at <` the next month start and (`reversed_at IS NULL` or `reversed_at ≥` the next month start). Include it when that's > 0. Each line shows home/unit, due date and amount owed.
     10. **Excluded:** deleted charges (`deleted_at` not null) and payments on them.
   - **Returns** `OwnerStatement`:
     - `{ account: { id, name, accountType }, month, monthLabel ("October 2026"), periodLabel ("October 1 – 31, 2026"), preparedBy: { name, email }, generatedAt }`;
     - `totals: { paymentsCents, expensesCents, netCents, stillOwedCents }`;
     - `homes: [{ id, name, paymentsCents, expensesCents, netCents }]`, including homes with all zeros, active ones only, sorted by name;
     - `payments: [{ date, homeLabel, tenantLabel, kindLabel, methodLabel, amountCents }]` sorted by date;
     - `expenses: [{ date, homeLabel, kindLabel, note, amountCents }]`;
     - `notCounted: [{ label, homeLabel, date, amountCents }]`;
     - `owed: [{ homeLabel, dueDate, amountCents }]`.
   - `homeLabel` is the home name, plus `, Unit {unit_number}` when the home has more than 1 unit. `tenantLabel` is the first initial + `. ` + last name from `full_name`, `Tenant` if it's missing. `methodLabel` comes from `lib/payment-method-label.ts`.
   - **Invariant (asserted in code and tested):** `totals.paymentsCents === Σ payments.amountCents === Σ homes.paymentsCents`, and the same for expenses. `netCents = payments − expenses`. If an invariant fails, throw. Never render a mismatched statement.
2. **`lib/owner-statement-csv.ts`:** `ownerStatementToCsv(statement)`. One CSV with sections and a blank row between each:
   - `Summary`: rows `Payments recorded`, `Expenses`, `Net`, `Still owed`;
   - `By home`;
   - `Payments recorded`;
   - `Expenses`;
   - `Not counted`;
   - `Still owed`.

   Amounts are plain decimals (`1450.00`; negatives `-1450.00`). Use `escapeCell` for every cell.
3. **PDF:** `lib/pdf/owner-statement-template.tsx` matches the approved design: header, 4 totals, By home table with a total row, Payments recorded, Expenses, Not counted above, Still owed, and the footer `Rent for these homes is paid outside Domus. These are the payments and expenses your manager recorded for {Month}.` Long lists flow onto more pages with repeated table headers and `Page X of Y`. Empty sections show `None this month.`
4. **Routes:** `GET app/api/pdf/owner-statement/route.ts` and `GET app/api/owner-statement/csv/route.ts`, with query `accountId` (uuid) and `month` (`^\d{4}-(0[1-9]|1[0-2])$`, not after the current Denver month, at most 36 months back).
   - Auth: signed-in user with role `manager`, else 401/403.
   - Rate limit 30/h per user, else 429.
   - `StatementAccessError` → 404 (don't leak existence).
   - Bad input → 400.
   - Other errors → 500 with `{ ok: false, error: "Could not make the statement. Please try again." }`.
   - Filenames: `owner-statement-{slug(account name)}-{YYYY-MM}.pdf` / `.csv`. The slug is lowercase a–z0–9 and `-`, max 40 characters.
   - Headers: `Cache-Control: private, no-store`, `Content-Disposition: attachment`.
5. **Server action** `getOwnerStatementSummary(accountId, month)` in `app/actions/owner-statement.ts` (`requireAuth("manager")`, Zod) returns `{ success: true, totals, homeCount }` for the sheet. Errors: `You can't see this client.` / `Could not load the statement. Please try again.`
6. **UI** (client page; match screen 6):
   - An `Owner statement` button in the client page header (≥ 44 px) opens a sheet (`mobile-drawer` on phone, `modal-overlay` on desktop).
   - Sheet contents: title `Owner statement`; line `{Client} · {N} homes. Send this to the owner each month.`; a `Month` select of the last 12 Denver months, newest first, defaulting to the previous month on day 1–10 and the current month otherwise.
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
4. **CSV:** escaping covers `=`, `+`, `-`, `@`, tab and carriage return (`escapeCell` test), and negative amounts are not prefixed.
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
