# Sprint 237a — Reversed payments never show as received (L3: money) — rev 1

## 1. Objective
`payments.reversed_at` marks a payment that no longer counts (Stripe ACH failure since Sprint 114; "Undo payment" since
Sprint 235a). The 2026-10-15 manager walk (`docs/manager-walk-plan-2026-10-16.md`, M10) found reversed payments listed as
received: 3 of 5 rows on the manager Payments section. A code map found 9 readers with no handling and one webhook bug.
Make every reader either **exclude** reversed payments (money, proof of payment) or **show them labelled "Reversed"**
(history / export), as specified per reader below.

## 2. Context
- HEAD `3b8ac14` (main). Live data today: 3 reversed payments, all on test accounts (no real customer affected yet).
- Already correct (do not change): `lib/rent-received.ts`, `lib/home-money.ts`, `lib/reports-ledger.ts`,
  `lib/reports-pnl.ts`, `lib/owner-rent-rows.ts`, `lib/owner-statement.ts`, `lib/bank-feed/file-item.ts`,
  `owner_dashboard_payload` (SQL), `undo_manual_payment` (SQL), `_file_bank_choice` (SQL),
  `lib/stripe-webhook-handlers.ts:895-908` (`handleAsyncPaymentFailed`).
- Readers to fix (from the code map; line numbers at HEAD):
  1. `lib/dashboard-legacy.ts:209-217` `getDashboardDataLegacy` — last-30-day payments, `.limit(10)`. Feeds the dashboard
     **Payments** section (`components/dashboard/payments-section.tsx` via `render-section-cases.tsx:91`), the command
     palette (`dashboard-command-loader.ts:90`) and `paidChargeIds` (line 220). Always used for managers; owners on RPC
     fallback (`lib/dashboard.ts:170-190`).
  2. `lib/payment-history.ts:69-73` `getTenantPaymentHistory` — tenant "Past payments" (`app/tenant/page.tsx:105`), each row
     links a receipt (line ~395); `lastPayment` = row 0 (line ~176).
  3. `app/payments/receipt/[chargeId]/page.tsx:69-75` — latest payment `limit(1)`, renders a normal receipt even if reversed.
  4. `lib/pdf/pdf-data.ts:51-57` `fetchReceiptShape` (receipt PDF, `app/api/pdf/receipt/[chargeId]/route.ts`).
  5. `lib/pdf/pdf-data.ts:302-308` `getReceiptsPdfDataForYear` (yearly receipts PDF).
  6. `lib/analytics-loader.ts:210-214` `getOwnerAnalyticsData` — "average days to payment".
  7. `lib/reports-rent-roll.ts:357-361` `getRentRollReport` — "last payment" per lease.
  8. `lib/property-detail-queries.ts:169-173` `getPropertyChargeData` — charge `paymentDate` and the property Payments tab.
  9. `app/api/ai/chat/route.ts:198-204` `getRecentPaymentsForAi`.
  10. `lib/account-export.ts:51-53` `buildAccountExport` (tenant data export).
  11. `lib/autopay.ts:97` `processAutopayCharges` — selects `id, rent_charge_id` from the **whole** payments table; any
      charge with any payment (incl. reversed) is skipped (lines 110-114).
  12. `lib/stripe-webhook-handlers.ts:560-582` `recordPayment` duplicate branch — when the existing row is found by
      session/intent id and the charge isn't `paid`, it calls `markChargePaid` (575-580) even if that row is reversed.
- Not applicable (leave): writers; `app/actions/account-wipe.ts` (deletion scope must include reversed rows);
  `createTransfersForPayment` lookups; `app/payments/success/page.tsx` (card only — optional label, see §6.9).

## 3. In scope
Readers 1–12 as specified in §6, plus tests.

## 4. Out of scope
Changing what reverses a payment; undo flow; manager fee math (it does not read `payments`); SQL functions; UI redesign.

## 5. Exact files expected to change
`lib/dashboard-legacy.ts`, `lib/payment-history.ts`, `app/tenant/page.tsx` (only for the history label / receipt link /
lastPayment), `app/payments/receipt/[chargeId]/page.tsx`, `lib/pdf/pdf-data.ts`, `app/api/pdf/receipt/[chargeId]/route.ts`
(only if needed for the reversed case), `lib/analytics-loader.ts`, `lib/reports-rent-roll.ts`,
`lib/property-detail-queries.ts`, `lib/property-detail.ts` / `components/dashboard/property-detail-view.tsx` (label only),
`app/api/ai/chat/route.ts`, `lib/account-export.ts`, `lib/autopay.ts`, `lib/stripe-webhook-handlers.ts`
(recordPayment duplicate branch only), and their tests: `lib/__tests__/owner-rpc-parity.test.ts` or a new
`lib/__tests__/dashboard-legacy-reversed.test.ts`, `lib/__tests__/speed-loaders.test.ts` or new
`lib/__tests__/payment-history.test.ts`, new `app/payments/receipt/__tests__/receipt-page.test.tsx`,
`lib/__tests__/pdf-receipt.test.ts`, `lib/__tests__/analytics-loader.test.ts`,
`lib/__tests__/reports-rent-roll-outside-domus.test.ts`, `lib/__tests__/property-detail.test.ts`,
new `lib/__tests__/ai-chat-payments.test.ts`, `lib/__tests__/account-export.test.ts`, `lib/__tests__/autopay.test.ts`,
`lib/__tests__/stripe-webhook-handlers.test.ts`.

