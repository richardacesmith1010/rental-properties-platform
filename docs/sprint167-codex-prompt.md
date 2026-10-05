# Sprint 167 — Bank feed Phase 1: upload a bank file, match, review, file (L3)

## 1. Objective
Let an owner upload a bank activity file (CSV) from Fidelity or Navy Federal (or another bank) at `/owner/bank`. Domus finds the rental items:
- rent deposits are recorded against the right lease charge;
- bills are filed as property expenses;
- moves between the owner's own accounts are skipped and never counted.

The owner answers a short "Money to check" list with one tap per item. "Always do this" turns an answer into a rule, so the same item is filed automatically next time. Personal spending is never saved.

Design (approved): `docs/bank-feed-design.md`. Read the "Privacy model" and "Real bank patterns" sections first. Mockup of the review card: https://claude.ai/artifact/Wp4XfbAcPvXTXmiGyY1FwU (board "Money to check").

## 2. Context
- Branch `main`. HEAD is the commit that adds this packet. Deploys happen automatically on push; you do not deploy.
- The stack: Next.js 14 App Router, Supabase, Vitest. Server actions use `requireAuth` (`app/actions/auth-helpers.ts`), `createAdminClient`, `checkRateLimit`, `canUserAdministerProperty` (`lib/property-access.ts`) and `logAudit`.
- **The DB migration is already written and is applied by Claude:** `supabase/migrations/20261005_sprint167_bank_feed.sql`.
  - Tables: `bank_accounts`, `bank_rules`, `bank_transactions`, `bank_skipped_fingerprints`.
  - Do not edit that file. Read it for exact columns and checks.
  - RLS gives owners read-only access; all writes go through server actions with the admin client.
- Existing tables you write to:
  - `payments`: method must be one of `ach|card|cash|check|other`. Unique errors use code 23505.
  - `rent_charges`: status `pending|paid|late|waived`; `deleted_at` must be null for a live charge.
  - `property_expenses`: category must be one of `mortgage|insurance|property_tax|hoa|repair|maintenance|utility|management_fee|legal|other`; `amount_cents > 0`.
  - Do not add categories.
- Reference logic: `recordManualPayment` in `app/actions/charges.ts:382` (payment insert, then charge → paid) and `createExpense` in `app/actions/expenses.ts:20`. Do not change these functions.
- Real data, owner "1st Home" (one active lease, $2,350/mo due on the 1st, `collects_outside_domus = true`):
  - The Oct and Sep charges are already `paid`. The Nov charge is `pending`.
  - Bank rows look like:
    - Fidelity rent deposit: `DIRECT DEPOSIT NFCU ACH P2P ANGEL J HERNANDWEB (Cash)`, +2350.00.
    - Fidelity transfer out: `Electronic Funds Transfer Paid (Cash)`, −2350.00.
    - Navy Federal rent arriving from Fidelity: `ACH Credit` / `Deposit`, +2350.00.
    - Mortgage: `Transfer To Mortgage`, −1039.44, on the 1st and again on the 15th.
    - Solar: `Payment to Solar Servicing`, −266.40.
    - Water: `- Ispc XX0028`, −92.00.
    - Pest control: `Pos Debit 9678 Py *magna Pest Sol North Charles SC US`, −59.99.
    - Personal look-alike: `Pos Debit 9678 Rps*cortland Congr 800-7040154 GA US`, −2280.07. This is the owner's own apartment rent and must never match a lease, because it is outgoing.

## 3. In scope
1. **CSV parsing (pure, runs in the browser):** `lib/bank-feed/csv.ts`.
   - Detect the header row; skip any preamble or footer lines before or after it.
   - Handle quoted fields and commas inside quotes.
   - Map columns by alias:
     - Date: `Run Date`, `Posting Date`, `Transaction Date`, `Date`, `Posted Date`.
     - Description: `Action`, `Description`, `Payee`, `Memo`, `Name`. For Fidelity, use `Action`, plus `Description` if that adds text.
     - Amount, one of these forms:
       - one signed `Amount`/`Amount ($)` column;
       - separate `Debit`/`Credit` columns;
       - a positive `Amount` plus a `Credit Debit Indicator` column (`Credit` = in, `Debit` = out).
   - Detect the institution:
     - Fidelity: `Run Date` + `Action`.
     - Navy Federal: `Credit Debit Indicator`.
     - Otherwise: `other`.
   - Output: `{ institution, rows: Array<{ postedOn: "YYYY-MM-DD", amountCents: number (>0), direction: "in"|"out", description: string (trimmed, ≤300 chars) }>, ignoredLineCount }`.
   - Drop rows with no parseable date or a zero amount.
   - Accept the date formats `MM/DD/YYYY`, `M/D/YYYY`, `YYYY-MM-DD` and `Mon-DD-YYYY`.
   - Limits: at most 2 MB and 5,000 rows. Otherwise return an error code the UI turns into plain words.
