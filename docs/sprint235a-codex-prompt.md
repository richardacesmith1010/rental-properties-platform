# Sprint 235a — Future rent is not "due"; owners can undo "Mark paid" (L3: money) — rev 5 (REJECT ×3 → rev 4 APPROVE WITH CHANGES: 2 REQUIRED + 3 OPTIONAL adopted)

## 1. Objective
Fix two money bugs found in the 2026-10-15 onboarding walk (`docs/onboarding-walk-2026-10-15.md`):
- **F17.** Rent is generated one month ahead on purpose (`lib/charge-generation.ts:64-71`, locked by
  `lib/__tests__/charge-generation.test.ts:167`). But every tenant surface treats that future month as due:
  a day-one tenant saw "Rent due $2,400 · 2 months". Tenants can also report or pay next month through the
  normal UI and server actions.
- **F19.** An owner or manager who marks rent paid by mistake has no way to undo it.

## 2. Context
- HEAD `7bc2755` (main). Production has a walk tenant with Oct 15 (paid) + Nov 15 (pending) on lease due day 15.
- One window rule already exists: `lib/rent-urgency.ts:30-42` — more than 5 days away = "none", 1–5 = "upcoming".
- **F17 surfaces (all must use the new rule):**
  - `components/dashboard/tenant-rent-card.tsx:91-96` sums every pending/late charge and counts months; `:143-149`
    shows an "I paid this" button per unpaid charge.
  - `components/dashboard/pay-rent-card.tsx:110-111` pays `orderedCharges[0]`; `:156`, `:233-235` "1 more month waiting".
  - `app/tenant/page.tsx:165-174` + `lib/tenant-pay-state.ts:15` derive pay state from `charges[0]`.
  - Data: `lib/tenant-payments.ts:56-61` loads all pending/late charges (keep loading them; filter in one place).
  - Server: `requestManualPaymentConfirmation` (`app/actions/inbox-manual-payment.ts:23`, ~65) only rejects paid/waived; `lib/charge-checkout.ts:126-135`
    only rejects paid/waived/under-minimum, used by `payWithCard`/`payWithACH` (`app/actions/charges.ts:42,120`).
  - Autopay is already correct: `lib/autopay.ts:92-93` uses `.lte("due_date", todayIso)`. Do not change it.
  - Owner "Due soon": `components/dashboard/charges/charges-implementation.tsx:95` = any pending (no window); count at `:68`.
- **F19 forward action** `recordManualPayment` (`app/actions/charges.ts:209-393`) writes:
  1. `payments` insert (`rent_charge_id, amount_cents, method, reference_note, paid_at`) `:298-304`;
  2. `rent_charges.status = 'paid'` guarded by `.in("status", ["pending","late"])` `:313-317` (prior status not stored);
  3. `notifyPropertyTeam` event `rent_paid_manual` `:335` and tenant `createNotificationWithDelivery` "Payment Received" `:353`;
  4. `logAudit` `record_payment` `:370`; `revalidatePath` `/`, `/owner`, `/manager`.
  Permission: `requireAuth("owner","manager")` then charge → lease → unit → `canUserAdministerProperty` `:291-294`.
- Reversal support exists: `payments.reversed_at` (`supabase/migrations/20260505_sprint114_payments_reversed_at.sql`);
  money totals already skip reversed rows (`lib/rent-received.ts:22`, `lib/home-money.ts:109`, `lib/reports-*.ts`,
  `lib/owner-rent-rows.ts`, `lib/owner-statement.ts`). Model to copy: `lib/bank-feed/file-item.ts:26-34`
  `restoreCharge` (reset only if no other non-reversed payment; `.eq("status","paid")`).
- Gap: `owner_dashboard_payload` `recent_payments` (`supabase/migrations/20261007_sprint193_tenant_reported_paid.sql:33-37`)
  does not filter `reversed_at`.
- `bank_transactions.payment_id` and `payment_distributions.payment_id` reference `payments` ON DELETE CASCADE —
  so never delete a payment row.
- Menu: `components/dashboard/charge-more-menu.tsx:7-23,98-150`; `charge-row.tsx:353` renders it only when
  `canModify || onAddNextBill`; `canModify` = pending/late (`charges-implementation.tsx:366`); wire paid rows at `:388-405`.

## 3. In scope
A. One shared rule `isRentOpenForTenant(dueDate, today)` = due date ≤ today + 5 days (UTC dates, same day math as
   `lib/rent-urgency.ts`). Put it in `lib/rent-urgency.ts` and export it.
