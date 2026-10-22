# Sprint 250a — Rent "today" is the Denver calendar day (money + notification logic) (L3) — rev 3 (rev 1 AWC → rev 2 AWC → rev 3)

## 1. Objective
Display already uses America/Denver (243a). Business logic still decides "today" with UTC
(`new Date().toISOString().slice(0,10)`, `getUTC*`, `Date.UTC`). From 6/7 pm to midnight Denver time UTC is already
tomorrow, so a request-time check can call rent "due today" or "late" a day early, let a tenant pay/report rent that is
not open yet, restore the wrong status on undo, or target reminders for the wrong day. Make every **money/notification
decision** use the Denver calendar day. (Reports and dashboard month bucketing are Sprint 250b.)
Facts the design relies on: Denver is always 6–7 h behind UTC, so the Denver date is the same as or one day before
the UTC date. Effects, stated precisely: decisions that compare **today** against a date column (due, late, grace,
overdue stage, reminder target, autopay, payment gate, lease expiry) can only move **later** by at most one day in the
evening window. One decision moves **earlier**: the "no charge before the lease was created" check now uses the
Denver date of `lease.created_at`, which can be one day earlier than its UTC date (D9) — intended. The daily cron (`apps/web/vercel.json` `0 8 * * *` = 01:00–02:00 Denver) already sees equal
dates, so scheduled runs are unchanged; manual triggers and all request-time checks change.

## 2. Context
- HEAD: see `git log -1`. Existing helpers: `lib/statement-month.ts` (`STATEMENT_ZONE`, `denverDate(now)`, private
  `midnightUtc(date)`, `statementMonthWindow`, `shiftMonth`), private `todayInZone` in `lib/client-overview.ts:35`, an
  inline Denver `formatToParts` in `app/actions/notifications.ts:300-305`, private `startOfUtcDay` copies in
  `lib/charge-generation.ts:35`, `lib/action-items.ts:46`, `lib/rent-urgency.ts:15`.
- UTC sites in scope (file:line → what it decides; all compare against DATE columns unless noted):
  `lib/charge-generation.ts:410` today (which month's charges; passed to `buildDueDatesByLeaseId` `:90` and late fees
  `:489`), `:69-72`/`:77-88`/`:95-96` candidate months, `:39-41` `toUtcDateIso(lease.created_at)` (timestamptz → date:
  no charge before the lease was created), `:194`/`:207`/`:216` late-fee candidates, `:122-125` `isPastGraceWindow`
  (called at `:241` with a fresh `new Date()`, **ignoring** the passed `todayIso`), `:133-135`/`:157-164` lease status
  expiring/expired; `app/actions/charge-undo.ts:51-53` status on undo; `lib/delinquency.ts:43-44`, `:50`, `:63` overdue
  days / 30-60-90 stages, `:229-231` reminder target (+3 days); `lib/autopay.ts:83`, `:93` which charges autopay pays;
  `lib/lease-lifecycle.ts:16/20`, `:149-154`, `:160-161` expiry; `lib/rent-urgency.ts:15-26`, `:34`
  (`isRentOpenForTenant`, `getChargeUrgency`) and its callers without a `today` argument (`lib/charge-checkout.ts:133`,
  `app/actions/inbox-manual-payment.ts:69` — **payment gates**); `lib/tenant-pay-state.ts:30-48` `getNextRentDueDate`;
  `lib/leases.ts:20-24`; `lib/action-items.ts:46`, `:86-91`, `:127`; `app/actions/manager-payments.ts:221`, `:342-344`,
  `:372-373` (payment date and which month is generated); `app/actions/deposits.ts:27`;
  `app/actions/account-tasks.ts:47`, `:93`, `:111`, `lib/account-tasks.ts:75`; `lib/dashboard.ts:176` `p_today`.
  Client: `components/dashboard/pay-rent-card.tsx:64-70`, `:110-112`, `:173`, `:413`; `tenant-rent-card.tsx:32-40`,
  `:88-91`; `charge-row.tsx:257` (`isRentOpenForTenant` without `today`).