2. **Matching (pure, unit-tested):** `lib/bank-feed/match.ts`.
   - `normalizeDescription(s)`: uppercase; collapse whitespace; remove `(CASH)`; remove digit runs of 5 or more characters. Used for rules and fingerprints.
   - `classifyRows(input)`. Input:
     - normalized rows;
     - the account's rules;
     - existing fingerprints (filed + skipped);
     - the account's active leases with their open and paid charges (id, due date, amount, status, tenant name, property id/name);
     - the account's properties;
     - recent `kind='rent'` bank items for the owner account (last 45 days, plus rent rows in this file).
   - Output: one result per row, decided in this order:
     a. **`already`:** the fingerprint is already in `bank_transactions` or `bank_skipped_fingerprints`. Never shown again.
     b. **`auto`:** the first matching rule (same direction; `normalizedDescription` includes `match_text`; rule for this bank account or for all accounts). Carries the rule action.
     c. **`ask`** with a suggestion:
        - **Rent:** an incoming amount equals an active lease's charge amount for a charge due within ±7 days of the row date, or equals `monthly_rent_cents` within ±7 days of the due day. Suggest "Rent from {tenant} · {property}" with the charge id; the charge may be paid, pending or late.
        - **Transfer:** the description contains `TRANSFER`, `EFT`, `ACH CREDIT` or `DEPOSIT`, and the amount equals a recent rent item's amount, dated 0–10 days after it. Suggest "Moving rent between your accounts".
        - **Bill keywords** (outgoing only), mapped to an expense category:
          - `MORTGAGE` → `mortgage`;
          - `SOLAR` → `utility` (label "Solar");
          - `WATER` or `ISPC` → `utility` (label "Water");
          - `PEST` → `maintenance` (label "Pest control");
          - `INSURANCE` → `insurance`;
          - `HOA` → `hoa`;
          - `PROPERTY TAX` or `TREASURER` → `property_tax`;
          - `PLUMB`, `HVAC` or `REPAIR` → `repair`.
          - The property is the owner account's only active property; with more than one, the property is left for the owner to pick.
     d. **`personal`:** everything else. Not shown in the list, not saved, not sent anywhere.
   - Incoming money can only ever suggest rent or a transfer. Outgoing money can never match a lease.
   - Two identical rows on the same day get different fingerprints, using an occurrence index within that file.
3. **Fingerprint (server only):** `lib/bank-feed/fingerprint.ts`.
   - `sha256(bankAccountId | postedOn | amountCents | direction | normalizedDescription | occurrenceIndex)` as 64 hex characters, using `node:crypto`.
   - Never trust a fingerprint sent by the client; always recompute it on the server.
