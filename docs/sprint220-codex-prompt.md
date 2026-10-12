# Sprint 220 — One monthly bill: water and credits on the next rent bill, plus a monthly ledger (L3: money + schema) · rev 2

**Rev 1 was rejected by ChatGPT.** The main reason: adding a line to an existing charge races with an open Stripe checkout. Rev 2 attaches lines **only when the next monthly charge is created**, inside one DB transaction. An existing charge's amount is never changed by a line.

The owner approved this on 2026-10-12. Source: `docs/partner-ledger-requirements.md`, Sheet A (A1–A4).

**Owner's framing:** the tenant gets one bill a month (rent + water), pays it in one payment, and credits or refunds lower what's owed.

## 1. Objective
1. **Bill lines.**
   - A monthly rent charge can carry extra lines:
     - `utility` (e.g. "Water"), a positive amount;
     - `credit` (e.g. "Water refund"), a negative amount.
   - The charge's `amount_cents` stays the one total the tenant pays. Every payment path (Stripe checkout, manual payment, bank-file match, "I already paid") keeps working on that one charge, unchanged.
   - **Core rule:** a line never changes an existing charge. A new line waits, unattached, and is attached atomically when the lease's next monthly charge is created.
2. **"Bill the tenant for this."** When an owner adds a Utility bill for a home with one active lease, a checkbox puts a Water line on the tenant's next bill. Owners and managers can also add a line or a credit to the next bill from the Rent list.
3. **Honest money totals.**
   - The utility part of a paid charge shows as **"Water paid back"** income, not rent.
   - The "Rent collected" tile excludes it.
   - "Left after bills" is unchanged.
4. **The tenant sees one amount due** with a breakdown (Rent $2,160 · Water $112.59). The receipt and PDF list the lines.
5. **Monthly ledger per lease (owner):**
   - a header with the lease term and monthly rent;
   - one row per month: Rent, Water, Credits, Paid, Balance;
   - short months flagged "Short $X";
   - a totals row.
   - Also fix the existing ledger bugs: waived charges and reversed payments must not count.

## 2. Context (HEAD after 219, branch `main`; code survey 2026-10-12)
- **`rent_charges`:**
  - category CHECK is `('rent','late_fee')`;
  - unique index on `(lease_id, due_date, category)` where not deleted;
  - status is pending | paid | late | waived.
  - Created in `lib/charge-generation.ts:400-486` (cron and the owner button) with `category:'rent'`. Duplicate inserts are ignored (23505).
  - Late fees are rent-only.
- **Charge editing** (`app/actions/charge-management.ts:42-110`) changes `amount_cents` on non-paid charges, with an audit trail.
- **Payments:**
  - one checkout pays one charge (`lib/charge-checkout.ts:88-210`, `app/actions/charges.ts:41-187`);
  - the webhook is `lib/stripe-webhook-handlers.ts:539-700`;
  - manual payments need amount == charge (`charges.ts:260-265`);
  - the bank feed needs an exact match (`lib/bank-feed/file-item.ts:72-92`).
- **Manager fee:** `getManagerFeeForProperty(propertyId, baseCents)` (`lib/payment-fees.ts:117-123`). It uses the configured `base_rent_cents` first, otherwise the base passed in, which today is the charge amount. It's called from `app/actions/charges.ts` and the webhook transfer code (`stripe-webhook-handlers.ts:270-430`).
- **Money views:**
  - `lib/rent-received.ts` counts every category;
  - `lib/home-money.ts:68-131` labels every payment "Rent from …";
  - `lib/reports-pnl.ts:179-183` puts everything except late fees into rental income.
- **Tenant:** `lib/tenant-payments.ts:31-108`, `components/dashboard/pay-rent-card.tsx`, `tenant-rent-card.tsx` (it says "N months" by counting charges), the receipt at `app/payments/receipt/[chargeId]/page.tsx:217`, and the PDF at `lib/pdf/pdf-builders.ts:102`.
- **Ledger:**
  - `lib/reports-ledger.ts:28-161`;
  - charges come from `reports-rent-roll.ts:256-262` with no status filter;
  - payments have no `reversed_at` filter (lines 54-60);
  - the UI is `components/reports/tenant-ledger-report.tsx` at `app/owner/reports/page.tsx`.
