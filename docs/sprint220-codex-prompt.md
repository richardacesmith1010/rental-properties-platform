# Sprint 220 — One monthly bill: water and credits on the rent charge, plus a monthly ledger (L3: money + schema) · rev 1

The owner approved this on 2026-10-12. Source: `docs/partner-ledger-requirements.md`, Sheet A (A1–A4).

**Owner's framing:** the tenant gets **one bill a month** (rent + water), pays it in one payment, and credits or refunds lower what's owed.

## 1. Objective
1. **Bill lines.**
   - A monthly rent charge can carry extra **lines**:
     - `utility` (e.g. "Water"), a positive amount;
     - `credit` (e.g. "Water refund"), a negative amount.
   - The charge's `amount_cents` stays the single total the tenant pays. Every payment path (Stripe checkout, manual payments, bank-file matching, "I already paid") keeps working on that one charge, **unchanged**.
2. **"Bill the tenant for this."**
   - When an owner adds a **Utility** bill for a home with an active lease, a checkbox "Bill the tenant for this" adds a Water line to the tenant's next bill.
   - The owner can also add a line, or a credit, from the charge's row.
3. **Honest money totals.**
   - The utility part of a paid charge is shown as **"Water paid back"** income. It's not counted as rent.
   - The "Rent collected" YTD tile and rent-only numbers exclude it.
   - "Left after bills" is unchanged: in − out is the same total.
4. **The tenant sees one amount due**, with a breakdown ("Rent $2,160 · Water $112.59"). The receipt and the PDF show the lines.
5. **Monthly ledger (owner, per lease):**
   - a lease header (term, monthly rent);
   - one row per month: Rent, Water, Credits, Paid, Balance;
   - a short month flagged "Short $X";
   - a totals row.
   - **Fix the existing ledger bugs:** waived charges and reversed payments must not count.

## 2. Context (HEAD after 219, branch `main`; verified 2026-10-12 by code survey)
- **`rent_charges`:**
  - category CHECK is `('rent','late_fee')`;
  - unique index on `(lease_id, due_date, category)` where not deleted;
  - status is pending | paid | late | waived.
  - Created by `lib/charge-generation.ts:400-486` (cron plus the owner button), with `category:'rent'`.
  - Late fees: `applyLateFeesToOverdueCharges` (rent only).
- **Charge editing already changes `amount_cents` on non-paid charges:** `app/actions/charge-management.ts:42-110`. It has an audit trail of field changes.
- **Payments:**
  - one checkout pays exactly one charge (`lib/charge-checkout.ts:88-210`, `app/actions/charges.ts:41-187`);
  - the webhook `recordPayment` (`lib/stripe-webhook-handlers.ts:539-700`) rejects paid > charge (line 606) and **marks the charge paid even when paid < charge** (`markChargePaid`, 216-256);
  - manual payments require amount == charge (`charges.ts:260-265`);
  - bank feed needs an exact single-charge match (`lib/bank-feed/file-item.ts:72-92`).
- **Money views:**
  - `lib/rent-received.ts` counts every category as rent received;
  - `lib/home-money.ts:68-131` labels every payment "Rent from …";
  - `lib/reports-pnl.ts:179-183` treats late_fee as separate and everything else as rental income.