4. **Server actions:** `app/actions/bank-feed.ts`. Every action:
   - calls `requireAuth("owner")` and a rate limit;
   - validates input with zod (new schemas in `lib/validations-bank-feed.ts`);
   - checks the user is an active owner member of the bank account's `owner_account_id`, using the admin client query on `ownership_account_members` (`member_role='owner'`, `active=true`), the same as `is_owner_member_of_account`;
   - checks every `property_id` / `lease_id` / `rent_charge_id` it touches belongs to that same owner account, via `canUserAdministerProperty` plus a direct check that `properties.owner_account_id` equals the bank account's owner account;
   - checks every mutation's error;
   - returns explicit `{ success, error }`.

   The actions:
   - `createBankAccount({ ownerAccountId, institution, nickname })`. Reuses the existing account on a unique conflict.
   - `importBankRows({ bankAccountId, rows })`. Rows come from the browser parser, at most 5,000; the server re-validates each one.
     1. Load the classification inputs.
     2. Classify the rows.
     3. **Apply `auto` results now** (file them, see below; insert `bank_transactions` with `matched_by='rule'` and `rule_id`). A `skip` rule writes only a skipped fingerprint.
     4. Update `last_import_at`.
     5. Return `{ filedCount, transferCount, alreadyCount, personalCount, askItems: Array<{ key, postedOn, amountCents, direction, description, suggestion }> }`.

     It never stores `ask` or `personal` rows.
   - `answerBankItem({ bankAccountId, row, decision: "yes"|"no", always: boolean, choice? })`.
     - Recompute the fingerprint. If it already exists, return `{ success: true, already: true }`.
     - `yes`: file it using the suggestion, or the owner's `choice` when they changed it (property, and kind `rent|expense|transfer` with lease/charge or category). Insert `bank_transactions` with `matched_by='owner'`.
     - `no`: insert only into `bank_skipped_fingerprints`.
     - When `always` is true, upsert a `bank_rules` row:
       - `match_text` = `normalizeDescription(row.description)`, truncated to 200 characters; same direction; scoped to this bank account;
       - action `rent` (lease_id), `expense` (property_id, category, label), `transfer`, or `skip`.
   - `undoBankItem({ bankTransactionId })`. Only for items whose `created_record=true`.
     - Expense: delete the expense, then delete the bank item.
     - Rent: delete the payment. Set the charge to `pending` only if no other non-reversed payment exists for it. Then delete the bank item.
   - `deleteBankAccount({ bankAccountId })`. Deletes the bank account. Its items, rules and fingerprints cascade. Rent payments and expenses that were already filed stay.
   - **Filing rules:**
     - **Rent**, with charge status `pending` or `late` and amount equal to the charge amount:
       - insert a `payments` row: method `ach`, `reference_note` "From bank: {nickname}", `paid_at` = row date at 12:00 UTC;
       - set the charge to `paid` with `.in("status", ["pending","late"])`;
       - set `created_record=true`.
       - If the charge is already `paid`: link `rent_charge_id`, and `payment_id` if exactly one payment exists, with `created_record=false`, and do not create a payment ("Already recorded").
       - If the amount differs from the charge: return the plain error "This amount does not match the rent. Record it from the Rent page." and store nothing.
     - **Expense:** insert `property_expenses` with:
       - `created_by_profile_id` = user;
       - `category`;
       - `description` = label + " · " + the first 80 characters of the bank description;
       - `amount_cents`;
       - `expense_date` = row date;
       - `recurring=false`.

       Set `created_record=true`.
     - **Transfer:** insert only `bank_transactions` with `kind='transfer'` and `property_id` null. Not counted anywhere.
     - Do not send notifications or emails from any bank action. Log an audit entry with fixed fields only (`action`: `bank_import` | `bank_answer` | `bank_undo` | `bank_account_delete`; counts and ids; never descriptions or amounts).
5. **Page:** `app/owner/bank/page.tsx` (server) and `components/bank-feed/*` (client).
   - `requireRole(["owner"])`.
   - Resolve the owner account from `?account=` among the user's accounts where they are an owner member; default to the first. Show a picker only if there is more than one.
   - Load the account's bank accounts, plus the last 20 `bank_transactions` with property name.
   - Layout, in plain words, on one column at 375 px and centred at max-w-3xl on desktop:
     - **Header:** "Bank activity", with the subtitle "Domus sorts rent and bills for your homes."
     - **Upload card:**
       1. "Which account is this file from?" — the existing bank accounts, plus "Add an account" (nickname field, bank select Fidelity / Navy Federal / Other).
       2. "Choose file" (accept `.csv`).
       - The file is parsed in the browser. Only parsed rows are sent; the file itself is never uploaded.
       - If the detected institution differs from the chosen account's institution, show a short warning, but allow continuing.
     - **Result summary:** e.g. "3 filed for you · 1 move between your accounts skipped · 42 personal items skipped (not saved)".
     - **"Money to check"** list, one card per `ask` item, matching the mockup:
       - payee, date, amount (green for money in);
       - a blue "Looks like: …" line;
       - the checkbox "Always do this for this payee", checked by default;
       - the buttons "Not rental" and "Yes, that's right";
       - a small "Change" link that opens inline selects: Type (Rent / Bill / Moving my money); Home; and Bill type or Lease charge.
       - If the suggestion has no property (several homes), the Home select is shown open and "Yes" stays disabled until a home is picked.
       - After an answer, the card collapses to "Filed: …" with an "Undo" button (when `created_record`), or to "Skipped. Domus will not ask again."
     - **"Missed a bill?"** disclosure listing the `personal` rows held only in browser memory. Each has the button "This is for a home", which moves it into the Money to check list with an empty suggestion. Say: "These are not saved."
     - **"Recent bank items"** list: date, what, home, type, amount. Plus a footer: "Domus only keeps rental items. It can only read your files. It can never move money."
     - **"Remove this account"** in a details area, with a confirm dialog.
   - Every interactive element is at least 44 px tall, uses the existing tokens (`var(--ink)`, `--muted`, `--accent`, `--surface`, `--line`, `domus-card`), and works in light and dark mode.