- **Bills:**
  - `property_expenses` (category `utility` exists);
  - the form is `components/dashboard/expenses/expense-form.tsx`;
  - Sprint 219's retry-safe follow-up pattern is `setExpensePaidBy`.
- **Supabase default privileges grant ALL to anon and authenticated on new public tables.** A new table must `revoke all … from anon, authenticated` before any grants (219 lesson).

## 3. In scope
### 3.1 Migration (Codex writes it; Claude reviews, applies it live and runs attacker + concurrency SQL)
`supabase/migrations/20261013_sprint220_charge_lines.sql`:

1. **Table `public.rent_charge_lines`.**
   - Columns:
     - `id uuid primary key default gen_random_uuid()`;
     - `lease_id uuid not null references public.leases(id) on delete cascade`;
     - `charge_id uuid null references public.rent_charges(id) on delete restrict`. Null means waiting for the next bill;
     - `kind text not null check (kind in ('utility','credit'))`;
     - `label text not null check (length(trim(label)) between 1 and 60)`;
     - `amount_cents integer not null`, with `check ((kind = 'utility' and amount_cents > 0) or (kind = 'credit' and amount_cents < 0))`;
     - `source_expense_id uuid null references public.property_expenses(id) on delete set null`;
     - `created_by_profile_id uuid not null references public.profiles(id)`. **No default.** It's always passed in explicitly;
     - `created_at timestamptz not null default now()`;
     - `attached_at timestamptz null`.
   - Indexes:
     - a unique index on `(source_expense_id)` where not null;
     - an index on `(lease_id)` where `charge_id is null`.
2. **RLS (enable).**
   - SELECT policy: `public.lease_visible_to_caller(lease_id)`. This is a hardened `SECURITY DEFINER` function (`set search_path = ''`, schema-qualified). It returns true when the caller can administer the lease's property (reuse `public.can_administer_property`), or is the lease's tenant. Revoke it from public and anon; grant it to authenticated.
   - There are no insert, update or delete policies.
   - `revoke all on public.rent_charge_lines from anon, authenticated; grant select on public.rent_charge_lines to authenticated;`
3. **Service-role-only RPCs.** Each is `SECURITY DEFINER` with `set search_path = ''` and schema-qualified names, then `revoke all … from public, anon, authenticated; grant execute … to service_role;`.
   - **`public.add_rent_charge_line(p_lease_id uuid, p_kind text, p_label text, p_amount_cents integer, p_source_expense_id uuid, p_actor_profile_id uuid) returns uuid`.** It inserts an **unattached** line. It validates from canonical rows:
     - the lease exists;
     - the kind and sign agree;
     - if `p_source_expense_id` is given, the expense's `property_id` equals the property of the lease's unit, and its category is `utility`;
     - for a credit, `abs(amount) < leases.monthly_rent_cents`.
     - On a duplicate `source_expense_id`, it returns the existing line's id (idempotent).
   - **`public.remove_rent_charge_line(p_line_id uuid, p_actor_profile_id uuid)`** deletes only when `charge_id is null`. Otherwise it raises `line_attached`.
   - **`public.create_rent_charge_with_lines(p_lease_id uuid, p_due_date date, p_rent_cents integer) returns table(charge_id uuid, created boolean)`.** It runs in one transaction:
     1. Insert the rent charge (`category 'rent'`, status `pending`, amount = `p_rent_cents`). If it conflicts with the unique (lease, due date, rent, not deleted) index, return the existing id with `created=false` and attach nothing.
     2. Claim lines with one `update public.rent_charge_lines set charge_id = <new id>, attached_at = now() where lease_id = p_lease_id and charge_id is null and id = any(<selected ids>) returning id, amount_cents`. The `charge_id is null` re-check under row locks guarantees a line attaches at most once.
     3. **Selection rule** (deterministic; the total stays strictly > 0):
        - every unattached utility line;
        - then unattached credits, oldest first, only while rent + utilities + the credits chosen so far stays > 0;
        - credits that don't fit stay unattached for the next bill.
     4. Set the charge's `amount_cents` = `p_rent_cents` + the sum of the claimed lines.
     - A crash at any step rolls back everything.
