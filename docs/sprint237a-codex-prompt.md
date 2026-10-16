# Sprint 237a — Reversed payments never show as received (L3: money) — rev 3 (rev 1 REJECT → rev 2 APPROVE WITH CHANGES: 3 REQUIRED + optional adopted)

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
Readers 1–12 as specified in §6, plus tests, plus **step 0: an exhaustive reader audit** (a sprint gate):
- Before changing code, list every read of `payments` in `apps/web` (any `.from("payments")`, embedded `payments(`
  selects, RPC calls whose SQL reads payments — check `supabase/migrations` for `from public.payments` /
  `join public.payments`), plus every producer of a receipt link and every notification / activity surface that says a
  payment was received. Put the table (file:line, surface, exclude / label / n-a + reason) in the report.
- If the audit finds a reader not in §2, fix it under the same rules and add it to the report (the file list in §5 may
  grow for that reason only).
- **SQL readers are audited too** (functions/RPCs in `supabase/migrations`). This sprint makes no migration: if an SQL reader
  is unsafe (counts or shows reversed payments as received), **stop**, do not work around it in TypeScript, and report it as
  a blocker with file:line — Claude will handle it as a migration.
- Add one shared convention so the next reader can't repeat the bug: a tiny typed helper in `lib/payments-active.ts`
  (e.g. `activePayments(query)` that appends `.is("reversed_at", null)`) **only if** it keeps Supabase result types and
  error handling intact; otherwise use the plain `.is("reversed_at", null)` and document the convention in that file.

## 4. Out of scope
Changing what reverses a payment; undo flow; manager fee math (it does not read `payments`); SQL functions; UI redesign.

## 5. Exact files expected to change
`lib/payments-active.ts` (new helper), `app/payments/success/page.tsx`, `lib/dashboard-legacy.ts`, `lib/payment-history.ts`, `app/tenant/page.tsx` (only for the history label / receipt link /
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
6. **Property detail (8) — split.** `paymentDate` comes from a query that filters `reversed_at is null` **in the query**
   (never by filtering an already-limited mixed list); the Payments tab lists reversed rows with the `Reversed` label
   (select `reversed_at`).
7. **Account export (10) — show.** Include `reversedAt` (ISO string or null) and `status` (`"reversed"` | `"active"`) on
   each payment; nothing removed.
8. **Autopay (11) — scope the query and use the payment source.** Query only `rent_charge_id in (<candidate ids>)`
   (batched `.in()`, no full-table read), selecting `reversed_at, recorded_via`. A charge is **skipped** when it has
   (a) any active payment, or (b) a reversed payment with `recorded_via` in (`stripe`, `legacy`) — a bounced bank payment
   must not auto-retry (owner/tenant retries by hand). A charge whose only reversed payments are `manual` (an owner's
   "Undo payment") is no longer *blocked by that payment* — every existing autopay gate (charge status pending/late, not
   waived/deleted, tenant enrolled, due date reached, amount rules, any processing safeguard) still decides; the manual
   undo only removes the historical-payment block and never forces a charge. `legacy` rows were all written before undo
   existed, so a reversed legacy row can only be a Stripe ACH reversal — keep it blocking.
   **Complete lookup:** read the blocking rows with explicit pagination (`.range()` pages until a short page) or batch the
   candidate ids small enough that one page always suffices **and** verify by count; on any query error or incomplete
   read, **fail closed**: start no automatic payment in that run and log it.
9. **Webhook (12).** In `recordPayment`'s duplicate branch, select `reversed_at`; if the existing row is reversed, do **not**
   run **any** paid-path side effect (no `markChargePaid`, no transfer creation, no paid notification, no receipt) —
   return the existing "already_recorded"-style result. Duplicate detection itself still counts reversed rows.
   **Required:** `app/payments/success/page.tsx` selects `reversed_at` and, if set, shows `This payment did not go through.`
   instead of success (card payments rarely reverse, but a refund/dispute path could set it).
9b. **Notifications / activity history.** Past "Payment received" notifications and activity rows are **historical event
   text** and stay as written (they were true when sent). Any *current-state* surface that derives "paid" from a payment
   (badges, "last paid", receipts, counts) must exclude reversed payments. The audit table marks each one.
10. Every Supabase error is checked (L-002). Plain language (`docs/plain-language.md`). Lines ≤ 140 chars; files ≤ 500 lines.

## 7. Validation commands
```
cd apps/web && npx vitest run --reporter=dot
cd apps/web && npx tsc --noEmit
npm run lint:web
```
Do NOT run `npm run gate:web`. Claude runs it and a live check on the walk accounts (3 reversed payments exist).

## 8. Acceptance criteria (tests that call real code; each asserts the query filter or the rendered result)
1. Dashboard legacy: the query chain applies `is("reversed_at", null)` **before** `limit(10)`, and a test with **11 reversed
   + 2 active** rows (newer reversed ones would fill the slots) returns both active rows and no reversed row in
   `recentPayments` / `paidChargeIds`. The same "enough reversed rows to fill the limit" test exists for every capped
   exclude-style query (AI chat, receipts `limit(1)`, analytics if capped).
2. Tenant history: reversed row present with `Reversed`, no receipt link; `lastPayment` skips it.
3. Receipt page: (a) active payment → normal receipt; (b) only reversed → "This payment was reversed" state with **no**
   receipt number, amount-paid line, "Paid" badge, PDF/download link or print button; (c) newer reversed + older active →
   receipt for the active one; (d) no payment at all → today's not-found behavior (distinct from b).
4. Receipt PDF: (a) active → PDF; (b) only reversed → no PDF (existing not-found response); (c) newer reversed + older
   active → PDF for the active one; (d) no payment → not-found. Yearly PDF excludes reversed.
5. Analytics, rent roll, AI chat: reversed payment ignored in average-days / last-payment / recent list.
6. Property detail: `paymentDate` query filters `reversed_at is null` before any limit (assert the chain); with a newer
   reversed payment, `paymentDate` is the older active one; Payments tab shows the reversed row labelled `Reversed`.
7. Export: `reversedAt` + `status` correct for reversed and active payments.
8. Autopay: query scoped to candidate ids (no unscoped select); only-reversed **stripe** → not charged; only-reversed
   **legacy** → not charged; any active payment → not charged; only-reversed **manual** on an otherwise eligible charge →
   charged; only-reversed manual but charge paid / waived / tenant not enrolled / not yet due → **not** charged; more
   blocking rows than one page → every blocked charge still skipped; lookup query error → zero charges started.
9. Webhook: duplicate session id whose row is reversed → none of `markChargePaid`, transfer creation, paid notification is
   called; non-reversed duplicate keeps today's repair behavior. Success page shows `This payment did not go through.` for a
   reversed session payment.
9c. Audit table present in the report; every newly found reader has a test.
10. Full suite green; plain-language guard green.

## 9. Report format
Compact status only: files changed with line counts, tests per criterion, command results. Do NOT include "Claude prompt"
or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
Only the files in §5. No new dependencies. No migrations. No change to how reversals are created.