6. **Entry point on the owner Home:** in `components/dashboard/owner-daily-ops-home.tsx`, for the owner only (`!isManagerView`), add one static card linking to `/owner/bank`:
   - title "Sort your bank activity";
   - body "Upload your bank file. Domus files rent and bills for you.";
   - button "Open".

   No new data loading.

## 4. Out of scope
- Plaid sync, ledger, monthly profit, alerts and tax download (Phases 2–3).
- Any new expense category. Any change to `recordManualPayment`, `createExpense`, charge generation, the Stripe code, or the owner section cache/menu.
- Managers. The bank feed is owner-only.
- Editing the migration, applying DB changes, deploying.
- Persisting `ask` or `personal` rows anywhere: not the DB, not localStorage, not logs.

## 5. Exact files expected to change
New:
- `apps/web/lib/bank-feed/csv.ts`
- `apps/web/lib/bank-feed/match.ts`
- `apps/web/lib/bank-feed/fingerprint.ts`
- `apps/web/lib/bank-feed/types.ts`
- `apps/web/lib/bank-feed/file-item.ts` (server-only filing helpers used by the actions)
- `apps/web/lib/validations-bank-feed.ts`
- `apps/web/app/actions/bank-feed.ts`
- `apps/web/app/owner/bank/page.tsx`
- `apps/web/app/owner/bank/loading.tsx`
- `apps/web/components/bank-feed/` — at most 5 component files: page shell, upload card, review card, recent list, missed list
- `apps/web/lib/__tests__/bank-feed-csv.test.ts`
- `apps/web/lib/__tests__/bank-feed-match.test.ts`
- `apps/web/lib/__tests__/bank-feed-actions.test.ts`
- `apps/web/components/__tests__/bank-feed-review.test.tsx`

Changed:
- `apps/web/components/dashboard/owner-daily-ops-home.tsx` (Home card only)
- `apps/web/components/__tests__/owner-daily-ops-home.test.tsx` (assert the card for owners, and its absence for managers)
- `apps/web/app/actions/index.ts`: only if actions are re-exported there by convention.

Each file must be at most 400 lines, and each line at most 140 characters.

## 6. Implementation requirements
- **Privacy (hard):**
  - Never log, audit, send to Sentry, or store descriptions or amounts of rows that end up `personal` or answered `no`.
  - The import action holds rows only in memory for that request.
  - No `console.log` of rows.
  - The CSV file is never uploaded; only the parsed rows go to the server.
- **Auth (hard):** for every action, list the steps in the action body in this order: auth → rate limit → validate → membership/ownership checks → mutations. Do not rely on RLS for writes.
- **Money correctness:**
  - Amounts are integer cents everywhere. Parse "1,039.44" as 103944 cents, without floating-point multiplication errors: parse the string.
  - A row can file at most one record (enforced by the `bank_transactions` unique fingerprint). On error 23505, return `already`.
  - The order is payment insert → charge update → `bank_transactions` insert. If the `bank_transactions` insert fails after creating a payment or expense, delete that created record (compensate) and return an error.
- **Matching behaviour:**
  - Rules apply before suggestions.
  - A rent rule (lease) files into the charge for that lease due within ±7 days. If none qualifies, the row falls back to `ask`.
  - The mortgage rule must match both the 1st and the 15th rows in the same month.
- **Plain language** (6th-grade level, 12 words or fewer per sentence). Never use the words "charge", "submit", "reconcile", "transaction", "CSV" (say "bank file") or "fingerprint". Use only the copy in this packet or copy in the same style.
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory. If the user needs to think about what to do, the UI needs to be clearer.
- Do not invent URLs or emails. The only new route is `/owner/bank`.