4. No change to the `rent_charges` CHECK, `payments`, or the Stripe tables.

### 3.2 Server (`lib/charge-lines.ts` ≤ 200 lines; actions in `app/actions/charge-lines.ts`)
1. **`addNextBillLine({ leaseId, kind, label, amountCents })`.** The client can't pass `sourceExpenseId`.
   - Follow AGENTS.md §3: auth → owner or manager who can administer the lease's property → zod.
   - Then call `add_rent_charge_line` through the admin client, with `p_actor_profile_id` = the authenticated user's id. Write an audit entry.
   - A credit ≥ rent → "That credit is bigger than the rent."
   - A DB error → `{ ok: false }`.
2. **`removeNextBillLine(lineId)`.** Same auth. If the line is attached → "This line is already on a bill. Add a credit to the next bill instead."
3. **Charge generation** (`lib/charge-generation.ts`): replace the direct rent-charge insert with one `create_rent_charge_with_lines` call per lease.
   - `created=false` is the old duplicate path.
   - Keep everything else: which leases get charges, the due dates, notifications.
4. **`billTenantForExpense(expenseId)`.**
   - Auth → an admin of the expense's property → the expense is `utility` → exactly one active lease. Then call `add_rent_charge_line` with `p_source_expense_id = expenseId` and the actor id.
   - Label: "Water" if the description contains "water" (any case), otherwise "Utilities".
   - It's idempotent.
   - No active lease → "This home has no active lease."
   - More than one → "This home has more than one lease. Use Add to next bill on the Rent list."
   - The bill form uses the retry-safe flow from 219.
5. **Charge editing:** if a charge has any lines, block changing `amount_cents` with "This bill has water or credit lines. Add a credit to the next bill instead." Its other fields stay editable. Charges without lines are unchanged.
6. **One shared pure helper, `chargeBreakdown(charge, lines)`.**
   - It returns `{ rentCents, utilityCents, creditCents, totalCents }`, where `rentCents = total − utility − credit` (credit is the negative sum).
   - It asserts the parts reconcile to `amount_cents`.
   - The owner row, the tenant cards, the receipt, the PDF, the ledger and the money attribution all use it.
7. **`splitChargePayment(breakdown)`.**
   - Credits reduce rent first, down to 0, then utilities.
   - It returns `{ rentIncomeCents ≥ 0, waterPaidBackCents ≥ 0 }`, summing exactly to the total.
   - **Apply it in:**
     - `lib/home-money.ts` `loadRows`: a paid charge with utility lines yields "Rent from <tenant>" and "Water paid back from <tenant>" (`category:'utility_reimbursement'`), and `groupByCategory` shows a "Water paid back" in-row;
     - `lib/rent-received.ts`: a new `rentOnlyReceivedCents` for the "Rent collected" tile (`owner-wallet-home.ts` ytd `inCents`). `rentReceivedCents` stays "all money in";
     - `lib/reports-pnl.ts`: a "Water paid back" line.
   - Use batched queries, no query in a loop, and check every error.
8. **Manager fee:** where the fee base falls back to the charge amount (`app/actions/charges.ts`, and the webhook transfer code), pass `splitChargePayment(...).rentIncomeCents` for charges with lines.
   - Unlined charges: inputs and outputs identical to today.
   - A configured `base_rent_cents` still wins, as today.
   - No other webhook change.
9. **Ledger:** add `getMonthlyLeaseLedger(leaseId)` in `lib/reports-ledger.ts`.
   - Returns `lease { startDate, endDate, monthlyRentCents }`, `months[] { month, rentCents, utilityCents, creditCents, owedCents, paidCents, balanceCents, short }`, and `totals`.
   - Uses `chargeBreakdown`. Excludes waived and deleted charges, and reversed payments.
   - The balance is cumulative. Historical overpayment shows as a negative balance.
   - Also fix `getTenantLedgerReport` to exclude waived charges and reversed payments.

