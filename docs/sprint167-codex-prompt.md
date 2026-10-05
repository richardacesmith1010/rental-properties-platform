# Sprint 167 — Bank feed Phase 1: upload a bank file, match, review, file (L3)

Revision 4 — ChatGPT verdict APPROVE WITH CHANGES; the one change (guarded restore after a failed payment insert) is applied. (ChatGPT rev 1: 9 required changes adopted; rev 2: claim-first rent filing, outgoing transfers need a known incoming leg, explicit createBankAccount membership check). Transfer detection now runs before rent; tokens are HMAC-signed; fingerprints are keyed; compensation and undo restore the prior status; migration has integrity triggers and shape checks; rules need specific payee text and have a fixed precedence; personal rows map back by index.

## 1. Objective
Let an owner upload a bank activity file (CSV) from Fidelity or Navy Federal (or another bank) at `/owner/bank`. Domus finds the rental items:
- rent deposits are recorded against the right lease charge;
- bills are filed as property expenses;
- moves between the owner's own accounts are skipped and never counted.

The owner answers a short "Money to check" list with one tap per item. "Always do this" turns an answer into a rule (only for specific payees), so the same item is filed automatically next time. Personal spending is never saved.

Design (approved): `docs/bank-feed-design.md`. Read the "Privacy model" and "Real bank patterns" sections first. Mockup of the review card: https://claude.ai/artifact/Wp4XfbAcPvXTXmiGyY1FwU (board "Money to check").

## 2. Context
- Branch `main`. HEAD is the commit that adds this packet. Deploys happen automatically on push; you do not deploy.
- The stack: Next.js 14 App Router, Supabase, Vitest. Server actions use `requireAuth` (`app/actions/auth-helpers.ts`), `createAdminClient`, `checkRateLimit`, `canUserAdministerProperty` (`lib/property-access.ts`) and `logAudit`.
- **The DB migration is already written and is applied by Claude:** `supabase/migrations/20261005_sprint167_bank_feed.sql`.
  - Tables: `bank_accounts`, `bank_rules`, `bank_transactions`, `bank_skipped_fingerprints`.
  - Do not edit that file. Read it for exact columns, shape checks and triggers.
  - Triggers reject any row whose references (bank account, property, lease, rent charge, payment, expense, rule) span two ownership accounts.
  - Deleting a payment or expense cascades to its bank item.
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
   - `occurrenceIndex`: computed **on the server** in `importBankRows`. For each row, it is the count of earlier rows in the same request with the
     same (postedOn, amountCents, direction, normalizedDescription). Rows keep the order of the file.
   - `classifyRows(input)`. Input:
     - normalized rows with their client index `i` and server occurrence index;
     - the owner account's rules;
     - existing fingerprints for this bank account (filed + skipped);
     - the owner account's active leases with their charges in the row date window (id, lease id, due date, amount, status, tenant name, property id/name);
     - the owner account's active properties;
     - `kind='rent'` bank items for the owner account dated within 45 days before the earliest row, with their bank account id, plus rent rows
       classified earlier in this same request (rule rent rows count; ask rent suggestions do not).
   - Output: one result per row, decided in this exact order:
     a. **`already`:** the keyed fingerprint is already in `bank_transactions` or `bank_skipped_fingerprints` for this bank account.
     b. **`transfer` (automatic, no rule needed):** the description contains `TRANSFER`, `EFT`, `ACH CREDIT` or `DEPOSIT`, and there is a rent item
        (step input above) with the same amount dated 0–10 days earlier, and either
        - the row is **incoming on a different bank account** than that rent item, or
        - the row is **outgoing on the same bank account** as that rent item **and** a matching incoming leg is already known: a `kind='transfer'`
          item (stored, or classified `transfer` earlier in this request) with the same amount, on a different bank account of the same owner
          account, dated 0–5 days after this row.
        An outgoing row without that incoming leg is **not** automatic: it becomes `ask` with the suggestion "Moving rent between your accounts".
        Stored as `kind='transfer'`, `matched_by='auto'`. This runs **before** rules and rent, so money moved between the owner's own accounts can never be counted as rent twice.
     c. **`auto`:** the best matching rule, chosen by this precedence: same direction and `normalizedDescription` includes `match_text`;
        then rules for this bank account before rules for all accounts; then the longest `match_text`; then the oldest `created_at`; then the lowest `id`.
        A rent rule files into that lease's charge due within ±7 days. If none qualifies, or the amount differs from that charge, fall through to `ask`.
     d. **`ask`** with a suggestion:
        - **Rent** (incoming only): the amount equals a charge of an active lease due within ±7 days of the row date (any status except waived).
          If more than one charge qualifies, choose the closest due date. Suggest "Rent from {tenant} · {property}" with the charge id.
        - **Bill keywords** (outgoing only), mapped to an expense category:
          - `MORTGAGE` → `mortgage`;
          - `SOLAR` → `utility` (label "Solar");
          - `WATER` or `ISPC` → `utility` (label "Water");
          - `PEST` → `maintenance` (label "Pest control");
          - `INSURANCE` → `insurance`;
          - `HOA` → `hoa`;
          - `PROPERTY TAX` or `TREASURER` → `property_tax`;
          - `PLUMB`, `HVAC` or `REPAIR` → `repair`.
          - The property is the owner account's only active property. With more than one, the property is left for the owner to pick.
     e. **`personal`:** everything else. Not saved anywhere.
   - Incoming money can only ever suggest rent or a transfer. Outgoing money can never match a lease.
   - `isSpecificMatchText(text)`: false if the text is shorter than 6 characters, or if no word of 3+ letters remains after removing these generic words:
     `ACH CREDIT DEBIT DEPOSIT TRANSFER EFT ELECTRONIC FUNDS PAID PAYMENT POS DIRECT ONLINE WITHDRAWAL CHECK CASH TO FROM DC US`.
     Example results: "ACH CREDIT" → false; "ELECTRONIC FUNDS TRANSFER PAID" → false; "TRANSFER TO MORTGAGE" → true; "- ISPC XX0028" → true.