## 7. Validation commands to run
- `npx vitest run apps/web/lib/__tests__/bank-feed-csv.test.ts apps/web/lib/__tests__/bank-feed-match.test.ts apps/web/lib/__tests__/bank-feed-actions.test.ts apps/web/components/__tests__/bank-feed-review.test.tsx apps/web/components/__tests__/owner-daily-ops-home.test.tsx` (use the repo's vitest config/workdir as other sprints did)
- `npx tsc -p apps/web/tsconfig.json --noEmit`
- `npm run lint:web`
- Every existing test file that imports a file you changed.

Claude runs the full gate.

## 8. Acceptance criteria (binary)
1. The CSV tests parse these fixtures to the exact rows:
   - **Fidelity:**
     - a preamble line + header `Run Date,Account,Action,Symbol,Description,Type,Quantity,Price ($),Commission ($),Fees ($),Accrued Interest ($),Amount ($),Cash Balance ($),Settlement Date`;
     - rows `10/02/2026,…,"DIRECT DEPOSIT NFCU ACH P2P JANE Q TENANTWEB (Cash)",…,2350.00,…` and `10/05/2026,…,"Electronic Funds Transfer Paid (Cash)",…,-2350.00,…`;
     - a footer disclaimer.

     Result: institution `fidelity`; 2 rows; in 235000 and out 235000.
   - **Navy Federal:**
     - header `Posting Date,Transaction Date,Amount,Credit Debit Indicator,type,Type Group,Reference,Instructed Currency,Currency Exchange Rate,Instructed Amount,Description,Category,Check Serial Number,Card Ending`;
     - rows for: ACH Credit 2350.00 Credit; Transfer To Mortgage 1039.44 Debit (Oct 1 and Sep 15); Payment to Solar Servicing 266.40 Debit; - Ispc XX0028 92.00 Debit; Py *magna Pest Sol 59.99 Debit; Rps*cortland 2280.07 Debit; Payment to xfinity 81.81 Debit.

     Result: institution `navy_federal`; correct directions and cents.
   - **Generic** `Date,Description,Debit,Credit`.
   - Fixtures with quoted commas and `$1,039.44` parse correctly. Oversize input returns the error code.
2. The match tests, with the 1st Home lease (rent 235000 due on the 1st, Nov charge pending):
   - Fidelity +2350 on Nov 2 → ask Rent with the Nov charge.
   - Navy Federal ACH Credit +2350 on Nov 5, after that rent item → ask Transfer.
   - Mortgage (out) → ask expense `mortgage`.
   - Solar → `utility` "Solar".
   - Ispc → `utility` "Water".
   - Magna → `maintenance` "Pest control".
   - Cortland −2280.07 → `personal`, never rent.
   - xfinity → `personal`.
   - With a mortgage rule present, both the Oct 1 and Oct 15 mortgage rows are `auto`.
   - A row whose fingerprint exists → `already`.
   - Two identical same-day rows → two distinct fingerprints.
3. The action tests (mocked admin client) prove:
   - A non-member, or a property/lease from another owner account, is rejected and nothing is written.
   - Rent into a pending charge inserts a payment (ach, the row date) and sets the charge to paid.
   - An already-paid charge creates no payment.
   - An amount mismatch writes nothing.
   - A `no` answer writes only a skipped fingerprint.
   - `always` creates exactly one rule.
   - Undo of a rent item deletes the payment and returns the charge to pending.
   - A failure of the `bank_transactions` insert removes the created expense.
   - Import never writes `ask` or `personal` rows.
4. The component test:
   - The review card renders "Looks like:", "Not rental", "Yes, that's right" and the "Always do this" checkbox, checked.
   - "Yes" is disabled until a home is picked when the suggestion has no property.
   - The collapsed state shows "Filed:" with Undo.
5. The owner Home shows the "Sort your bank activity" card linking to `/owner/bank`. The manager view does not.
6. The targeted tests, typecheck and lint pass. No file outside §5 changed. Every file is 400 lines or less, and every line is 140 characters or less.
7. A grep of `apps/web/components/bank-feed` and `apps/web/app/owner/bank` for user-facing `Charge|Submit|Transaction|CSV|reconcil|fingerprint` returns nothing (code identifiers are allowed).

## 9. Report format
JSON per `docs/codex-report-schema.json`. `no_out_of_scope_diffs` must be true. In `deviations`, list any assumption about CSV formats you made beyond the fixtures. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
- No DB apply, no migration edits, no deploy, no git push. Commit locally only if asked; otherwise leave the changes in the working tree.
- Do not modify, revert or format any file you did not create or that is not listed in §5. Specifically, never touch `.claude/launch.json`, `docs/`, `CLAUDE.md` or `AGENTS.md`.
- No new npm dependencies.
- Fixtures must use fake person names (e.g. `JANE Q TENANT`), never the real tenant name from §2. Business payee names above are fine.
