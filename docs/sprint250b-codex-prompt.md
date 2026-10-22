# Sprint 250b — Reports, dashboard months and form defaults use the Denver calendar day (L2) — rev 1

## 1. Objective
Sprint 250a (`bab4284`) made the money rules use the Denver (America/Denver) calendar day via
`apps/web/lib/denver-calendar.ts` (`todayDenver`, `denverDateOf`, `addDays`, `daysBetween`, `denverMonth`,
`denverYear`, `denverDayStartUtc`). Everything that still reads **the current clock** in UTC to pick "today", "this
month" or "this year" for a report, dashboard number or form default must switch to the same Denver day. After 5 pm
(MST) / 6 pm (MDT) Denver time the UTC date is already tomorrow, so today a landlord in the evening of October 31 sees
November in "this month", next month's date as the default, and CSV files named for tomorrow.

## 2. Context — clock-reading sites (from `grep`, HEAD `bab4284`)
Reports & exports: `app/owner/reports/page.tsx:42,44,59` (default year/options); `app/api/pdf/receipts/route.ts:33-34`;
`lib/reports-pnl.ts:96,276` (default year); `lib/reports-delinquency.ts:87,173`; `lib/reports-ledger.ts:183`;
`lib/owner-ytd.ts:23`; CSV names `components/reports/{rent-roll,tenant-ledger,delinquency,receivables,monthly-pnl,
tax-summary}-report.tsx`, `components/dashboard/charges/helpers.tsx:58`, `lib/csv-export.ts:24,37`.
Dashboards & money pages: `app/owner/money/resolve.ts:7,13`; `app/owner/money/page.tsx:104`;
`components/dashboard/dashboard-kpi-loader.ts:59-60,81,392-393`; `components/dashboard/dashboard-home-loader.ts:157`;
`components/dashboard/charges/charges-implementation.tsx:64,132`; `components/dashboard/owner-home/ytd-tiles.tsx:3`;
`lib/owner-wallet-home.ts:71-74,145`; `lib/owner-recent-activity.ts:21-23,60-61`; `lib/analytics-loader.ts:36-37,56,
77,79`; `lib/dashboard-legacy.ts:146,374-375`; `lib/dashboard-rpc.ts:89-90`; `lib/expenses.ts:100-102`;
`lib/home-money.ts` (current month / "today" / alert date); `lib/partners.ts:144`; `lib/ai-recent-payments.ts:68`;
`components/home-money/period-switch.tsx:11`, `tasks-card.tsx:23`.
Form defaults: `components/dashboard/deposit-return-sheet.tsx:19,58` (default + `max`);
`components/dashboard/charge-create-form.tsx:36` (first of next month); `components/dashboard/lease-wizard-support.tsx:34`
(first of next month); `components/home-money/task-sheet.tsx:13`, `settle-up-section.tsx:26`,
`partner-payment-sheet.tsx:14`.
**Not clock reads (leave alone):** pure arithmetic on a date string already chosen (e.g. `bank-feed/matching-context.ts`,
`bank-feed/csv.ts`, `validations-auth.ts`, `entity-validation.ts`, `lease-section-presentation.tsx:115-122`,
`lease-wizard-support.tsx:41-43`, `tenant-pay-state.ts:35,49`, `charge-generation.ts:38,73-89`), instants kept as
instants (`autopay.ts:39`, `lease-lifecycle.ts:152`, `manager-payments.ts:100` invoice number), copyright years in
`app/layout.tsx:50` and `app/login/page.tsx:37`.

## 3. In scope
1. At every §2 clock-reading site, derive the calendar date / month / year from `todayDenver()` / `denverMonth()` /
   `denverYear()` (or a `todayIso` already passed in), then do the existing date-string arithmetic. Month buckets of a
   **date-only** column (`due_date`, `expense_date`) compare strings; buckets of a **timestamp** column (`paid_at`,
   `created_at`) use `denverDateOf(ts)` (or the window bounds from `denverDayStartUtc`). Keep each function's signature
   unless a test seam is needed (an optional `today: string` parameter is fine).
2. Client form defaults: compute the default with `todayDenver()` (Intl with `timeZone`, works in the browser); where
   the server already passes `todayIso` (250a cards), use the prop. `max` on the deposit date = Denver today.
3. Audit table in the report: every §2 site → `converted` / `left alone (why)`; plus any further clock-reading site
   you find (`grep -rnE "new Date\(\)|Date\.now\(\)"` across `app components lib`, excluding tests) with its decision.

## 4. Out of scope
SQL functions (`owner_dashboard_payload`, retention report), cron schedule, per-user zones, 250a's converted files
(except as listed), display formatting (`lib/format.ts`), copy changes, layout.

## 5. Exact files expected to change
The §2 files marked for conversion, plus tests: `apps/web/lib/__tests__/denver-reports-250b.test.ts` (new) and
`apps/web/components/__tests__/denver-form-defaults-250b.test.tsx` (new). Existing tests only where a UTC-pinned
expectation must change (list each with the reason).

## 6. Implementation requirements
Use only `lib/denver-calendar.ts` helpers (no new zone code). No query inside a loop. Every Supabase error still
checked. Lines ≤ 140 characters. Fixtures: E = `2026-11-01T04:30:00Z` (Oct 31, 10:30 pm Denver), M =
`2026-11-01T12:00:00Z`; Y = `2027-01-01T05:00:00Z` (Dec 31, 10 pm Denver).

## 7. Validation
```
cd apps/web
npx vitest run lib/__tests__/denver-reports-250b.test.ts components/__tests__/denver-form-defaults-250b.test.tsx
TZ=Pacific/Kiritimati npx vitest run lib/__tests__/denver-reports-250b.test.ts components/__tests__/denver-form-defaults-250b.test.tsx
TZ=UTC npx vitest run lib/__tests__/denver-reports-250b.test.ts components/__tests__/denver-form-defaults-250b.test.tsx
```
then from the repo root `npm run gate:web`.

## 8. Acceptance criteria
- R1 At E: owner Money default range / "this month" is October 2026; KPI "this month" rent counts October due dates
  only; wallet home previous-month window is September; recent activity windows end at November 1 (exclusive) Denver.
  At M: November. (Assert the exact window strings returned.)
- R2 At Y: reports page default year, P&L default year, receipts PDF default year, YTD tiles/`owner-ytd` year are 2026;
  analytics "current month" key is `2026-12`, year start `2026-01-01`.
- R3 A payment with `paid_at = 2026-11-01T04:00:00Z` (Oct 31 Denver) lands in the **October** bucket of every
  month-bucketing loader that buckets `paid_at` (name each in the test).
- R4 Delinquency report at E uses `2026-10-31` as today (days-late values exact); ledger default today `2026-10-31`.
- R5 CSV file names at E end with `2026-10-31.csv` (all eight export sites; one table-driven test).
- R6 Form defaults at E: deposit return date `2026-10-31` and its `max` `2026-10-31`; charge-create due date and lease
  wizard start `2026-11-01`; at M they become `2026-11-01` / `2026-12-01`. Home-money task, settle-up and partner
  payment default `2026-10-31` at E.
- R7 Validation passes under all three `TZ` values; gate green (counts verbatim); audit table complete.

## 9. Report format
Compact status only: audit table, R1–R7 → test names, counts. Do NOT include 'Claude prompt' or 'recommended next
steps for Claude' sections. Report compact status only.

## 10. Constraints
Stay inside §5. Do not commit. No Undo needed (read paths and form defaults only; nothing is written by this change
itself). The user should never need to read instructions to complete this flow: after 6 pm in Denver the app still
shows today's month and today's date.
