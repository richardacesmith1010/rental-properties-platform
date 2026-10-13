# Sprint 222 — Deposits held and "Yours to use" cash (L3: schema + money) · rev 4 (ChatGPT rev 1–3 = REJECT; all REQUIRED/OPTIONAL folded in)

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
1. **Deposit returns live in their own table** (a privilege boundary; **no new columns on `leases`**):
   - `public.lease_deposit_returns`:
     - `lease_id uuid primary key references leases(id) on delete cascade`;
     - `returned_cents integer not null check (returned_cents >= 0)`;
     - `returned_on date not null`;
     - `created_by_profile_id uuid not null references profiles(id)`, `created_at`.
   - **RLS:** enable it. Select policy: the caller can administer the lease's property, via a hardened SECURITY DEFINER helper `public.lease_admin_visible(p_lease_id uuid)` with `search_path = ''`, revoked from public and anon, and granted to authenticated.
     - `revoke all on public.lease_deposit_returns from anon, authenticated; grant select … to authenticated;`
     - **No insert, update or delete grant to any client role, so no client can write it, whatever settings it sets.**
   - **Trigger `leases_deposit_freeze`** (BEFORE UPDATE OF `deposit_cents` ON `leases`): if `deposit_cents` changes and a `lease_deposit_returns` row exists for the lease, raise "Undo the deposit return before changing the deposit." The check runs through a SECURITY DEFINER helper `public.lease_has_deposit_return(uuid)` (`search_path = ''`, revoked from public, anon and authenticated), so RLS can't hide the row. It applies to every role.
   - **Service-role-only RPCs** (`SECURITY DEFINER`, `search_path = ''`, revoked from public, anon and authenticated; granted to service_role). Each is one transaction covering the mutation and its `public.audit_logs` row:
     - `public.record_deposit_return(p_lease_id uuid, p_returned_cents integer, p_returned_on date, p_actor_profile_id uuid) returns text`:
       - validate `0 ≤ cents ≤ leases.deposit_cents` and `returned_on ≤ current_date`, and that the actor profile exists;
       - `insert … on conflict (lease_id) do nothing`. A conflict → return `'already'` with no audit row (idempotent; Undo is required to change it);
       - otherwise insert the audit row (`action='deposit_return_recorded'`, metadata `{returned_cents, returned_on}`) and return `'recorded'`.
       - An audit insert failure fails the whole call.
     - `public.clear_deposit_return(p_lease_id uuid, p_actor_profile_id uuid) returns text`: `delete … returning`. No row → `'none'` with no audit row; otherwise insert the audit row (`'deposit_return_cleared'`) and return `'cleared'`.
   - **Actor:** the server action authorizes the authenticated user (owner or manager who can administer the property) before calling, and passes that user's id. The RPC only accepts an existing profile id.
2. **`bank_accounts`:**
   - add `balance_cents bigint null`, `balance_as_of timestamptz null`, `balance_source text null check (balance_source in ('plaid','manual'))`;
   - add a check that all three are null or all three are set;
   - add **`account_type text null`** and **`iso_currency_code text null`**, the Plaid metadata used for eligibility.
   - **Column-level privilege:** these stay writable only by the service role. Don't add any authenticated grant on `bank_accounts`.
3. **Service-role-only RPC `public.save_bank_balances(p_connection_id uuid, p_lease_token uuid, p_balances jsonb, p_complete boolean) returns boolean`** (`SECURITY DEFINER`, `search_path = ''`, revoked from public, anon and authenticated; granted to service_role). One transaction:
   - `select … from bank_connections where id = p_connection_id and sync_lease_token = p_lease_token and sync_lease_until > now() and status in ('ok','error') for update`. No row → return false and write nothing. The row lock blocks any concurrent lease takeover until commit.
   - **Payload:** every account `/accounts/get` returned for the item: `{ plaid_account_id, account_type, subtype, currency, cents (nullable), as_of (nullable) }`. Duplicate `plaid_account_id`s are rejected (raise).
   - **Then, in the same transaction:**
     1. **One** `update … from jsonb_to_recordset` that sets `account_type`, `account_subtype` and `iso_currency_code` for matching rows of this connection, and sets the balance triple **only when the account is eligible and `cents` is not null**. Otherwise all three balance columns become **null**.
     2. **Only when `p_complete` is true:** **one** `update` that nulls the balance triple for this connection's Plaid accounts **not present** in the payload (closed or removed accounts). When `p_complete` is false, absent accounts are left untouched.
   - Return true.
4. **No new tables.**