3. **Keyed fingerprint and row tokens (server only):** `lib/bank-feed/fingerprint.ts`.
   - Secret: `process.env.BANK_FEED_SECRET` (at least 32 characters). If missing, actions return "Bank files are not set up yet." Claude sets the env var. Never log it.
   - `fingerprint = HMAC-SHA256(secret, "fp1|" + bankAccountId + "|" + postedOn + "|" + amountCents + "|" + direction + "|" + normalizedDescription + "|" + occurrenceIndex)`, as 64 lowercase hex characters.
   - `rowToken`: base64url(JSON payload) + "." + base64url(HMAC-SHA256(secret, "tok1|" + payload)). The payload is
     `{ v:1, bankAccountId, profileId, postedOn, amountCents, direction, description, occurrenceIndex, exp }`, with `exp` = now + 24 h.
   - `verifyRowToken(token, { bankAccountId, profileId })` uses a constant-time compare. It rejects a bad signature, a wrong account or profile, and an expired token.
     The server takes the row **only** from a verified token, never from separate client fields. Changing the occurrence index breaks the signature.
4. **Server actions:** `app/actions/bank-feed.ts`. Every action:
   - calls `requireAuth("owner")` and a rate limit;
   - validates input with zod (new schemas in `lib/validations-bank-feed.ts`);
   - checks the user is an active owner member of the bank account's `owner_account_id`, using the admin client query on `ownership_account_members`
     (`member_role='owner'`, `active=true`), the same as `is_owner_member_of_account`;
   - checks every `property_id` / `lease_id` / `rent_charge_id` it touches belongs to that same owner account, via `canUserAdministerProperty`
     plus a direct check that `properties.owner_account_id` equals the bank account's owner account (the DB triggers are a second line of defence);
   - checks every mutation's error;
   - returns explicit `{ success, error }`;
   - logs failures with fixed operation names only. Never log the request, rows, row tokens or raw DB error objects.

   The actions:
   - `createBankAccount({ ownerAccountId, institution, nickname })`. Before inserting, verify the user is an active `member_role='owner'` member of
     exactly that `ownerAccountId` (admin query on `ownership_account_members`). Otherwise return "You do not have access to this account." and write
     nothing. Reuses the existing account on a unique conflict.
   - `importBankRows({ bankAccountId, rows: Array<{ i, postedOn, amountCents, direction, description }> })`. At most 5,000 rows; the server re-validates each one.
     1. Compute occurrence indexes and keyed fingerprints. Load the classification inputs (batched queries, no query per row).
     2. Classify the rows.
     3. Apply `transfer` and `auto` results now, **one row at a time in file order**: file them (see below), then insert `bank_transactions`
        with `matched_by` `auto` or `rule` (with `rule_id`). A `skip` rule writes only a skipped fingerprint.
        - If one row fails, stop. Return the counts that did succeed, and the error "Some items were filed. Try again to finish."
        - A retry is safe, because filed rows come back as `already`.
     4. Update `last_import_at` (check the error).
     5. Return:
        `{ filedCount, transferCount, alreadyCount, skippedByRuleCount, personalCount, results: Array<{ i, status, token?, suggestion? }> }`.
        - `status` is one of `filed | transfer | already | skipped | ask | personal`.
        - A `token` is returned for `ask` and `personal` rows, so the browser can move a personal row into the list ("Missed a bill?") without the server keeping it.
        - Never return descriptions or amounts; the browser already holds them by `i`.

     It never stores `ask` or `personal` rows.
   - `answerBankItem({ bankAccountId, token, decision: "yes"|"no", always: boolean, choice? })`.
     - Verify the token. Recompute the fingerprint from the token payload. If it already exists, return `{ success: true, already: true }`.
     - `yes`: file it using the server's own fresh classification of the token row, or the owner's `choice` when they changed it.
       `choice` is `{ kind: "rent", rentChargeId } | { kind: "expense", propertyId, category, label } | { kind: "transfer" }`.
       Insert `bank_transactions` with `matched_by='owner'`.
     - `no`: insert only into `bank_skipped_fingerprints`.
     - When `always` is true and `isSpecificMatchText(match_text)` is true, upsert one `bank_rules` row:
       - `match_text` = `normalizeDescription(description)`, truncated to 200 characters; same direction; scoped to this bank account;
       - action `rent` (lease_id), `expense` (property_id, category, label), `transfer`, or `skip`.
       - If the text is not specific, file the item but create no rule, and return `ruleSkipped: true`. The UI then says
         "Filed. Domus will ask again next time for this one."
   - `undoBankItem({ bankTransactionId })`. Only for items with `created_record=true`.
     - Expense: delete the expense. The bank item goes with it (FK cascade). Check the error.
     - Rent: delete the payment. The bank item goes with it (FK cascade).
       Then, only if no other non-reversed payment exists for that charge, set the charge status back to `prior_charge_status` with `.eq("status","paid")`.
   - `deleteBankAccount({ bankAccountId })`. Deletes the bank account. Its items, rules and fingerprints cascade. Rent payments and expenses that were already filed stay.
   - **Filing rules** (shared helper in `lib/bank-feed/file-item.ts`):
     - **Rent** into a charge with status `pending` or `late` and an amount equal to the charge amount:
       1. remember the charge's current status as `priorStatus`;
       2. **claim the charge first:** update it to `paid` with `.eq("id", chargeId).eq("status", priorStatus).select("id")`. This must return
          **exactly one row**. Zero rows (someone else changed it) → write nothing and return "This rent was just recorded. Refresh to see it."
          A DB error → return an error. Only one concurrent request can win this claim, so only one payment can ever be created;
       3. insert a `payments` row: method `ach`, `reference_note` "From bank: {nickname}", `paid_at` = row date at 12:00 UTC. If this fails, restore the
          charge to `priorStatus` only if no other non-reversed payment exists for it, with `.eq("status","paid").select("id")` (expect one
          row; log a fixed operation name if not), and return an error;
       4. insert `bank_transactions` (`created_record=true`, `payment_id`, `prior_charge_status=priorStatus`). If this fails: delete the payment just
          created; then, only if no other non-reversed payment exists for the charge, set it back to `priorStatus` with `.eq("status","paid")`;
          return an error.
       - Every compensating update/delete checks its error and its affected-row count, and logs a fixed operation name if it fails.
       - Charge already `paid`: link `rent_charge_id`, and `payment_id` only if exactly one non-reversed payment exists, with `created_record=false`.
         Create no payment. The UI says "Already recorded".
       - Amount differs from the charge: return "This amount does not match the rent. Record it from the Rent page." Store nothing.
     - **Expense:** insert `property_expenses` with:
       - `created_by_profile_id` = user;
       - `category`;
       - `description` = label + " · " + the first 80 characters of the bank description;
       - `amount_cents`;
       - `expense_date` = row date;
       - `recurring=false`.

       Then insert `bank_transactions` (`created_record=true`). If that insert fails, delete the expense and return an error.
     - **Transfer:** insert only `bank_transactions` with `kind='transfer'` and every reference null. Not counted anywhere.
     - Do not send notifications or emails from any bank action. Log an audit entry with fixed fields only:
       `action` is `bank_import` | `bank_answer` | `bank_undo` | `bank_account_delete`, plus counts and ids. Never descriptions or amounts.
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
       - the checkbox "Always do this for this payee". It is shown and checked only when the result has `ruleable: true` (the server ran
         `isSpecificMatchText` on it). Otherwise it is hidden. Import results for `ask` rows include `ruleable`;
       - the buttons "Not rental" and "Yes, that's right";
       - a small "Change" link that opens inline selects: Type (Rent / Bill / Moving my money); Home; and Bill type or Lease charge.
       - If the suggestion has no property (several homes), the Home select is shown open and "Yes" stays disabled until a home is picked.
       - After an answer, the card collapses to "Filed: …" with an "Undo" button (when `created_record`), or to "Skipped. Domus will not ask again."
     - **"Missed a bill?"** disclosure listing the `personal` rows held only in browser memory. Each has the button "This is for a home", which moves it into the Money to check list (using that row's `token`) with an empty suggestion. Say: "These are not saved."
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
- `apps/web/lib/__tests__/bank-feed-fingerprint.test.ts`
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
  - Follow the exact rent and expense step order and compensation in §3.4 "Filing rules". Restoring a charge never overwrites another payment's effect.
- **Matching behaviour:**
  - Order: already → automatic transfer → rules (with the precedence in §3.2) → suggestions → personal.
  - The mortgage rule must match both the 1st and the 15th rows in the same month.
- **Plain language** (6th-grade level, 12 words or fewer per sentence). Never use the words "charge", "submit", "reconcile", "transaction", "CSV" (say "bank file") or "fingerprint". Use only the copy in this packet or copy in the same style.
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory. If the user needs to think about what to do, the UI needs to be clearer.
- Do not invent URLs or emails. The only new route is `/owner/bank`.

## 7. Validation commands to run
- `npx vitest run apps/web/lib/__tests__/bank-feed-csv.test.ts apps/web/lib/__tests__/bank-feed-match.test.ts apps/web/lib/__tests__/bank-feed-fingerprint.test.ts apps/web/lib/__tests__/bank-feed-actions.test.ts apps/web/components/__tests__/bank-feed-review.test.tsx apps/web/components/__tests__/owner-daily-ops-home.test.tsx` (use the repo's vitest config/workdir as other sprints did)
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
   - Navy Federal ACH Credit +2350 on Nov 5, with that Fidelity rent item already filed on the other bank account → `transfer` (automatic), **even
     though the Nov charge is now paid**. The same row with no earlier rent item → ask Rent.
   - Fidelity "Electronic Funds Transfer Paid" −2350 on Nov 5, on the same account as the Nov 2 rent item, with no known incoming leg → `ask`
     ("Moving rent between your accounts"). With a stored Navy Federal `transfer` item of 2350 on Nov 5 → `transfer` (automatic).
   - An outgoing personal payment of 2350 with a transfer word and no incoming leg is never stored automatically.
   - A rent rule plus a paid Oct charge: the Navy Federal Oct 5 ACH Credit is still `transfer`, not rent.
   - Rule precedence: an account-specific rule beats a global rule; a longer `match_text` beats a shorter one; ties use the oldest rule.
   - `isSpecificMatchText`: "ACH CREDIT" and "ELECTRONIC FUNDS TRANSFER PAID" → false; "TRANSFER TO MORTGAGE" and "- ISPC XX0028" → true.
   - Mortgage (out) → ask expense `mortgage`.
   - Solar → `utility` "Solar".
   - Ispc → `utility` "Water".
   - Magna → `maintenance` "Pest control".
   - Cortland −2280.07 → `personal`, never rent.
   - xfinity → `personal`.
   - With a mortgage rule present, both the Oct 1 and Oct 15 mortgage rows are `auto`.
   - A row whose fingerprint exists → `already`.
   - Two identical same-day rows → two distinct fingerprints. Importing the same file twice → every row is `already` on the second run.
     Importing an overlapping file (Oct + Nov after Oct) → only the Nov rows are new.
   - Fingerprints are keyed: the same row with a different secret gives a different fingerprint.
3. The action tests (mocked admin client) prove:
   - A non-member, or a property/lease from another owner account, is rejected and nothing is written.
   - `createBankAccount` for an ownership account the user is not an owner member of is rejected and writes nothing.
   - Two different bank rows filing into the same pending charge (simulate the second claim returning zero rows): exactly one payment is created,
     and the second call writes nothing and returns the "just recorded" message.
   - If the payment insert fails after the claim, the charge returns to its prior status.
   - If the payment insert fails after the claim but another payment for that charge now exists, the charge stays `paid`.
   - Rent into a pending charge inserts a payment (ach, the row date) and sets the charge to paid.
   - An already-paid charge creates no payment.
   - An amount mismatch writes nothing.
   - A `no` answer writes only a skipped fingerprint.
   - `always` creates exactly one rule for a specific payee, and no rule (with `ruleSkipped: true`) for "ACH CREDIT".
   - A tampered token (changed amount or occurrence index), a token for another bank account or profile, and an expired token are all rejected,
     and nothing is written. Replaying the same valid token returns `already` and writes nothing.
   - Undo of a rent item filed from a `late` charge restores `late`; from `pending` restores `pending`. When another payment exists, the status is not changed.
   - Rent compensation: if the charge update fails, the new payment is deleted. If the `bank_transactions` insert fails, the payment is deleted
     and the charge returns to its prior status.
   - A failure of the `bank_transactions` insert removes the created expense.
   - Import never writes `ask` or `personal` rows. If row 3 of 5 auto rows fails, the response reports 2 filed plus the error, and a retry files the rest.
   - No logger, audit or Sentry call receives a description, amount, token or row object (assert on the mocks).
4. The component test:
   - The review card renders "Looks like:", "Not rental" and "Yes, that's right". The "Always do this" checkbox is checked when `ruleable`,
     and hidden when it is not.
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