B. Tenant surfaces use only "open" rent for the amount due, month count, pay target, pay state and "I paid this" buttons.
   Rent further out than 5 days is shown only as one plain line: `Next rent: $1,200 on Nov 15.` (format with the
   existing currency/date helpers).
C. Server guards: `requestManualPaymentConfirmation` (inbox-manual-payment) and checkout (`lib/charge-checkout.ts`) reject rent that is
   not open with `{ success: false, error: "This rent is not due yet." }`. No payment, report or Stripe session is created.
D. Owner "Due soon" filter and count = pending rent that is open by the same rule (late stays in Late).
E. "Undo payment" for payments created by "Mark paid", done atomically in one database function, plus a menu item
   in the paid row for owners and managers.
F. Migration `supabase/migrations/20261018_sprint235a_undo_manual_payment.sql` (Codex writes; Claude applies):
   1. `payments.recorded_via text not null default 'legacy'` with check `in ('manual','stripe','bank_feed','legacy')`.
      Backfill fails closed: Stripe ids present → `stripe`; referenced by `bank_transactions.payment_id` → `bank_feed`;
      everything else stays `legacy` (never undoable). The `legacy` default also keeps any writer still running old
      code during deploy safe: its rows are simply not undoable. Only new code writes `manual`.
   2. `payments.created_at timestamptz not null default now()`; backfill existing rows from `paid_at`.
   3. Function `public.undo_manual_payment(p_charge_id uuid, p_actor_id uuid, p_restore_status text)` — see §6.7.
      It checks `p_actor_id` is an existing profile with role owner or manager, else returns `forbidden`.
   5. **Serialization trigger.** `before insert on public.payments for each row` → function
      `public.lock_rent_charge_for_payment()` (`security definer`, `search_path = ''`) that runs
      `perform 1 from public.rent_charges where id = new.rent_charge_id for update;`. Every payment writer (manual,
      Stripe, bank feed, any future one) now takes the same row lock as `undo_manual_payment`. Because each Supabase
      call commits on its own, an insert either commits before undo locks the rent (and undo's later statements see it
      — READ COMMITTED takes a new snapshot per statement) or waits until undo commits. Writers' follow-up status
      updates (`.in("status", ["pending","late"])`) also wait on that lock and re-check the row after undo commits.
      Trigger safety: function owned by `postgres`, `revoke execute … from public, anon, authenticated`; a missing
      parent rent is still rejected by the existing foreign key (the trigger adds no new error path). A second trigger
      `before update of rent_charge_id on public.payments` raises `payment rent cannot change` — no code changes it today
      (only `stripe_transfer_id`, `manager_transfer_id`, `reversed_at` are updated), so this blocks lock bypass by
      reassignment.
   6. `undo_manual_payment` starts with `set local lock_timeout = '5s'`; a timeout returns code `busy`.
      `security definer`, `set search_path = ''`, `revoke all … from public, anon, authenticated`, grant execute to
      `service_role` only.
   4. Recreate `owner_dashboard_payload` adding only `and p.reversed_at is null` to `recent_payments`. The **live
      deployed definition is authoritative**; the latest repo migration (`20261007_sprint193_tenant_reported_paid.sql:8`)
      is for comparison only. Claude diffs against live before applying (L-012).
G. All three payment writers set `recorded_via`: `app/actions/charges.ts` (`manual`),
   `lib/stripe-webhook-handlers.ts:186-192` (`stripe`), `lib/bank-feed/file-item.ts:91-93` (`bank_feed`).
   Add the one field only; no other change in those two files.

## 4. Out of scope
Charge generation (keep generating current + next month). Autopay code (characterize only). Stripe webhook logic
(only the `recorded_via` field). Undo for Stripe or bank-feed payments (they keep their own paths). Owner Rent "All"/"Late"/"Paid" filters. Any copy not listed here.

## 5. Exact files expected to change
1. `apps/web/lib/rent-urgency.ts`
2. `apps/web/components/dashboard/tenant-rent-card.tsx`
3. `apps/web/components/dashboard/pay-rent-card.tsx`
4. `apps/web/app/tenant/page.tsx`
5. `apps/web/lib/tenant-pay-state.ts`
6. `apps/web/app/actions/inbox-manual-payment.ts`
7. `apps/web/lib/charge-checkout.ts`
8. `apps/web/components/dashboard/charges/charges-implementation.tsx`
9. `apps/web/app/actions/charges.ts` (set `recorded_via`; undo action may live in new `apps/web/app/actions/charge-undo.ts`)
10. `apps/web/components/dashboard/charge-more-menu.tsx`
11. `apps/web/components/dashboard/charge-row.tsx` (only if needed to render the menu for paid rows)
12. `supabase/migrations/20261018_sprint235a_undo_manual_payment.sql` (new)
12b. `apps/web/lib/stripe-webhook-handlers.ts` (one field), `apps/web/lib/bank-feed/file-item.ts` (one field),
     `apps/web/lib/charge-generation.ts` (export `isPastGraceWindow` only), `apps/web/app/actions/index.ts` (re-export)