### 3.3 UI (Wallet look, phone first)
1. **Bill form:** for a Utility bill on a home with one active lease, add the checkbox "Bill the tenant for this" (off by default), with the help text "We'll add it to <tenant>'s next rent bill."
   - Save the bill, then call `billTenantForExpense`.
   - On failure: "We saved the bill but didn't add it to the rent bill. Try again." with a Try again button that retries only `billTenantForExpense`.
2. **Owner Rent list:**
   - Each charge shows its lines under the amount, muted ("Rent $2,160 · Water $112.59 · Credit −$104.94").
   - Add a menu item, "Add to next bill". It opens a sheet with Type ("Water / utilities", "Credit"), Label and Amount.
   - The lease's latest charge shows "On next bill: Water $112.59" for unattached lines, each with a Remove button.
3. **Tenant:**
   - The amount due is the same (the charge total), with a breakdown line under it when there are lines.
   - `tenant-payments.ts` loads the category and the lines.
   - "N months" counts distinct due months.
4. **Receipt and PDF:** list the lines under the total.
5. **Monthly ledger card**, "Rent & water by month", in owner Reports and on the home's property page, one per active lease:
   - header: "Lease <Mon D, YYYY> – <Mon D, YYYY> · $X/mo";
   - columns Month, Rent, Water, Credits, Paid, Balance (on phones, stack each month as a card);
   - short months get a warm background and "Short $X";
   - a totals row.

## 4. Out of scope
- Partial payments.
- Overpayment carry-forward.
- Any webhook change other than the manager-fee base (§3.2.8).
- Changing an existing charge with a line.
- Multiple leases per home.
- A tenant-facing ledger.
- Late fees, autopay and reminders (still rent-only; lines ride on the rent charge).
- Stripe refunds.
- Partners (219).

## 5. Exact files expected to change
- `supabase/migrations/20261013_sprint220_charge_lines.sql` (new)
- `apps/web/lib/charge-lines.ts`, `apps/web/app/actions/charge-lines.ts` (new)
- `apps/web/lib/charge-generation.ts`
- `apps/web/app/actions/charge-management.ts` (the amount-edit block only)
- `apps/web/app/actions/charges.ts` and `apps/web/lib/stripe-webhook-handlers.ts` (the manager-fee base for lined charges only)
- `apps/web/lib/rent-received.ts`, `lib/home-money.ts`, `lib/owner-wallet-home.ts`, `lib/reports-pnl.ts`, `lib/reports-ledger.ts`, `lib/tenant-payments.ts`
- `apps/web/components/dashboard/expenses/expense-form.tsx`, `charge-row.tsx` (and `charge-more-menu.tsx` if the menu lives there)
- `apps/web/components/dashboard/pay-rent-card.tsx`, `tenant-rent-card.tsx`
- `apps/web/app/payments/receipt/[chargeId]/page.tsx`, `apps/web/lib/pdf/pdf-builders.ts`
- `apps/web/components/reports/monthly-lease-ledger.tsx` (new), `app/owner/reports/page.tsx`, the property page panel that lists leases
- `apps/web/lib/validations-payment.ts` (the line schema)
- Tests for all of the above. List any other file you touch, with the reason.

## 6. Implementation requirements
- Lines ≤ 140 characters; new files ≤ 200 lines; no file over 500 lines.
- Integer cents only.
- Check every Supabase error. No query inside a loop.
- Every action follows AGENTS.md §3.
- Copy, exactly:
  - "Bill the tenant for this"
  - "We'll add it to <tenant>'s next rent bill."
  - "We saved the bill but didn't add it to the rent bill. Try again."
  - "Add to next bill"
  - "On next bill:"
  - "Water / utilities"
  - "Credit"
  - "That credit is bigger than the rent."
  - "This line is already on a bill. Add a credit to the next bill instead."
  - "This home has no active lease."
  - "This home has more than one lease. Use Add to next bill on the Rent list."
  - "This bill has water or credit lines. Add a credit to the next bill instead."
  - "Water paid back"
  - "Rent & water by month"
  - "Short $X"
  - the column labels Month, Rent, Water, Credits, Paid, Balance
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory. If the user needs to think about what to do, the UI needs to be clearer.
- **Invariants:**
  - a line never changes an existing charge's `amount_cents`;
  - every payment path pays one charge for its full `amount_cents`;
  - "Left after bills" is unchanged for existing data;
  - unlined charges behave and display exactly as today;
  - the manager fee is unchanged for unlined charges, and computed on the rent part for lined charges.