- UTC-pinned tests that will change: `lib/__tests__/rent-urgency.test.ts:51-62`, `tenant-pay-state.test.ts:37-42`,
  `charge-generation.test.ts:291-309`, `deposits-cash.test.ts:46`. `vitest.config.ts` does not set `TZ`.

## 3. In scope
1. **One shared module** `apps/web/lib/denver-calendar.ts` (pure, no server-only imports so client components can use
   it), built on the existing `statement-month.ts` logic (move, don't duplicate; `statement-month.ts` re-exports or
   imports from it):
   `todayDenver(now = new Date()): string` (YYYY-MM-DD); `denverDateOf(ts: string | Date): string`;
   `addDays(iso: string, n: number): string`; `daysBetween(fromIso, toIso): number`; `denverMonth(now?)` (YYYY-MM);
   `denverYear(now?)` (number); `denverDayStartUtc(iso): string` (UTC instant of Denver midnight — today's private
   `midnightUtc`). Date arithmetic on YYYY-MM-DD strings is calendar-only (no zone). Remove the private duplicates
   listed in §2 (`todayInZone`, inline `formatToParts`, `startOfUtcDay` copies) in favor of these.
2. **Every §2 site** uses `todayDenver()` (or a `today` parameter defaulting to it) instead of a UTC "today";
   `toUtcDateIso(lease.created_at)` → `denverDateOf(created_at)`; `isPastGraceWindow` uses the `todayIso` it is given
   (fix the fresh `new Date()`); functions that already accept `now`/`today` keep that parameter for tests.
3. **Client cards** (`pay-rent-card`, `tenant-rent-card`, `charge-row`): the **server** computes `todayIso =
   todayDenver()` once per request and passes it down as a prop; the cards use that prop and never call `todayDenver()`
   during render (so SSR and hydration always agree, even if Denver midnight passes between them). The prop flows from
   `app/tenant/page.tsx` and the owner/manager charge list loaders that already render these cards (add those files to
   §5 and list each).
   **Staying open past midnight / app resume:** a small client hook (`useDenverDayRefresh(todayIso)`, in
   `lib/denver-calendar.ts` or next to the cards) runs **after** hydration: on mount, on `visibilitychange` to visible,
   and on a timer at the next Denver midnight, it compares `todayDenver()` with the server-provided `todayIso`; if they
   differ it calls `router.refresh()` once, so the server recomputes `todayIso`, due/late text **and** payment-button
   eligibility together. Never re-render "today" from the client clock directly.
4. **Idempotency unchanged:** charge generation, late fees, reminders and follow-ups keep their existing unique keys
   and dedupe; this sprint changes only which day is "today".
5. Tests in §8.

## 4. Out of scope
Report/dashboard/money-page month bucketing and `paid_at` windows (`rent-received`, `owner-rent-rows`, wallet,
recent activity, YTD, P&L, analytics, receipts PDF, CSV names) and form date defaults (deposit sheet, charge create,
lease wizard, home-money sheets) — Sprint 250b. SQL functions (`owner_dashboard_payload`, retention report). The cron
schedule. Per-user/per-property zones.

## 5. Exact files expected to change
- `apps/web/lib/denver-calendar.ts` (new), `apps/web/lib/statement-month.ts`, `apps/web/lib/client-overview.ts`
- `apps/web/lib/charge-generation.ts`, `apps/web/app/actions/charge-undo.ts`, `apps/web/lib/delinquency.ts`,
  `apps/web/lib/autopay.ts`, `apps/web/lib/lease-lifecycle.ts`, `apps/web/lib/rent-urgency.ts`,
  `apps/web/lib/charge-checkout.ts`, `apps/web/app/actions/inbox-manual-payment.ts`, `apps/web/lib/tenant-pay-state.ts`,
  `apps/web/lib/leases.ts`, `apps/web/lib/action-items.ts`, `apps/web/app/actions/manager-payments.ts`,
  `apps/web/app/actions/deposits.ts`, `apps/web/app/actions/account-tasks.ts`, `apps/web/lib/account-tasks.ts`,
  `apps/web/lib/dashboard.ts`, `apps/web/app/actions/notifications.ts` (inline Denver helper only)