### 3.2 Server
1. **Pure helper `depositHeldCents(lease, returnRow | null)`** in `lib/deposits.ts` (new): `deposit_cents` if there's no return row, else 0. A recorded return of **$0** means the whole deposit was kept, so nothing is held. It applies to every lease (active or ended). "Kept" = `deposit_cents − returned_cents`.
   - **`loadCashOnHand(userId)`** (`lib/cash-on-hand.ts`, new):
     - for each ownership account the user is an **active owner member** of, take its **eligible** bank accounts. Eligibility is decided **independently of whether a balance is stored**:
       - every `source='upload'` account;
       - every Plaid account whose `connection_id` points at a connection with status in (`ok`, `error`, `needs_login`), with `account_type = 'depository'` or null (unknown yet), subtype in the list or null, and currency `'USD'` or null (unknown yet).
       - Accounts with a **known** non-depository type or non-USD currency are excluded.
       - Accounts whose connection is revoked or disconnected (`connection_id` null on a Plaid account) are excluded.
     - An eligible account with no balance (including an unknown type or currency) is listed in `missingNames`, so `complete` is false. Sum `balance_cents` over those with a balance (negative balances included, never clamped), and sum `depositHeldCents` over the leases on its homes;
     - return `[{ accountId, accountName, bankCents, depositsHeldCents, yoursCents, checkedAt (the **oldest** `balance_as_of`), stale (`checkedAt` older than 3 days), hasBalance, complete (every eligible account has a balance), missingNames: string[] }]`;
     - `yoursCents` is only meaningful when `complete`; the UI hides it otherwise;
     - batched queries only, with every error checked.
   - Use the **user-scoped** client for reads (RLS), and verify membership server-side.
2. **Actions** (`app/actions/deposits.ts`, new; AGENTS.md §3: auth → owner or manager who can administer the lease's property → zod):
   - **`recordDepositReturn({ leaseId, returnedCents, returnedOn })`**: authorize, zod-validate, then call the `record_deposit_return` RPC through the admin client (atomic with its audit row). `'already'` → "This deposit return is already recorded. Undo it first." Check the error and revalidate. **No separate `logAudit` call.**
   - **`clearDepositReturn(leaseId)`**: undo through `clear_deposit_return` (atomic). `'none'` → success with no change.
3. **Plaid balances:**
   - in `syncConnection`, after a successful sync and **before** the lease is released, call `/accounts/get` once;
   - **Eligibility:** only accounts with `type = 'depository'`, a subtype in (`checking`, `savings`, `cash management`, `money market`), and `iso_currency_code = 'USD'` (a null or other currency is skipped). Credit, loan and investment balances are never stored.
   - **Amount — product rule:** "Yours to use" means money you can spend today, so use `balances.available` when it's not null, otherwise `balances.current`. Store `round(value * 100)`.
   - **Timestamp:** `balance_as_of` = `balances.last_updated_datetime` when Plaid provides it, otherwise `now()` (when Domus checked).
   - **Send every account `/accounts/get` returned** (eligible or not; ineligible ones or null values with `cents: null`) in one call to `save_bank_balances(connectionId, leaseToken, json, complete)`. A `false` result (lease lost) → no balance written, logged once. No per-account queries.
   - **Snapshot completeness:** the response counts as **complete** only if it's well-formed (`item.item_id` equals the connection's `plaid_item_id`, and `accounts` is an array), and it isn't an empty array while the connection has linked Plaid accounts.
     - Malformed or empty → **don't call the RPC at all**. Log `[bank-balance-incomplete]`. Stored balances stay unchanged; their `balance_as_of` keeps aging, so the stale warning shows.
   - a failure to fetch balances must not fail the sync: log `[bank-balance-failed]` with the allowlisted error code only.
4. **Manual balance:** `setManualBalance({ bankAccountId, balanceCents })`. Owner member of the bank account's owner account; **only for `source = 'upload'` accounts**; sets `balance_source = 'manual'` and `balance_as_of = now()`. A Plaid account → "This bank updates its balance by itself."

5. **Lease edit path:** the existing lease-edit action must surface the trigger's "Undo the deposit return before changing the deposit." as its error. The lease panel disables the deposit field while a return is recorded, with that same text as help.