12c. `supabase/tests/sprint235a_undo_manual_payment.sql` (new; rolled-back SQL fixture Claude runs live)
13. Tests: `apps/web/lib/__tests__/rent-urgency.test.ts`, `apps/web/components/__tests__/tenant-rent-card.test.tsx`,
    `apps/web/lib/__tests__/pay-rent-card.test.tsx`, `apps/web/lib/__tests__/tenant-pay-state.test.ts`,
    `apps/web/components/__tests__/charges-section.test.tsx`, `apps/web/app/actions/__tests__/charges.test.ts`,
    `apps/web/app/actions/__tests__/inbox-manual-payment.test.ts` (create if missing),
    `apps/web/lib/__tests__/charge-checkout.test.ts` (new), `apps/web/lib/__tests__/autopay.test.ts` (one case),
    `apps/web/app/actions/__tests__/charge-undo.test.ts` (new).

## 6. Implementation requirements
1. **Rule.** `isRentOpenForTenant(dueDate: string, today = new Date())`: true when the due date is on or before
   today + 5 days, comparing UTC calendar dates (same as `lib/rent-urgency.ts`). Late rent is always open. Every caller
   passes the same `today` it already uses; no caller builds its own date math.
2. **Tenant card.** Total and "· N months" count only open rent. If nothing is open but future rent exists, the card shows
   `Next rent` + amount + `due Nov 15` (existing "not posted"-style layout), and no "I paid this" buttons.
   "I paid this" appears only for open rent.
3. **Pay card.** Pays the most urgent *open* rent. "N more month(s) waiting" counts only open rent. If no rent is open,
   no pay button.
4. **Pay state.** `lib/tenant-pay-state.ts` and `app/tenant/page.tsx` choose from open rent only.
5. **Server guards (C).** Check after loading the charge and before any write or Stripe call. Same error string both places.
6. **Owner Due soon (D).** `due_soon` = status pending AND open; the count matches the list.
7. **Undo (E) — atomic.** Server action `undoManualPayment(chargeId: string): Promise<ActionState>`:
   - TypeScript side: same auth + permission chain as `recordManualPayment` (`requireAuth("owner","manager")`, charge →
     lease → unit → `canUserAdministerProperty`), rate limit `undoManualPayment:<userId>` 20/min. Compute
     `restoreStatus` = `late` when `tracksLateRent(lease incl. clientHome)` and `isPastGraceWindow(due_date,
     grace_period_days ?? 5, today)`, else `pending` — the exact rule the late job uses (`lib/charge-generation.ts:242-251`).
     Then call `undo_manual_payment(chargeId, user.id, restoreStatus)` with the admin client. Map its result codes to copy.
   - Database function (one transaction):
     a. `select … from rent_charges where id = p_charge_id for update`. Missing → `not_found`. This serializes undo
        calls (double undo → the second gets `nothing_to_undo`).
     b. Pick **the newest non-reversed payment of any source**, ordered `created_at desc, id desc`, `for update`.
        None → `nothing_to_undo`. If its `recorded_via` is `stripe` → `stripe`; `bank_feed` → `bank_feed`; `legacy` →
        `legacy`. Only `manual` continues. (An older manual payment is never reversed while a newer payment exists.)
     c. `update payments set reversed_at = now() where id = <that> and reversed_at is null` — exactly 1 row.
     d. Coverage: `remaining = sum(amount_cents)` of non-reversed payments visible in this transaction. If the charge
        status is `paid` and `remaining < amount_cents` → set status `p_restore_status` (`pending` or `late` only;
        reject anything else). If `waived`, leave it. If `remaining >= amount_cents`, leave `paid`.
     e. Notifications are **not** deleted (no exact payment-to-notification link exists; ambiguous rows are kept).
        Known limitation, accepted by Claude: a "payment received" in-app note may remain after undo. Notifications are
        in test mode until launch; a follow-up will store the payment id on these notifications.
     f. Insert `audit_logs` (`user_id = p_actor_id`, `action = 'undo_record_payment'`, `entity_type = 'payment'`,
        `entity_id = payment id`, `metadata = {charge_id, recorded_via, status_before, status_after,
        remaining_cents}`).
     g. Return `jsonb {code:'ok', reopened:bool, status:text}` or `{code:<error>}`. Any error rolls everything back.
   - **Concurrency (enforced by the trigger in F.5, plus this writer invariant).** Every payment writer marks rent
     paid only after (or atomically with) a committed payment row, and never marks a `paid` rent paid again:
     `recordManualPayment` inserts then updates `.in("status", ["pending","late"])` and refuses a `paid` rent up front;
     the bank feed claims with a compare-and-set on the prior status (`file-item.ts:85-90`) so it cannot claim a
     `paid` rent; the Stripe webhook inserts the payment, then sets `paid`. So: a payment committed before undo's lock
     is counted in (d) and keeps the rent paid; a payment committed after undo sets the rent paid itself when that
     writer's own status update succeeds. Writers are **not** made atomic in this sprint, so one accepted state remains:
     an active payment with rent still unpaid (see next point).
   - **Accepted state: active payment, rent unpaid (existing behavior, characterize only).** If a writer inserts a
     payment and its status update then fails, the payment stays and the rent stays pending/late. Undo of that manual
     payment reverses it and leaves the status unchanged (it is not `paid`); undo never sets `paid`. Test this in unit
     tests and in the SQL fixture. Do not change the writers' error handling in this sprint (follow-up: atomic writers).
   - Copy: ok + reopened → `Payment undone. This rent is open again.`; ok + still paid → `Payment undone. Rent is still
     paid by another payment.`; `stripe` → `Undo this from where it was paid.`; `bank_feed` → `Undo this from Bank.`;
     `legacy` → `This payment is too old to undo here.`; `nothing_to_undo` → `There is no payment to undo.`;
     `busy` → `Someone else is saving this rent. Try again.`;
     `forbidden` → `Access denied.`; other → `We could not undo this payment.`
   - `revalidatePath` `/`, `/owner`, `/manager`. No new notification or email on undo.