- `apps/web/components/dashboard/pay-rent-card.tsx`, `tenant-rent-card.tsx`, `charge-row.tsx`, and the server
  pages/loaders that render them (`apps/web/app/tenant/page.tsx`, the charges section loader/props path — list each)
- Tests: new `apps/web/lib/__tests__/denver-calendar.test.ts`, new `apps/web/lib/__tests__/denver-evening-rules.test.ts`,
  and updates to the UTC-pinned tests listed in §2 (each changed expectation listed in the report with why)

## 6. Implementation requirements
- No new dependencies. `Intl.DateTimeFormat` with `timeZone: "America/Denver"` only (use the existing constant).
- Keep `toISOString()` where it is a stored **instant** (e.g. `paid_at`, `resolved_at`, audit times) — only "today"
  and date-column comparisons change.
- Every Supabase error checked (L-002). Lines ≤ 140 characters. Each module ≤ 500 lines.

## 7. Validation
```
cd apps/web
npx vitest run lib/__tests__/denver-calendar.test.ts lib/__tests__/denver-evening-rules.test.ts \
  lib/__tests__/rent-urgency.test.ts lib/__tests__/tenant-pay-state.test.ts lib/__tests__/charge-generation.test.ts \
  lib/__tests__/delinquency.test.ts lib/__tests__/autopay.test.ts lib/__tests__/lease-lifecycle-notifications.test.ts \
  lib/__tests__/deposits-cash.test.ts app/actions/__tests__/charge-undo.test.ts
TZ=Pacific/Kiritimati npx vitest run lib/__tests__/denver-calendar.test.ts lib/__tests__/denver-evening-rules.test.ts
TZ=UTC npx vitest run lib/__tests__/denver-calendar.test.ts lib/__tests__/denver-evening-rules.test.ts
TZ=Asia/Tokyo npx vitest run lib/__tests__/denver-evening-rules.test.ts components/__tests__/denver-client-cards.test.tsx
```
then from the repo root `npm run gate:web`.

## 8. Acceptance criteria (named tests calling real code; time frozen with `vi.setSystemTime`)
Evening instant **E = 2026-11-01T04:30:00Z** (Denver: Oct 31 22:30 MDT; also the night DST ends) and
**M = 2026-11-01T12:00:00Z** (Denver Nov 1, 05:00 MST).
- D1 `todayDenver(E) === "2026-10-31"`, `todayDenver(M) === "2026-11-01"`; `denverDateOf("2026-03-22T01:00:00Z") ===
  "2026-03-21"`; `addDays("2026-02-28", 1) === "2026-03-01"`; `daysBetween("2026-10-01", "2026-10-31") === 30`;
  `denverDayStartUtc("2026-11-01") === "2026-11-01T06:00:00.000Z"`, `denverDayStartUtc("2026-11-02") ===
  "2026-11-02T07:00:00.000Z"`, spring-forward `denverDayStartUtc("2026-03-08") === "2026-03-08T07:00:00.000Z"` and
  `denverDayStartUtc("2026-03-09") === "2026-03-09T06:00:00.000Z"`; `denverMonth(E) === "2026-10"`. Same results under
  every `TZ` in §7.
- D2 Rent due 2026-11-01: at E `getChargeUrgency` is not "due today"/"overdue" and `isRentOpenForTenant` follows the
  5-day window from Oct 31; at M it is "due today".
- D3 Payment gates: a charge due 2026-11-06 at E → `charge-checkout` / manual-payment report treat it exactly as on
  Oct 31 (open only if within 5 days of Oct 31 → **closed**: 6 days); at M on Nov 1 → open (5 days). Assert the real
  return/error values.
- D4 Charge generation (`buildDueDatesByLeaseId`, current + next month rule) for an active lease (start 2026-01-01,
  end 2027-06-30, created 2026-01-01T12:00:00Z, due day 1): at E → due dates exactly `["2026-10-01","2026-11-01"]`;
  at M → exactly `["2026-11-01","2026-12-01"]`.