## 6. Implementation requirements
1. **Dashboard (1) — exclude.** Add `.is("reversed_at", null)` **before** `.limit(10)` so reversed rows don't use slots.
   `paidChargeIds` comes from the filtered rows.
2. **Tenant history (2) — show, labelled.** Select `reversed_at`. A reversed row shows the amount with the label
   `Reversed` and no receipt link. `lastPayment` (and anything that says "last paid") uses the newest **non-reversed** row.
3. **Receipt page (3) — exclude.** Use the newest non-reversed payment. If the charge has payments but all are reversed,
   render (not 404) a plain state: heading `This payment was reversed`, text `It no longer counts as paid.` and a link back.
   No receipt numbers or "Paid" wording in that state. Keep existing auth checks unchanged.
4. **Receipt PDF (4) — exclude.** Same rule; when only reversed payments exist the route returns the existing
   not-found/forbidden response (no PDF is generated). Yearly receipts PDF (5) excludes reversed rows.
5. **Analytics (6), rent roll (7), AI chat (9) — exclude** (filter in the query, before any limit).
6. **Property detail (8) — split.** `paymentDate` uses non-reversed payments only; the Payments tab lists reversed rows with
   the `Reversed` label (select `reversed_at`).
7. **Account export (10) — show.** Include `reversedAt` (ISO string or null) on each payment; nothing removed.
8. **Autopay (11) — keep behavior, scope the query.** Query only `rent_charge_id in (<candidate charge ids>)` (batched with
   `.in()`, no full-table read). **Keep the current rule** that a charge with any payment row — including a reversed one —
   is not auto-charged again (a bounced bank payment must not auto-retry; the owner/tenant retries by hand). Pin it with a
   test and a one-line comment.
9. **Webhook (12).** In `recordPayment`'s duplicate branch, select `reversed_at`; if the existing row is reversed, do **not**
   call `markChargePaid` (return the existing "already_recorded"-style result). Duplicate detection itself still counts
   reversed rows. Optional (allowed): `app/payments/success/page.tsx` selects `reversed_at` and, if set, shows
   `This payment did not go through.` instead of success.
10. Every Supabase error is checked (L-002). Plain language (`docs/plain-language.md`). Lines ≤ 140 chars; files ≤ 500 lines.

## 7. Validation commands
```
cd apps/web && npx vitest run --reporter=dot
cd apps/web && npx tsc --noEmit
npm run lint:web
```
Do NOT run `npm run gate:web`. Claude runs it and a live check on the walk accounts (3 reversed payments exist).

## 8. Acceptance criteria (tests that call real code; each asserts the query filter or the rendered result)
1. Dashboard legacy: the payments query chain includes `is("reversed_at", null)` before `limit(10)`; a reversed row in the
   mock is absent from `recentPayments` and `paidChargeIds`.
2. Tenant history: reversed row present with `Reversed`, no receipt link; `lastPayment` skips it.
3. Receipt page: (a) active payment → normal receipt; (b) only reversed → "This payment was reversed" state, no "Paid";
   (c) reversed newer + active older → receipt for the active one.
4. Receipt PDF: only-reversed → no PDF (route returns the existing not-found response); yearly PDF excludes reversed.
5. Analytics, rent roll, AI chat: reversed payment ignored in average-days / last-payment / recent list.
6. Property detail: `paymentDate` ignores reversed; Payments tab shows it labelled `Reversed`.
7. Export: `reversedAt` present for a reversed payment and null for an active one.
8. Autopay: query scoped to candidate ids (no unscoped select); a charge whose only payment is reversed is **not**
   auto-charged (pinned rule).
9. Webhook: duplicate session id whose row is reversed → `markChargePaid` not called; non-reversed duplicate keeps today's
   repair behavior.
10. Full suite green; plain-language guard green.

## 9. Report format
Compact status only: files changed with line counts, tests per criterion, command results. Do NOT include "Claude prompt"
or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
Only the files in §5. No new dependencies. No migrations. No change to how reversals are created.