- **Tenant:**
  - `lib/tenant-payments.ts:31-108` (it doesn't select category);
  - `components/dashboard/pay-rent-card.tsx`, `tenant-rent-card.tsx`;
  - receipt `app/payments/receipt/[chargeId]/page.tsx:217`;
  - PDF `lib/pdf/pdf-builders.ts:102`.
- **Ledger:**
  - `lib/reports-ledger.ts:28-161`. It uses `getChargeDetailsForLeases` with no status filter (`reports-rent-roll.ts:256-262`), and payments without a `reversed_at` filter (54-60);
  - UI is `components/reports/tenant-ledger-report.tsx`, owner only at `app/owner/reports/page.tsx`.
- **Bills:** `property_expenses` (category `utility` exists). Bill form: `components/dashboard/expenses/expense-form.tsx`; action: `app/actions/expenses.ts`. Sprint 219 added `setExpensePaidBy`. Reuse its pattern (a bill save, then a separate idempotent follow-up action).
- **Supabase default privileges grant ALL to anon and authenticated on new public tables.** A new table must `revoke all … from anon, authenticated` before any grants (lesson from 219).

## 3. In scope
### 3.1 Migration (Codex writes it; **Claude reviews, applies it live and runs attacker SQL**)
`supabase/migrations/20261013_sprint220_charge_lines.sql`:
1. **Table `public.rent_charge_lines`:**
   - columns:
     - `id uuid pk default gen_random_uuid()`;
     - `lease_id uuid not null references leases(id) on delete cascade`;
     - `charge_id uuid null references rent_charges(id) on delete set null` (null = waiting for the next bill);
     - `kind text not null check (kind in ('utility','credit'))`;
     - `label text not null check (length(trim(label)) between 1 and 60)`;
     - `amount_cents integer not null`;
     - `check ((kind = 'utility' and amount_cents > 0) or (kind = 'credit' and amount_cents < 0))`;
     - `source_expense_id uuid null references property_expenses(id) on delete set null`;
     - `created_by_profile_id uuid not null default auth.uid() references profiles(id)`;
     - `created_at timestamptz not null default now()`;
   - a unique index on `(source_expense_id)` where `source_expense_id is not null`, so one bill can only be passed through once.
2. **RLS (enable):**
   - select: `can_administer_property` of the lease's property, or the lease's tenant (`leases.tenant_profile_id = auth.uid()`). Use a hardened `SECURITY DEFINER` helper `public.lease_visible_to_caller(p_lease_id uuid)` with `search_path = ''`, revoked from public and anon, and granted to authenticated.
   - **No insert, update or delete policies for authenticated.** All writes go through server actions using the admin client, **after** the server-side auth and role checks (same as charge editing today).
   - `revoke all on public.rent_charge_lines from anon, authenticated; grant select on public.rent_charge_lines to authenticated;`
3. **No change** to the `rent_charges` category CHECK, to `payments`, or to the Stripe tables.

### 3.2 Server (new `lib/charge-lines.ts`, ≤ 200 lines; actions in `app/actions/charge-lines.ts`)
1. **`addChargeLine({ leaseId, kind, label, amountCents, sourceExpenseId? })`**, following AGENTS.md §3 (auth → owner or manager who can administer the lease's property → zod validation).
   - **Target charge:** the lease's earliest `category='rent'` charge with `status = 'pending'`, not deleted, and `due_date > today`. "Today" is the property's local date; use the existing date helper.
     - If there is one: insert the line with `charge_id`, and in the same DB transaction set `rent_charges.amount_cents = amount_cents + line.amount_cents`. Use one RPC, `public.add_rent_charge_line(...)`: `SECURITY DEFINER`, `search_path = ''`, `revoke from public, anon, authenticated`, `grant execute to service_role` only, so it's callable only by the server's admin client. Inside it, `select … for update` the charge and re-check it's still pending and in the future.
     - If there's none: insert the line with `charge_id = null`. It waits for the next bill.
   - **Guard:** a credit may not make a charge total < 0. Return "That credit is bigger than the bill."
   - Write an audit entry using the existing charge-audit helper: field `amount_cents`, reason "Added line: <label>".
2. **`removeChargeLine(lineId)`:** only when its charge is still pending with `due_date > today`, or it's unattached. It reverses the amount through the same RPC pattern (`remove_rent_charge_line`). Otherwise return "This bill is already due. Add a credit instead."
3. **Charge generation** (`lib/charge-generation.ts`): when it inserts a new monthly rent charge, it attaches the lease's unattached lines and sets `amount_cents = rent + sum(lines)`.
   - Do this with one RPC call after the insert (`attach_pending_rent_charge_lines(p_charge_id)`, service_role only, row lock).
   - Keep the existing duplicate-insert handling. Lines must never attach twice.
4. **Bill pass-through:** a new action `billTenantForExpense(expenseId)`. Same pattern as 219's `setExpensePaidBy`: it runs after the bill saves, and has a retry-safe "Try again".
   - It requires `category = 'utility'` and a home with exactly one active lease. Otherwise it returns "This home has no active lease." (or "Pick which lease" if there are more than one, which is out of scope: just block it).
   - It calls `addChargeLine({ kind: 'utility', label: 'Water', amountCents: expense.amount_cents, sourceExpenseId })`. The label is "Water" when the expense description contains "water" (case-insensitive), otherwise "Utilities".
   - It's idempotent through the unique `source_expense_id`.
5. **Webhook safety** (`lib/stripe-webhook-handlers.ts` `recordPayment` / `markChargePaid`): only mark a charge `paid` when the recorded base amount ≥ the charge's current `amount_cents`. Otherwise:
   - record the payment row as today;
   - leave the charge `pending`;
   - `console.error` a `[charge-underpaid]` line with the charge id and the two amounts.
   - (This closes the race where a line is added after a checkout session was created.) No other webhook change.
6. **Money attribution** (pure helper `splitChargePayment(charge, lines)`):
   - **Rule:** for a paid charge with lines, the utility lines' sum is "Water paid back", credits reduce the rent part, and the rest is rent.
   - **Apply it in:**
     - `lib/home-money.ts` `loadRows`: a paid charge with utility lines yields two "in" entries on the same date: "Rent from <tenant>" (the rent part) and "Water paid back from <tenant>" (`kind:'rent'`, `category:'utility_reimbursement'`, label "Water paid back").
     - `groupByCategory` shows "Water paid back" as its own in-row.
     - `lib/rent-received.ts`: add `rentOnlyReceivedCents`, used by the **"Rent collected"** tile (`owner-wallet-home.ts` ytd `inCents` and 217's `ytd-tiles.tsx`). `rentReceivedCents` keeps its meaning (all money in), so "Left after bills" is unchanged.
     - `lib/reports-pnl.ts`: the utility reimbursement goes to its own "Water paid back" line, not rental income.
   - Batch every query, with no query in a loop. Check every error.
7. **Ledger** (`lib/reports-ledger.ts`): add `getMonthlyLeaseLedger(leaseId)`:
   - `lease { startDate, endDate, monthlyRentCents }`;
   - `months[]`: `{ month, rentCents, utilityCents, creditCents, owedCents, paidCents, balanceCents, short: paid < owed && month due }`;
   - `totals`.
   - Exclude waived and deleted charges and reversed payments. **Also fix** the existing `getTenantLedgerReport` to exclude waived charges and reversed payments.

### 3.3 UI (Wallet look, phone first)
1. **Bill form** (`expense-form.tsx`): for category Utility on a home with one active lease, show the checkbox "Bill the tenant for this" (default off). The help line under it reads "We'll add it to <tenant>'s next rent bill."
   - **On save:** save the bill, then call `billTenantForExpense`.
   - **On failure:** "We saved the bill but didn't add it to the rent bill. Try again." with a Try again button that retries only `billTenantForExpense`.
2. **Charge row** (owner Rent list): show the lines under the amount, muted ("Rent $2,160 · Water $112.59 · Credit −$104.94"). Add an "Add to this bill" menu item, which opens a sheet:
   - Type ("Water / utilities", "Credit"), Label, Amount;
   - shown only when the charge is pending with `due_date > today`;
   - otherwise the item says "Add to next bill" and creates an unattached line.
3. **Tenant** (`pay-rent-card.tsx`, `tenant-rent-card.tsx`):
   - the amount due is unchanged (the charge total), with a breakdown line under it when there are lines;
   - `tenant-payments.ts` selects category and the lines;
   - the "N months" label counts **distinct due months**, not charges.
4. **Receipt page and PDF:** list the lines under the total.
5. **Monthly ledger:** in owner Reports and on the home's property page, a "Rent & water by month" card per active lease. It shows:
   - a header: "Lease <Mon D, YYYY> – <Mon D, YYYY> · $X/mo";
   - rows: Month, Rent, Water, Credits, Paid, Balance. On phones, stack each row as a card;
   - short months with a warm background and "Short $X";
   - a totals row.

## 4. Out of scope
- Partial payments.
- Overpayment carry-forward (a manual payment still requires an exact total; a later sprint).
- Multiple leases per home.
- A tenant-facing ledger.
- Changes to late fees, autopay or reminders (they keep keying on `category='rent'`; the lines ride on that charge).
- Stripe refunds.
- Sprint 219 partner logic.

## 5. Exact files expected to change
- `supabase/migrations/20261013_sprint220_charge_lines.sql` (new)
- `apps/web/lib/charge-lines.ts`, `apps/web/app/actions/charge-lines.ts` (new)
- `apps/web/lib/charge-generation.ts`, `apps/web/lib/stripe-webhook-handlers.ts` (only the paid-threshold rule)
- `apps/web/lib/rent-received.ts`, `lib/home-money.ts`, `lib/owner-wallet-home.ts`, `lib/reports-pnl.ts`, `lib/reports-ledger.ts`, `lib/tenant-payments.ts`
- `apps/web/components/dashboard/expenses/expense-form.tsx`, `charge-row.tsx` (plus `charge-more-menu.tsx` if the menu lives there)
- `apps/web/components/dashboard/pay-rent-card.tsx`, `tenant-rent-card.tsx`
- `apps/web/app/payments/receipt/[chargeId]/page.tsx`, `apps/web/lib/pdf/pdf-builders.ts`
- `apps/web/components/reports/monthly-lease-ledger.tsx` (new), `app/owner/reports/page.tsx`, the property page panel that lists leases
- `apps/web/lib/validations-payment.ts` (the line schema)
- Tests for all of the above. List any other file touched, with a reason.

## 6. Implementation requirements
- Lines ≤ 140 characters; new files ≤ 200 lines; no file over 500 lines.
- Integer cents only.
- Every Supabase error is checked. No query inside a loop.
- Every server action follows AGENTS.md §3.
- Copy, exactly:
  - "Bill the tenant for this"
  - "We'll add it to <tenant>'s next rent bill."
  - "We saved the bill but didn't add it to the rent bill. Try again."
  - "Add to this bill"
  - "Add to next bill"
  - "Water / utilities"
  - "Credit"
  - "That credit is bigger than the bill."
  - "This bill is already due. Add a credit instead."
  - "This home has no active lease."
  - "Water paid back"
  - "Rent & water by month"
  - "Short $X"
  - the column labels Month, Rent, Water, Credits, Paid, Balance
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory. If the user needs to think about what to do, the UI needs to be clearer.
- **Invariants:**
  - every payment path still pays exactly one charge for its full `amount_cents`;
  - "Left after bills" totals are unchanged for existing data;
  - charges without lines behave and display exactly as today;
  - the manager fee calculation is unchanged.

## 7. Validation commands to run
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- `cd apps/web && npx vitest run`
- `npm run build --workspace @domus/web`
- Run `rm -rf apps/web/.next` first if tsc reports " 2" files.
- Don't apply the migration or run `gate:web`.

## 8. Acceptance criteria (binary; each one needs a named test that calls real code, or the stated static check)
1. **`addChargeLine`:**
   - (a) it attaches to the earliest pending future rent charge and the total rises by the line;
   - (b) with no eligible charge, it's unattached;
   - (c) a credit making a total < 0 is rejected with the exact copy;
   - (d) a non-admin caller (a tenant, or an unrelated owner) is rejected;
   - (e) an audit entry is written;
   - (f) a DB error → `{ ok: false }`.
2. **`removeChargeLine`:** it reverses the total on a future pending charge; on a due or paid charge it returns the exact copy.
3. **Generation:** a new monthly charge attaches the unattached lines once, with total = rent + lines. Running it twice doesn't double-attach.
4. **`billTenantForExpense`:**
   - (a) a utility bill → a Water line;
   - (b) a non-utility bill → rejected;
   - (c) no active lease → the exact copy;
   - (d) calling it twice creates one line;
   - (e) form retry: the bill saves, the line fails, Try again succeeds, and there's exactly one bill and one line.
5. **Webhook:** paid < amount → the charge stays pending, the payment is recorded, and `[charge-underpaid]` is logged. Paid == amount → paid, as today (the existing tests pass).
6. **`splitChargePayment` and money:**
   - (a) rent + water paid → "Rent" and "Water paid back" entries whose sum equals the payment;
   - (b) a credit reduces the rent part;
   - (c) "Rent collected" excludes water;
   - (d) "Left after bills" is unchanged for a charge with no lines (snapshot of existing data);
   - (e) P&L puts water paid back on its own line.
7. **Tenant:** the breakdown renders with lines and doesn't render without them; rent + water due the same month shows "1 month", not "2 months".
8. **Ledger:**
   - (a) monthly rows match a fixture modelled on the sheet: Nov rent 2,160 + water 112.59, paid 2,273 → balance −0.41;
   - (b) a short month is flagged;
   - (c) waived charges and reversed payments are excluded, in both the new ledger and the old one;
   - (d) totals.
9. **Migration file text test:**
   - RLS is enabled;
   - `revoke all … from anon, authenticated` comes before the grants;
   - no insert, update or delete grant or policy for authenticated;
   - the 3 RPCs are `SECURITY DEFINER`, use `search_path = ''`, and are executable only by service_role;
   - the helper is revoked from public and anon.
10. Lint, typecheck, the full suite and the build are green.

## 9. Report format
JSON per `docs/codex-report-schema.json`, with the test names mapped to §8. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
- **Don't apply the migration** or touch the live DB. Claude applies it and runs the attacker SQL: a tenant can only read their own lease's lines, managers and owners can read only lines on homes they administer, and nobody can write directly.
- No deploy, commit or push. Don't run `gate:web`.
- Don't touch `.claude/launch.json`, `apps/ios`, `apps/mobile`, `docs/`, or any "* 2.*" files.
- Don't invent copy beyond what's specified here.