8. **Menu.** Paid rows get "Undo payment" (owners and managers only; never tenants). It asks once:
   `Undo this payment? The rent may show as unpaid again.` with buttons `Undo payment` / `Keep it`. After success the
   row moves back to Late or Due soon; "Mark paid" works again on it (do → undo → do again).
9. **Migration (F).** Backfill in the same migration. Grep proves only the three writers in G insert into `payments`;
   each sets `recorded_via` explicitly (tests in criterion 18). Keep `owner_dashboard_payload` identical to the live
   definition except the one filter line. `recordManualPayment` keeps its "Enter the full amount owed." rule.
10. Plain-language guard: no "charge", "transaction", "submit". Sentences ≤ 12 words. Lines ≤ 140 chars.

## 7. Validation commands
```
cd apps/web && npx vitest run lib/__tests__/rent-urgency.test.ts components/__tests__/tenant-rent-card.test.tsx \
  lib/__tests__/pay-rent-card.test.tsx lib/__tests__/tenant-pay-state.test.ts components/__tests__/charges-section.test.tsx \
  app/actions/__tests__/charges.test.ts app/actions/__tests__/inbox-manual-payment.test.ts lib/__tests__/charge-checkout.test.ts
cd apps/web && npx vitest run --reporter=dot
cd apps/web && npx tsc --noEmit
npm run lint:web
```
Do NOT run `npm run gate:web` or apply the migration. Claude applies it and runs `supabase/tests/sprint235a_undo_manual_payment.sql`
(rolled back) against live as `service_role` and as `authenticated` (must be denied).

## 8. Acceptance criteria (each a named test calling real code)
1. `isRentOpenForTenant`: today, today+5 → true; today+6 → false; past date → true (UTC edge at 23:30 UTC).
2. Tenant card with Oct 15 (today) + Nov 15 pending: shows `$1,200`, no "· 2 months", one "I paid this" (Oct only),
   and `Next rent: $1,200 on Nov 15.`
3. Tenant card with only Nov 15 pending (Oct paid): no "Rent due", no "I paid this", shows next rent due Nov 15.
4. Pay card with Oct + Nov: pays Oct; no "more month waiting" text. With only Nov: no pay button.
5. Pay state ignores a future-only charge.
6. `requestManualPaymentConfirmation` on a charge due in 20 days → `"This rent is not due yet."`, no update to `tenant_reported_paid_at`,
   no message sent.
7. Checkout on a charge due in 20 days → same error, Stripe session creation never called.
8. Owner Due soon: pending Oct 15 (today) and Nov 15 → list and count = 1.
9. Undo happy path (manual cash, charge paid, due Oct 15, grace 5, today Oct 16): payment `reversed_at` set,
   charge `pending`, no notification deleted, audit row written, copy exact, revalidate ×3.