- D4s Production sequence (mocked Supabase honoring the existing charge unique key / upsert): manual run at E, then the
  scheduled run at **S = 2026-11-01T08:00:00Z** (the real cron time; Denver Nov 1, 01:00 MST), then a rerun at S → the lease has exactly one charge each for 2026-10-01, 2026-11-01 and
  2026-12-01 (3 rows, no duplicates); late fees, reminders (E target Nov 3, M target Nov 4 — different charges) and
  overdue follow-ups (due 2026-10-01: stage 30 at E, still stage 30 at M with key `overdue-30` → one email) produce
  no duplicate rows or emails.
- D5 Late fee / status (existing rule: late when today > due + grace): due 2026-10-25, grace 5 (window ends Oct 30) →
  at E (Denver Oct 31) **late**; due 2026-10-26, grace 5 (window ends Oct 31) → at E **not** late, at M (Nov 1) late. `isPastGraceWindow` uses the passed today
  (a test that passes `todayIso` and a different system time proves it).
- D6 Undo (`charge-undo`) at E restores `pending` for a charge that is late only by the UTC date.
- D7 Reminders: at E the +3-day target is `2026-11-03`; at M it is `2026-11-04`. Overdue stage: due 2026-10-01 at E →
  30 days overdue (stage 30), at M → 31.
- D8 Autopay at E does not pay a charge due 2026-11-01; at M it does.
- D9 Lease created `2026-03-22T01:00:00Z` (Denver Mar 21) with due day 21 → a March 21 charge is allowed (was blocked
  by the UTC date).
- D9b Lease status (`updateLeaseStatuses`, expired when end < today; expiring_soon when end ≤ today + 30): end
  2026-10-31 → at E still active/expiring (not expired), at M expired; end 2026-11-30 → expiring_soon at E; end
  2026-12-01 → not expiring at E, expiring_soon at M. Same boundaries in `lib/lease-lifecycle.ts` expiry warnings.
- D10h Cross-midnight hydration (same file): server-render the tenant rent card HTML with `todayIso="2026-10-31"`, then
  hydrate with system time at M (Denver Nov 1) → no React hydration mismatch warning (spy `console.error`), the first
  client render shows the server text, and `router.refresh` is called exactly once after mount; a `visibilitychange`
  to visible with the same day → no extra refresh; at the next Denver midnight timer → one refresh. After the refresh
  (rerender with `todayIso="2026-11-01"`), the Pay button eligibility matches the Nov 1 rule (D3).
- D10 Client (`components/__tests__/denver-client-cards.test.tsx`, run under `TZ=Asia/Tokyo` too): rendering
  `TenantRentCard`/`PayRentCard` with prop `todayIso="2026-10-31"` for a Nov 1 charge reads "in 1 day"; with
  `todayIso="2026-11-01"` reads "today"; the cards do not call `todayDenver()`/`Date` for "today" during render (spy).
- D11 Gate green (counts verbatim); every changed UTC-pinned expectation listed with reason.
- D12 Audit table in the report: every §2 site → `converted` / `retained-as-instant` / `out-of-scope (250b)`, with
  file:line.
Assert exact values with `toEqual`; no `expect` inside mock implementations.

## 9. Report format
Compact status only: files changed with line deltas, D1–D12 (incl. D4s, D9b, D10h) → test names, every changed old
test (old → new, why), the D12 audit table, and validation output counts for all four commands in §7. Do NOT include 'Claude prompt' or 'recommended next steps for Claude'
sections. Report compact status only.

## 10. Constraints
Stay inside §5; list anything else. Do not commit. No migrations. No Undo flow changes beyond D6's date source.
Claude verifies after deploy: a scheduled-cron dry check (cron_runs result strings unchanged), and a live read of a
tenant card at a Denver-evening instant is not possible on demand — rely on D2/D10 plus a production smoke.
The user should never need to read instructions to complete this flow: rent says "due today" on the right day.
