# Sprint 243a — Show times in Mountain time, not UTC (L2)

## 1. Objective
Every **instant** (a timestamptz, such as `created_at`, `paid_at`, `sent_at`, `balance_as_of`, or "now") must display in
the Domus display zone, **America/Denver**. Today the app shows UTC: a message sent at 10:37 PM MDT shows "4:37 AM", and a
payment made at 9 PM MDT shows the next day's date. Every **calendar date** (a Postgres `date` / `YYYY-MM-DD` string, such
as `due_date`, lease `start_date`) must keep its exact current output. The output must be the same on the server, in CI
(UTC) and in any browser zone, so SSR and hydration always agree.

## 2. Context
- HEAD `d9053f9`. Next.js 15, `apps/web`.
- `apps/web/lib/format.ts` (189 lines): `formatDate`, `formatDateTime`, `formatShortDateTime`, `formatMonthDay` all use
  formatters with `timeZone: "UTC"` (lines 18–46). `formatRelativeTime` (line 132) falls back to `formatDateTime` /
  `formatDate`. About 125 call sites use these four functions with a mix of calendar dates and instants.
- `apps/web/lib/statement-month.ts` (68 lines) already has `STATEMENT_ZONE = "America/Denver"` and `denverDate(now)`.
- `apps/web/lib/client-overview.ts` (158 lines) has its own `todayInZone(now, zone = "America/Denver")` (line 34).
- Tests: `apps/web/lib/__tests__/format.test.ts` (146 lines) currently pins UTC output.
- No time-zone column exists. Per-user zones are a later sprint (243b). Rent "today/late" day cutoffs are a later sprint.

## 3. In scope
1. One display-zone constant and a calendar-vs-instant rule inside `lib/format.ts`.
2. Fix the call sites listed in §5 that format instants with UTC, a `.slice(0, 10)` of an instant, or the host zone.
3. Make `statement-month.ts` and `client-overview.ts` use the shared constant (no behavior change).
4. Tests in §8.

## 4. Out of scope
- Any per-user or per-property time zone, profile column, cookie or setting.
- Rent logic that decides "today", "this month", late, due, or which month a payment counts in (`charge-generation`,
  `delinquency`, `tenant-pay-state`, `owner-recent-activity`, `home-money`, reports, analytics, cron). Do not touch them.
- Emails and notification bodies (they only format calendar dates today).
- Any copy change other than the date/time text itself. No layout or styling changes.
- Calendar-date sites that already use their own `toLocaleDateString(..., { timeZone: "UTC" })` on `YYYY-MM-DDT00:00:00Z`
  (deposit-return-sheet, home-pass-card, recent-activity, homes-wallet, period-switch, every-item, tasks-card,
  monthly-lease-ledger, home-money, analytics-loader). They are correct; leave them.

## 5. Exact files expected to change
- `apps/web/lib/format.ts`
- `apps/web/lib/__tests__/format.test.ts`
- `apps/web/lib/statement-month.ts` (constant only)
- `apps/web/lib/client-overview.ts` (default zone only)
- `apps/web/components/dashboard/charge-row.tsx` (line ~178, "Tenant says paid · …")
- `apps/web/components/dashboard/tenant-rent-card.tsx` (line 57 "Sent …", line 103 month label)
- `apps/web/components/dashboard/tenant-activity-timeline.tsx` (formatters at lines 56 and 62)
- `apps/web/components/dashboard/dashboard-header.tsx` (`formatHeaderDate`, line 47)
- `apps/web/components/bank-feed/bank-balances-card.tsx` (line 35)
- `apps/web/components/bank-feed/bank-connections-card.tsx` (line 137)
- `apps/web/lib/notification-preferences.ts` (line 172, paused-until label)
- `apps/web/lib/ai-assistant.ts` (`getLongDate` line 33, `getMonthYear` line 41)
- New test file: `apps/web/lib/__tests__/display-time-zone.test.ts` (B1, B2)
- New test file: `apps/web/components/__tests__/time-zone-display.test.tsx` (B3–B6; same setup as other component tests)
- Existing component tests in `apps/web/components/__tests__/` **only** if their expected date/time strings change because
  of this sprint (list each one in the report with old → new string and why).

## 6. Implementation requirements
1. In `lib/format.ts` export `DISPLAY_TIME_ZONE = "America/Denver"`.
2. Calendar-vs-instant rule, applied inside `formatDate`, `formatMonthDay`, `formatDateTime`, `formatShortDateTime`:
   - A **string** matching exactly `/^\d{4}-\d{2}-\d{2}$/` is a calendar date → format with the existing UTC formatter
     (output unchanged from today for every function).
   - Anything else that parses (full ISO string with time, or a `Date`) is an instant → format in `DISPLAY_TIME_ZONE`.
   - Invalid / null inputs keep today's behavior exactly (return the string, or "").
3. Export `formatMonthName(value)` → long month name (e.g. "October") with the same calendar-vs-instant rule. Use it in
   `tenant-rent-card.tsx:103`, which today builds `` `${lastPaidAt}T00:00:00.000Z` `` from a full `paid_at` timestamp
   (invalid date → `RangeError: Invalid time value` when `payState === "paid"`). Pass `lastPaidAt` straight in.
4. Long-date sites keep their own formatters but gain the zone:
   - `dashboard-header.tsx` `formatHeaderDate`: add `timeZone: DISPLAY_TIME_ZONE` to its existing options (keep weekday).
   - `ai-assistant.ts` `getLongDate`: add `timeZone: DISPLAY_TIME_ZONE`. `getMonthYear` takes a lease end date: if the
     value matches `YYYY-MM-DD` add `timeZone: "UTC"`, else `DISPLAY_TIME_ZONE` (same rule; you may reuse an internal
     helper from `format.ts`, exported once, not duplicated).