## 7. Validation commands to run
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- `cd apps/web && npx vitest run`
- `npm run build --workspace @domus/web`
- Run `rm -rf apps/web/.next` first if tsc reports " 2" files.
- Don't apply the migration or run `gate:web`.

## 8. Acceptance criteria (binary; each one needs a named test that calls real code, or the stated static check)
1. **`addNextBillLine` / `billTenantForExpense`:**
   - (a) the line is unattached, and no existing charge's amount changes, including a pending charge with an open checkout;
   - (b) credit ≥ rent → the exact copy;
   - (c) a tenant or an unrelated owner is rejected;
   - (d) the actor id is passed to the RPC;
   - (e) an audit entry is written;
   - (f) a DB error → `{ ok: false }`;
   - (g) a utility bill → a Water line; a non-utility bill is rejected;
   - (h) no active lease, and more than one, each give their exact copy;
   - (i) calling it twice → one line;
   - (j) form retry → exactly one bill and one line;
   - (k) `sourceExpenseId` isn't in the client action's schema.
2. **`removeNextBillLine`:** unattached → removed; attached → the exact copy.
3. **Generation** (RPC mocked at the boundary):
   - (a) the total = rent + claimed lines;
   - (b) `created=false` → nothing attached;
   - (c) the selection rule: all utilities; credits oldest first while the total stays > 0; excess credit stays waiting;
   - (d) the existing generation tests pass.
4. **Charge editing:** an amount edit on a lined charge is blocked with the exact copy; an unlined charge works as today.
5. **`chargeBreakdown` / `splitChargePayment`:**
   - (a) credit < rent;
   - (b) credit == rent;
   - (c) rent < credit < total;
   - (d) several utility and credit lines;
   - (e) every part is ≥ 0 and the parts sum to the total;
   - (f) the reconcile assertion fires on a mismatch.
6. **Money:**
   - (a) rent + water paid → "Rent" + "Water paid back", summing to the payment;
   - (b) "Rent collected" excludes water;
   - (c) "Left after bills" is unchanged for unlined data (snapshot);
   - (d) P&L has a "Water paid back" line;
   - (e) manager fee: rent-only is identical to today; with rent + water, it's on rent only; with rent + water + credit, it's on rent after the credit; a configured `base_rent_cents` is unchanged in all 3.
7. **Tenant:** the breakdown shows with lines and not without; rent + water in one month says "1 month".
8. **Ledger:**
   - (a) a fixture from the sheet: Nov rent 2,160 + water 112.59, paid 2,273 → balance −0.41;
   - (b) a short month is flagged;
   - (c) waived and reversed items are excluded in both ledgers;
   - (d) the totals.
9. **Migration file text test:**
   - RLS is enabled;
   - `revoke all … from anon, authenticated` comes before the grants;
   - only select is granted to authenticated;
   - the 3 RPCs are SECURITY DEFINER with `search_path = ''`, revoked from public, anon and authenticated, and granted to service_role only;
   - `created_by_profile_id` has no default;
   - `charge_id` uses `on delete restrict`.
10. Lint, typecheck, the full suite and the build are green.

**Claude will also run live SQL (rolled back) proving:**
- tenants read only their own lease's lines;
- managers and owners read only lines on homes they administer;
- direct writes are denied;
- authenticated users can't execute the RPCs;
- a line is claimed at most once across two `create_rent_charge_with_lines` calls;
- the credit selection rule holds.

## 9. Report format
JSON per `docs/codex-report-schema.json`, with the test names mapped to §8. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
- Don't apply the migration or touch the live DB.
- No deploy, commit or push. Don't run `gate:web`.
- Don't touch `.claude/launch.json`, `apps/ios`, `apps/mobile`, `docs/`, or any "* 2.*" files.
- Don't invent copy beyond what's specified here.
