# Sprint 202 — Accurate tax summary: Form 1098 interest, escrow, depreciation (L3: money reports + schema) · Category 1 (Owner) / 5 (Money)

## 1. Objective
The owner's #4 must-have is a tax-time summary. Today `getTaxSummaryReport` (`apps/web/lib/reports-pnl.ts:246`) maps every `"mortgage"` expense to **mortgageInterest** (`mapExpenseCategoryToTaxField`, l.47–78). A mortgage payment usually includes principal (not deductible) and often escrowed tax and insurance, so deductions are **overstated**. Also there is no depreciation line, and the Tax Summary table (`components/reports/tax-summary-report.tsx`) doesn't even show the mortgage-interest column. Fix it with per-home, per-year **owner inputs**: mortgage interest from Form 1098, escrow-paid property tax and insurance, and depreciation from the owner's tax preparer. Domus does **not** calculate depreciation or give tax advice.

## 2. Context
- **Schema (Claude applies before deploy; Codex must not touch the DB):** `supabase/migrations/20261008_sprint202_property_tax_years.sql` creates `public.property_tax_years(property_id, tax_year, mortgage_interest_cents, escrow_property_tax_cents, escrow_insurance_cents, depreciation_cents, updated_by, created_at, updated_at)`, PK `(property_id, tax_year)`, all amounts ≥ 0 with default 0, RLS **owner members only** (managers excluded), anon revoked, and no delete policy. Read it; don't edit it.
- `getTaxSummaryReport(userId, year)` uses `getLeasesForScope(userId)` (owner scope) and the admin client; income = payments in the year; expenses = `property_expenses` in the year mapped to Schedule E fields. Its payments/expenses query errors are **not checked** today.
- Monthly P&L (`getMonthlyPnLReport`) and cash flow: full mortgage payments as expenses is **correct for cash flow; do not change it**.
- Owner reports page `app/owner/reports/page.tsx` (owner-only route) loads the tax summary for `reportYear`. CSV export lives in `lib/csv-export-reports.ts`.
- Auth: `requireAuth("owner")` (S197-hardened). An owner-member check exists in SQL as the first branch of `can_administer_property`. In TS, use or add a helper `isOwnerMemberOfProperty(userId, propertyId)` that checks `ownership_account_members` (`member_role = 'owner'`, `active = true`) for the property's `owner_account_id` (managers must fail).
- Plain-language rules; owner word list (CLAUDE.md §18).

## 3. In scope
1. **Tax math (`getTaxSummaryReport`):**
   - Load `property_tax_years` for the in-scope property ids and `year` (explicit columns; error checked).
   - `mortgageInterest` = the home's `mortgage_interest_cents` input (0 if no row). **`"mortgage"` expenses no longer feed any tax field.** Add `mortgagePaymentsCashFlow` (sum of `"mortgage"` expenses, shown for information only, **not** in `totalExpenses`).
   - `taxes` = `property_tax` expenses + `escrow_property_tax_cents`; `insurance` = `insurance` expenses + `escrow_insurance_cents`.
   - New `depreciation` = `depreciation_cents`; included in `totalExpenses`.
   - `totalExpenses` = all Schedule E fields incl. `depreciation`, excluding `mortgagePaymentsCashFlow`; `netIncome` = income − totalExpenses.
   - New flag `needsInputs: boolean` = true when the home had `"mortgage"` expenses in the year but no input row (or interest 0), so the UI can prompt.
   - Check the payments and expenses query errors (throw → the existing error handling); don't silently treat a failed query as 0.