10. Grace boundary: today Oct 20 → `pending`; today Oct 21 → `late`. Lease paid outside Domus past grace → `pending`.
11. Coverage: two non-reversed payments summing ≥ rent, undo one → stays `paid`, copy "still paid"; remaining < rent
    → reopened. (Unit test on the TS mapping + SQL fixture for the function.)
12. Newest payment is Stripe (an older manual one exists) → `stripe` copy, nothing reversed; bank-feed → `bank_feed`;
    legacy → `legacy` copy; none → `nothing_to_undo`.
13. No property access → `Access denied.`; tenant role → rejected by requireAuth; rate limit → existing copy.
14. RPC error → `We could not undo this payment.`; the TS layer makes no other write.
15. Waived charge → payment reversed, status stays `waived`.
16. Do → undo → do again: `recordManualPayment` succeeds on the reopened rent (mocked state transitions).
17. Menu: paid row shows "Undo payment" in owner view with the exact confirm copy; not in tenant view.
18. `recorded_via`: `recordManualPayment` inserts `manual`; webhook payload builder inserts `stripe`; bank feed inserts
    `bank_feed` (one assertion each in existing tests).
19. Autopay characterization: a rent paid early (status `paid`, due tomorrow) is not selected by autopay on its due
    date (existing `lib/autopay.ts:92-93` query + status filter) — test only, no code change.
20. Owner Due soon: pending rent 2 days past due but inside grace stays in Due soon; first late day → only in Late.
21. Pay card with two open rents (late Oct 1 + Oct 15 due) pays Oct 1 first.
22. UTC edges for `isRentOpenForTenant`: today `2026-10-09T23:30:00Z` vs due `2026-10-15` → false;
    `2026-10-10T00:30:00Z` → true (local US evening is still Oct 9 — the rule uses UTC dates by design).
23. SQL fixture (Claude runs live, rolled back): backfill classifies a Stripe, a bank-feed and an unmarked old
    payment as `stripe` / `bank_feed` / `legacy`; `created_at` backfill equals `paid_at` even when `paid_at` is months
    old; a row inserted without `recorded_via` gets `legacy`; double call → second `nothing_to_undo`; an unknown or
    tenant `p_actor_id` → `forbidden`; `authenticated` cannot execute; `recent_payments` omits a reversed payment and
    lists an active one; coverage and waived cases as 11 and 15.
24. Concurrency characterization (unit tests on the real writers): `recordManualPayment` refuses a `paid` rent and
    only updates from pending/late; the bank-feed claim fails on a `paid` rent; the webhook inserts before setting
    `paid`; a writer whose status update fails leaves the payment and an unpaid rent, and undo then reverses it
    without changing status. SQL fixture: a second payment committed before the undo call keeps the rent `paid`.
25. **Overlapping transactions (Claude runs live, both rolled back), two database sessions started together:**
    session A `begin; select 1 from rent_charges where id = X for update; select pg_sleep(8); rollback;` and session B
    (starts ~1 s later) `begin; set local lock_timeout = '3s'; insert into payments (...) values (X, ...); rollback;`.
    Pass = B fails with `lock_timeout` (the insert waited on A's lock). Then the same B alone succeeds (then rolls back).
    Also A = `select undo_manual_payment(X, …)` inside `begin … pg_sleep(8) … rollback`, B = the insert → B waits.
    **Isolation:** every fixture and overlap test creates its own throwaway property/unit/lease/rent rows inside its
    transaction and rolls back; none reads or locks a real customer's rent. X is always a fixture row.
26. Trigger safety (SQL fixture): `authenticated` cannot execute either trigger function; inserting a payment for a
    missing rent fails with the foreign-key error; `update payments set rent_charge_id = <other>` fails with
    `payment rent cannot change`; updating `stripe_transfer_id` still works.
27. `busy`: A holds the rent lock for 8 s; B calls `undo_manual_payment` → returns `busy` after ~5 s (fixture).
28. Partial writer failure against the real database (fixture): insert a manual payment without updating the rent
    (rent stays pending); `undo_manual_payment` reverses it, status stays pending, `reopened` false.
## 9. Report format
Compact status only: files changed (line counts), tests added per criterion number, command results, and how many
existing payments the backfill would classify per value (from the fixture). Notifications are intentionally retained
on undo. Do NOT include "Claude prompt" or
"recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
- Only the files in §5. No new dependencies. No deletes of payment rows.
- The user should never need to read instructions to complete this flow. Plain language: `docs/plain-language.md`.
- Keep files ≤ 500 lines (`charges.ts` is near the limit: put undo in `app/actions/charge-undo.ts` if needed and
  re-export it from `app/actions/index.ts` — add both to the file list in your report).