### 3.3 UI (Wallet look, phone first)
1. **Money page:** a **"Cash on hand"** card above Partners, one block per ownership account with `hasBalance`. Each block shows:
   - the account name;
   - "In the bank" `$X`;
   - "Deposits you're holding" `−$Y`;
   - **"Yours to use"** `$Z` (large, tabular). **Only when `complete`.** When it isn't: "Add a balance for <names> to see Yours to use." (names joined with ", "), linking to `/owner/bank`, and the "In the bank" label becomes "In the bank (some accounts)".
   - "Last checked <relative time>". When stale: "Last checked over 3 days ago. Refresh your bank." with a link to `/owner/bank`.
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
  - "Last checked <time>"
  - "Last checked over 3 days ago. Refresh your bank."
  - "Add a balance for <names> to see Yours to use."
  - "In the bank (some accounts)"
  - "Deposit returns are recorded from the lease page."
  - "Undo the deposit return before changing the deposit."
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
1. **`depositHeldCents`:** active and not returned → the full deposit; returned (full or partial) → 0; **returned $0 (all kept) → 0**; ended and not returned → still held.
2. **`loadCashOnHand`:**
   - (a) sums the balances and deposits per ownership account;
   - (b) accounts without any balance → `hasBalance=false`;
   - (c) `stale` is set when the oldest balance is more than 3 days old; with mixed-age accounts, `checkedAt` is the **oldest**;
   - (c2) an upload account without a balance → `complete=false`, with `missingNames` listing it; a negative balance flows into `bankCents` and `yoursCents` unclamped;
   - (c3) two eligible Plaid accounts where only one has a balance → `complete=false`; a known credit or non-USD account is excluded; an unknown type or currency counts as eligible-missing; a revoked connection's accounts are excluded;
   - (d) a non-member account is excluded;
   - (e) a query error → fail closed.
3. **Deposit actions:**
   - (a0) the actions call the RPCs (never a direct table write), and an RPC error (e.g. an audit failure) → `{ ok: false }` with nothing reported as saved; `'already'` → the exact copy; `'none'` on undo → ok;
   - (a) a tenant or an unrelated owner is rejected;
   - (b) an amount above the deposit, negative, or a future date → rejected with validation copy;
   - (c) record, then clear, round-trips;
   - (d) the error is checked;
   - (e) an audit entry is written.
4. **Balances from sync:**
   - (a) after a sync, one `save_bank_balances` call carries **every** returned account with type, subtype and currency. Eligible accounts have `cents`; ineligible ones (credit, non-USD) and null values have `cents: null`;
   - (b) `available` is used first, with `current` as the fallback; `last_updated_datetime` is used when present, otherwise now;
   - (c) a `false` result (lease lost) → no balance write and one log line;
   - (c4) **snapshot completeness:** a malformed response (wrong `item_id`, missing `accounts`) or an empty array with linked accounts → no RPC call, the log line, and stored balances unchanged; a complete response → `p_complete=true`;
   - (d) a balance fetch failure doesn't fail the sync and logs the allowlisted code.
5. **Manual balance:** upload account → saved as manual; Plaid account → the exact copy; a non-member is rejected.
6. **UI:**
   - the Cash on hand card renders its blocks with the exact copy, plus the stale, empty and **incomplete** states (Yours to use hidden; the missing-names line shown);
   - the lease panel deposit states and sheet work;
   - the Homes card shows the deposit field;
   - the bank page shows balances and Update balance only on upload accounts.
7. **Migration text test:**
   - `lease_deposit_returns` exists, with RLS, no client write grants, and select-only for authenticated;
   - **no new columns on `leases`**;
   - the `leases_deposit_freeze` trigger and `lease_has_deposit_return` helper exist (SECURITY DEFINER, `search_path = ''`);
   - `record_deposit_return` and `clear_deposit_return` are service-role-only and insert into `audit_logs`;
   - the balance-triple CHECK on `bank_accounts`;
   - `save_bank_balances` is SECURITY DEFINER with `search_path = ''`, takes `for update` on `bank_connections`, uses a single `update … from jsonb_to_recordset`, and is service-role-only;
   - no grants to authenticated or anon;
   - no new tables.
7b. **Lease edit:** changing `deposit_cents` on a lease with a recorded return returns the exact copy; with no return recorded, it works as today.
8. Lint, typecheck, the full suite and the build are green.

**Claude will run live SQL (rolled back)** to prove:
- authenticated users can't update `bank_accounts` balance columns directly;
- `save_bank_balances` with a stale token writes nothing; if a concurrent lease acquire happens during the call, it waits for the call to finish (the row lock); an account missing from the payload, ineligible, or with null cents has its balance nulled; duplicate IDs raise;
- an authenticated owner or manager who **can update the lease** can't insert, update or delete `lease_deposit_returns`, **even after running `set_config` with any custom setting in the same transaction**;
- `record_deposit_return` and `clear_deposit_return` write their `audit_logs` row atomically; a forced audit failure rolls back; a repeated record returns `'already'` with no second audit row;
- changing `deposit_cents` while a return exists fails for authenticated users **and** the service role;
- `save_bank_balances` with `p_complete=false` leaves absent accounts' balances unchanged; with `true`, it nulls them;
- the CHECKs reject a returned amount above the deposit and partial balance triples.

## 9. Report format
JSON per `docs/codex-report-schema.json`, with the test names mapped to §8. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
- Don't apply the migration, touch the live DB or call Plaid.
- No deploy, commit or push. Don't run `gate:web`.
- Don't touch `.claude/launch.json`, `apps/ios`, `apps/mobile`, `docs/`, or "* 2.*" files.
- Don't invent copy beyond what's specified here.