5. `tenant-activity-timeline.tsx`: add `timeZone: DISPLAY_TIME_ZONE` to both formatters.
6. `charge-row.tsx` "Tenant says paid · …" and `tenant-rent-card.tsx:57` "Sent …": pass the full `tenantReportedPaidAt`
   instant to `formatMonthDay` (no `.slice(0, 10)`, no hand-built UTC string). Copy around the date is unchanged.
7. `bank-balances-card.tsx:35` and `bank-connections-card.tsx:137`: replace `new Date(x).toLocaleDateString("en-US")`
   (host zone, "10/20/2026") with `formatDate(x)` ("Oct 20, 2026"). The words "as of" stay.
8. `notification-preferences.ts:172`: add `timeZone: DISPLAY_TIME_ZONE` to the existing options.
9. `statement-month.ts`: `export const STATEMENT_ZONE = DISPLAY_TIME_ZONE;` (import from `@/lib/format`). Nothing else.
10. `client-overview.ts`: `todayInZone(now, zone = DISPLAY_TIME_ZONE)`. Nothing else.
11. Do not create formatters per call in hot paths: module-level `Intl.DateTimeFormat` instances, like today.
12. Lines ≤ 140 characters. No new dependencies.

## 7. Validation
```
cd apps/web
npx vitest run lib/__tests__/format.test.ts lib/__tests__/display-time-zone.test.ts components/__tests__/time-zone-display.test.tsx
TZ=Pacific/Kiritimati npx vitest run lib/__tests__/format.test.ts lib/__tests__/display-time-zone.test.ts components/__tests__/time-zone-display.test.tsx
TZ=America/Los_Angeles npx vitest run lib/__tests__/format.test.ts lib/__tests__/display-time-zone.test.ts components/__tests__/time-zone-display.test.tsx
npm run gate:web
```
Report each command's pass/fail counts verbatim.

## 8. Acceptance criteria (each is a named test calling the real exported function)
In `lib/__tests__/format.test.ts` (update the UTC-pinned expectations; keep all calendar-date tests unchanged):
- A1 `formatDateTime("2026-03-13T18:45:00Z")` `toEqual` `"Mar 13, 2026, 12:45 PM"` (MDT).
- A2 `formatDateTime("2026-12-01T18:45:00Z")` `toEqual` `"Dec 1, 2026, 11:45 AM"` (MST).
- A3 `formatDate("2026-10-21T04:30:00Z")` `toEqual` `"Oct 20, 2026"` (10:30 PM MDT the day before).
- A4 `formatDate("2026-10-01")` `toEqual` `"Oct 1, 2026"` and `formatMonthDay("2026-10-01")` `toEqual` `"Oct 1"`.
- A5 `formatMonthDay("2026-11-01T05:00:00Z")` `toEqual` `"Oct 31"`.
- A6 `formatShortDateTime("2026-10-21T04:37:00Z")` `toEqual` `"Oct 20, 10:37 PM"`.
- A7 `formatDate(new Date("2026-10-21T04:30:00Z"))` `toEqual` `"Oct 20, 2026"`.
- A8 null, undefined, `""` and `"not a date"` return exactly what they return today, for all four functions.
In `lib/__tests__/display-time-zone.test.ts` (B1, B2) and `components/__tests__/time-zone-display.test.tsx` (B3–B6):
- B1 `DISPLAY_TIME_ZONE` `toEqual` `"America/Denver"` and `STATEMENT_ZONE` `toBe(DISPLAY_TIME_ZONE)`.
- B2 `formatMonthName("2026-10-01T03:00:00Z")` `toEqual` `"September"`; `formatMonthName("2026-10-01")` `toEqual`
  `"October"`; `formatMonthName("bad")` does not throw.
- B3 Render `TenantRentCard` with `payState` "paid" and `lastPaidAt` `"2026-10-02T16:00:00+00:00"` (a full timestamp):
  it does not throw and shows `"October rent"`.
- B4 Render the `charge-row` "Tenant says paid" badge with `tenantReportedPaidAt` `"2026-10-21T03:00:00Z"`: text contains
  `"Tenant says paid · Oct 20"`.
- B5 `tenant-activity-timeline` time for `"2026-10-21T04:37:00Z"` shows `"10:37 PM"` (render or exported helper).
- B6 `bank-balances-card` with `balance_as_of` `"2026-10-21T03:00:00Z"` shows `"as of Oct 20, 2026"`.
- B7 Host-zone independence: the A and B tests pass under the three `TZ` values in §7 (report all three runs).
Assert exact strings with `toEqual` / `toContain`; no snapshot tests; no `expect` inside mock implementations.

## 9. Report format
Compact status only: files changed (with line deltas), each §8 item → test name, the four §7 results, any existing test
whose expected string changed (old → new, why). Do NOT include 'Claude prompt' or 'recommended next steps for Claude'
sections. Report compact status only.

## 10. Constraints
- Stay inside §5. If another file seems to need a change, list it in the report instead of editing it.
- Calendar dates must not move by a day anywhere. If a caller passes a `Date` built from a calendar date to one of the
  four functions, list it in the report (Claude's search found none).
- The user should never need to read instructions to complete this flow. Dates and times simply read right; no new UI.
- Plain language: no new copy beyond the date/time text.
