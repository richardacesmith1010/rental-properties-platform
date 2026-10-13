# Sprint 222 — Deposits held and "Yours to use" cash (L3: schema + money) · rev 1

The owner approved this on 2026-10-13. Source: `docs/partner-ledger-requirements.md` B5. Her sheet works it out like this: "Navy Federal balance $21,885 − Security deposit $3,750 = $18,135 we can actually use."

## 1. Objective
1. **Deposits held.** Every lease's security deposit counts as "held" (money that belongs to the tenant) until the owner records that it was returned.
   - Recording a return takes one sheet: the amount returned (full or partial) and the date.
   - Whatever wasn't returned (kept for damage) stops being "held" once the return is recorded.
2. **Bank balances.** Each connected bank account (Sprint 224) stores its latest balance from Plaid, refreshed on every sync.
   - Upload-only accounts can get a balance typed in by hand ("as of" today).
3. **Cash on hand.** For each ownership account with at least one balance, show:
   - "In the bank" (the sum of that account's bank balances);
   - "Deposits you're holding" (the sum held on that account's homes);
   - "Yours to use" (bank minus deposits).
   - Plus how old the balance is.

## 2. Context (HEAD after 225, branch `main`)
- **`leases`** (live, 2026-10-13): id, unit_id, tenant_profile_id, start_date, end_date, monthly_rent_cents, due_day_of_month, `deposit_cents`, active, lease_status, terminated_at, collects_outside_domus, …
  - There are no deposit-return fields.
  - Live data: 1st Home deposit $2,350 (active); smoke leases $0.
  - Lease editing is in `components/dashboard/lease-manage-panel.tsx` (it has a deposit field) and its action.
- **`bank_accounts`** (Sprint 224) has: `owner_account_id`, `source` upload | plaid, `connection_id`, `plaid_account_id`, `mask`, `account_subtype`, `nickname`. It has no balance columns.
- **Sync** is `lib/bank-feed/sync.ts`: a fenced lease, with Plaid calls in `lib/plaid.ts`.
  - `/transactions/sync` returns `accounts` **only for accounts with new transactions**.
  - `/accounts/get` returns cached balances for **all** accounts at no extra product cost, so use that.
- **RLS on `bank_accounts`:** owner members can read; writes go through the service role only.
- The Money page is `app/owner/money/page.tsx` plus `components/home-money/*`. Partners (219) and settle-up (221) live there.
- **Supabase default privileges:** revoke before you grant (219 lesson). A recreated CHECK must equal live ± the change (L-012).

## 3. In scope
### 3.1 Migration `supabase/migrations/20261015_sprint222_deposits_cash.sql` (Codex writes it; Claude applies it and runs attacker SQL)
1. **`leases`:** add `deposit_returned_cents integer null` and `deposit_returned_on date null`.
   - Check: `(deposit_returned_cents is null and deposit_returned_on is null) or (deposit_returned_cents between 0 and deposit_cents and deposit_returned_on is not null)`.
2. **`bank_accounts`:**
   - add `balance_cents bigint null`, `balance_as_of timestamptz null`, `balance_source text null check (balance_source in ('plaid','manual'))`;
   - add a check that all three are null or all three are set.
   - **Column-level privilege:** these stay writable only by the service role. Don't add any authenticated grant on `bank_accounts`.
3. **No new tables.**

### 3.2 Server
1. **Pure helper `depositHeldCents(lease)`** in `lib/deposits.ts` (new): `deposit_cents` if `deposit_returned_on` is null, else 0. It applies to every lease (active or ended); deposits on deleted leases don't exist.
   - **`loadCashOnHand(userId)`** (`lib/cash-on-hand.ts`, new):
     - for each ownership account the user is an **active owner member** of: sum `balance_cents` over its `bank_accounts` with a non-null balance; sum `depositHeldCents` over the leases on its homes;
     - return `[{ accountId, accountName, bankCents, depositsHeldCents, yoursCents, asOf (oldest balance_as_of), stale (asOf older than 3 days), hasBalance }]`;
     - batched queries only, with every error checked.
   - Use the **user-scoped** client for reads (RLS), and verify membership server-side.
2. **Actions** (`app/actions/deposits.ts`, new; AGENTS.md §3: auth → owner or manager who can administer the lease's property → zod):
   - **`recordDepositReturn({ leaseId, returnedCents, returnedOn })`**: `0 ≤ returnedCents ≤ deposit_cents`; `returnedOn` not in the future. Writes through the admin client after authorization, checks the error, writes an audit entry, and revalidates.
   - **`clearDepositReturn(leaseId)`**: undo. Sets both columns to null.
3. **Plaid balances:**
   - in `syncConnection`, after a successful sync and **before** the lease is released, call `/accounts/get` once;
   - for each returned account whose `plaid_account_id` matches a `bank_accounts` row of this connection, update `balance_cents = round(balances.current * 100)` (use `available` when `current` is null), `balance_as_of = now()`, `balance_source = 'plaid'`. Fence it with the lease token, the same as the cursor save (if the lease is lost, skip the balance write);
   - a failure to fetch balances must not fail the sync: log `[bank-balance-failed]` with the allowlisted error code only.
4. **Manual balance:** `setManualBalance({ bankAccountId, balanceCents })`. Owner member of the bank account's owner account; **only for `source = 'upload'` accounts**; sets `balance_source = 'manual'` and `balance_as_of = now()`. A Plaid account → "This bank updates its balance by itself."

### 3.3 UI (Wallet look, phone first)
1. **Money page:** a **"Cash on hand"** card above Partners, one block per ownership account with `hasBalance`. Each block shows:
   - the account name;
   - "In the bank" `$X`;
   - "Deposits you're holding" `−$Y`;
   - **"Yours to use"** `$Z` (large, tabular);
   - "As of <relative time>". When stale: "Balance may be old. Refresh your bank." with a link to `/owner/bank`.
   - When no account has a balance, show one muted line: "Connect a bank to see cash on hand." with a link to `/owner/bank`.
2. **Bank page:**
   - each connected account row shows its balance and "as of";
   - each upload account row gets "Update balance", an inline amount field and **Save** (calls `setManualBalance`).
3. **Lease panel** (`lease-manage-panel.tsx`), deposit section:
   - **Not returned:** "Deposit $2,350 · You're holding it", with a button **Record deposit returned**. It opens a sheet with "Amount returned" (prefilled with the full deposit), the date (defaults to today) and Save.
   - **Returned:** "Deposit returned $2,000 on Mar 1, 2027 · Kept $350", with **Undo**.
4. **Homes pass card** (217b), for leased homes: add a 5th field, "Deposit" → "$2,350 held", or "Returned" if returned.

## 4. Out of scope
- Moving money.
- Interest on deposits.
- State deposit-law rules.
- Showing deposits to tenants.
- Plaid `/accounts/balance/get` (real-time, paid).
- Changing partner or settle-up math.

## 5. Exact files expected to change
- `supabase/migrations/20261015_sprint222_deposits_cash.sql` (new)
- `apps/web/lib/deposits.ts`, `lib/cash-on-hand.ts`, `app/actions/deposits.ts`, `app/actions/bank-balances.ts` (new)
- `apps/web/lib/bank-feed/sync.ts`, `apps/web/lib/plaid.ts` (if a helper is needed)
- `apps/web/app/owner/money/page.tsx`, `components/home-money/cash-on-hand-card.tsx` (new)
- `apps/web/components/bank-feed/bank-connections-card.tsx` and the upload account list
- `apps/web/components/dashboard/lease-manage-panel.tsx`, `components/dashboard/deposit-return-sheet.tsx` (new)
- `apps/web/components/dashboard/owner-homes/homes-wallet.tsx`, `lib/owner-wallet-home.ts` (only to add the deposit fields)
- Tests for all of the above.

## 6. Implementation requirements
- Lines ≤ 140 characters; new files ≤ 200 lines.
- Integer cents.
- Check every Supabase error. No query inside a loop.
- Every action follows AGENTS.md §3.
- Copy, exactly:
  - "Cash on hand"
  - "In the bank"
  - "Deposits you're holding"
  - "Yours to use"
  - "As of <time>"
  - "Balance may be old. Refresh your bank."
  - "Connect a bank to see cash on hand."
  - "Update balance"
  - "Save"
  - "This bank updates its balance by itself."
  - "Deposit $X · You're holding it"
  - "Record deposit returned"
  - "Amount returned"
  - "Deposit returned $X on <date> · Kept $Y"
  - "Undo"
  - "Deposit"
  - "$X held"
  - "Returned"
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory. If the user needs to think about what to do, the UI needs to be clearer.

## 7. Validation commands to run
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- `cd apps/web && npx vitest run`
- `npm run build --workspace @domus/web`
- Don't apply the migration or run `gate:web`.

## 8. Acceptance criteria (binary; named tests that call real code)
1. **`depositHeldCents`:** active and not returned → the full deposit; returned (full or partial) → 0; ended and not returned → still held.
2. **`loadCashOnHand`:**
   - (a) sums the balances and deposits per ownership account;
   - (b) accounts without any balance → `hasBalance=false`;
   - (c) `stale` is set when the oldest balance is more than 3 days old;
   - (d) a non-member account is excluded;
   - (e) a query error → fail closed.
3. **Deposit actions:**
   - (a) a tenant or an unrelated owner is rejected;
   - (b) an amount above the deposit, negative, or a future date → rejected with validation copy;
   - (c) record, then clear, round-trips;
   - (d) the error is checked;
   - (e) an audit entry is written.
4. **Balances from sync:**
   - (a) after a sync, `/accounts/get` balances are written for matching accounts only, in cents;
   - (b) `current` null falls back to `available`;
   - (c) a lost lease → no balance write;
   - (d) a balance fetch failure doesn't fail the sync and logs the allowlisted code.
5. **Manual balance:** upload account → saved as manual; Plaid account → the exact copy; a non-member is rejected.
6. **UI:**
   - the Cash on hand card renders its blocks with the exact copy, and its stale and empty states;
   - the lease panel deposit states and sheet work;
   - the Homes card shows the deposit field;
   - the bank page shows balances and Update balance only on upload accounts.
7. **Migration text test:** the CHECKs on both tables are present; no grants to authenticated or anon on `bank_accounts` writes; no new tables.
8. Lint, typecheck, the full suite and the build are green.

**Claude will run live SQL (rolled back)** to prove:
- authenticated users can't update `bank_accounts` balance columns directly;
- a tenant or an unrelated owner can't update a lease's deposit-return columns (the existing `leases` RLS governs; Claude reads the live policy before apply);
- the CHECKs reject a returned amount above the deposit and partial balance triples.

## 9. Report format
JSON per `docs/codex-report-schema.json`, with the test names mapped to §8. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
- Don't apply the migration, touch the live DB or call Plaid.
- No deploy, commit or push. Don't run `gate:web`.
- Don't touch `.claude/launch.json`, `apps/ios`, `apps/mobile`, `docs/`, or "* 2.*" files.
- Don't invent copy beyond what's specified here.