2. **Save action** `app/actions/property-tax-year.ts` → `savePropertyTaxYear(prev, formData)`: `requireAuth("owner")`; rate limit 30/h/user; Zod: `propertyId` uuid, `taxYear` int 2000–2100, four dollar amounts (≥ 0, max 2 decimals, ≤ 10,000,000; blank → 0) → cents; **owner-member check** for that property (managers and other owners → `"You can't edit this home."`, no write); upsert on `(property_id, tax_year)` with `updated_by = user.id`, `updated_at = now()`; check the error; `revalidatePath("/owner/reports")`; success `{ success: true, message: "Saved." }`; failure `{ success: false, error: "Could not save. Please try again." }`. Those are all the strings (L-020).
3. **Tax Summary UI** (`tax-summary-report.tsx`, splitting into a child component if it would pass 500 lines):
   - Add columns `Mortgage interest`, `Depreciation`; keep the others.
   - Under the table: `Mortgage payments are cash flow, not a tax deduction. Enter your Form 1098 interest below.` and `Domus does not give tax advice. Check numbers with your tax preparer.`
   - Per home, a small form `Tax numbers for {year}` with fields `Mortgage interest (Form 1098)`, `Property tax paid by your lender (escrow)`, `Insurance paid by your lender (escrow)`, `Depreciation (from your tax preparer)`, prefilled from the saved row; button `Save`; help line under the escrow fields: `Only enter amounts your lender paid. Don't also add them as expenses.`
   - Homes with `needsInputs` show a warning badge `Add Form 1098 interest`.
4. **CSV export:** add `Mortgage interest`, `Depreciation`, `Mortgage payments (cash flow only)` columns to the tax-summary CSV (keep existing columns and order; append new ones).
5. **Tests** (real assertions):
   - math: a home with $12,000 mortgage payments + 1098 interest $7,000 → mortgageInterest 7,000; mortgage payments never in totalExpenses; escrow added to taxes/insurance; depreciation included; net correct; no input row → interest 0 + `needsInputs` true; home without mortgage expenses → `needsInputs` false.
   - query errors (payments, expenses, tax years) → error path, not zeros.
   - action: manager → refused, no write; owner of another account → refused; bad amounts (negative, 3 decimals, > 10M, text) → validation error; blank → 0; upsert payload exact (cents, updated_by); DB error → failure string; rate limit.
   - UI: new columns render; form prefill; warning badge; notes text.
   - CSV: new columns appended.

## 4. Out of scope
Computing depreciation or any tax advice; splitting individual mortgage payments into principal/interest; changing monthly P&L or cash-flow numbers; managers seeing or editing tax inputs; applying the migration; notifications.

## 5. Exact files expected to change
`apps/web/lib/reports-pnl.ts`, `apps/web/components/reports/tax-summary-report.tsx` (+ child component if needed), `apps/web/app/actions/property-tax-year.ts` (new), the validations module (schema), `apps/web/lib/property-access.ts` (owner-member helper, only if none exists), `apps/web/lib/csv-export-reports.ts`, `apps/web/app/owner/reports/page.tsx` (pass the saved inputs + action if needed), DB types file if the repo keeps one, and tests.

## 6. Implementation requirements
Exact copy; sentences ≤ 12 words; plain-language guard passes. Lines ≤ 140; files ≤ 500; every Supabase result checked; money in integer cents internally. No new dependencies. The user should never need to read instructions to complete this flow. Every step must be self-explanatory.

## 7. Validation commands to run
`npm run lint:web`; `npx tsc --noEmit -p apps/web/tsconfig.json`; new tests + tests importing changed files (`grep -rlE "reports-pnl|tax-summary-report|csv-export-reports|property-tax-year|property-access" apps/web --include=*.test.ts --include=*.test.tsx`); `lib/__tests__/plain-language.test.ts`; `npm run build --workspace @domus/web`.

## 8. Acceptance criteria (binary)
1. Mortgage expenses no longer count as interest or as tax expenses; interest comes only from the owner's input; escrow and depreciation are applied as in §3.1; monthly P&L unchanged.
2. Only owner members can save; managers and other owners are refused with no write.
3. UI shows the new columns, notes, per-home form and warning; CSV has the new columns.
4. All §3.5 tests are real assertions; lint, typecheck, guard and build pass; only §5 files changed.

## 8b. Post-deploy (Claude only)
Apply the migration and verify table, RLS, policies and no anon access. Smoke owner: Reports → Tax Summary for 2026; enter test numbers on Smoke Test Property; save; table and CSV reflect them; then reset them to 0. The smoke manager cannot reach the owner reports route or write tax rows (SQL policy check as that user, if feasible). Light/dark, 375/1280, 0 console errors; smoke; Sentry; CI.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB access or migration apply, no deploy, commit or push. Never touch `.claude/launch.json`. Notifications stay OFF.
