# Sprint 224 — Bank sync: connect once, transactions flow in (L3: bank data + secrets + schema) · rev 2 (ChatGPT rev 1 = REJECT; 7 REQUIRED + 4 OPTIONAL folded in)

The owner decided on 2026-10-12 that this comes next, ahead of partner sprints 221–223.

**Goal:** connecting a bank is Robinhood-easy. After that, the owner's rental money (Angel's rent landing at Fidelity, the solar bill leaving NFCU) shows up in Domus automatically, with no file uploads.

Design source: `docs/bank-feed-design.md` (Phase 2). Plaid stays in **sandbox** until the owner's production application is approved. This sprint must work end to end in sandbox. Production also needs Plaid approval, `PLAID_ENV`/secret, `PLAID_REDIRECT_URI` registered in the Plaid Dashboard for OAuth banks, and the webhook URL. Claude and the owner handle those outside this sprint.

## 1. Objective
1. **Connect:**
   - One "Connect a bank" button on `/owner/bank` opens Plaid Link.
   - The person signs in at their bank (OAuth where the bank supports it, e.g. Navy Federal) and picks one or more accounts.
   - Every selected account is saved. One ownership account may have several connections (e.g. NFCU and Fidelity).
2. **Sync:**
   - Domus pulls new transactions with Plaid `/transactions/sync` (cursor-based) right after linking, whenever Plaid's `SYNC_UPDATES_AVAILABLE` webhook arrives, when the owner taps **Refresh**, and in a daily backstop cron.
   - Synced rows go through the **existing** matching pipeline (rules, transfer pairing, rent and bill suggestions) used by CSV uploads.
3. **File or ask:**
   - Rows matched by an owner rule, or paired as transfers, are filed automatically. That's exactly what upload does today.
   - Rows that need an answer go into a **persistent review queue** that survives reloads and is answered once.
   - Personal rows aren't stored, as today.
4. **Health:** each connection shows a status: "Up to date · 2h ago", "Sign in again", or "Disconnected".
   - "Sign in again" opens Plaid Link in update mode.
   - **Disconnect** calls Plaid `itemRemove` and deletes the connection and its secrets. Filed records stay.
5. **Secrets:** Plaid access tokens are stored **encrypted**, in a table no client role can read.

## 2. Context (HEAD after 220, branch `main`; survey 2026-10-12)
- **Plaid today (Sprint 33):**
  - `lib/plaid.ts`: `createLinkToken` asks for `[Products.Auth, Products.Transactions]` (line 56), with no webhook. `exchangePublicToken`, `getAccounts`, `getBalances`.
  - `app/actions/plaid.ts`: `initiatePlaidLink`, `completePlaidLink` (it keeps only the first account, line 110), `refreshPlaidBalance`, `disconnectPlaid`. Disconnect doesn't call `itemRemove`.
  - Data is stored in plain text on `ownership_accounts.plaid_*` (`20260316_sprint33_plaid_integration.sql`).
  - The button `components/dashboard/plaid-link-button.tsx` loads Plaid's script from the CDN and passes only the first account.
  - Env: `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV` (they exist in Vercel production; default is sandbox).
  - There's no `/transactions/sync`, no Plaid webhook and no Plaid cron.
- **Bank feed (Sprints 167–169):** tables in `20261005_sprint167_bank_feed.sql`:
  - `bank_accounts` (`owner_account_id`, `institution` CHECK fidelity | navy_federal | other, `nickname`, `source` upload | plaid, `last_import_at`, unique (owner, institution, nickname));
  - `bank_rules`;
  - `bank_transactions` (unique `bank_account_id, fingerprint`; `kind`; links);
  - `bank_skipped_fingerprints`;
  - triggers enforce same-account references. Owners read only; writes go through the service role.
- **Pipeline:**
  - `app/actions/bank-feed.ts:155` `importBankRows` (behind `requireAuth("owner")`) does: fingerprint (`lib/bank-feed/fingerprint.ts`, needs `BANK_FEED_SECRET`) → `loadMatching` → `classifyRows` (`lib/bank-feed/match.ts:45`) → `fileBankItem` (`lib/bank-feed/file-item.ts:49`) for auto items, while "ask" and "personal" rows go back to the browser with signed, expiring row tokens.
  - Answers: `answerBankItem` (line 274), plus rules in `lib/bank-feed/rules.ts`. Undo: `undoBankItem`.
  - UI: `components/bank-feed/*`, page `/owner/bank`.
- **Cron pattern:** `app/api/cron/*` with `CRON_SECRET`, configured in `vercel.json`. The Stripe webhook pattern lives in `app/api/webhooks/stripe/route.ts`.
- **Lessons:**
  - Supabase default privileges grant ALL to anon and authenticated on new tables, so revoke first (219).
  - Any recreated CHECK must equal live ± the intended change (L-012). Claude diffs before applying.

## 3. In scope
### 3.1 Migration `supabase/migrations/20261014_sprint224_bank_sync.sql` (Codex writes it; Claude reviews, applies it live and runs attacker SQL)
1. **`public.bank_connections`.**
   - Columns:
     - `id uuid pk`, `owner_account_id uuid not null references ownership_accounts on delete cascade`;
     - `provider text not null default 'plaid' check (provider = 'plaid')`;
     - `plaid_item_id text not null unique`, `institution_name text not null`;
     - `status text not null default 'ok' check (status in ('ok','needs_login','revoked','error'))`;
     - `last_synced_at timestamptz`, `last_error text` (check length ≤ 200), `sync_lease_until timestamptz null`;
     - `created_by_profile_id uuid not null references profiles`, `created_at`.
   - RLS select: `is_owner_member_of_account(owner_account_id)`.
   - No client writes: `revoke all … from anon, authenticated; grant select … to authenticated`.
2. **`public.bank_connection_secrets`.**
   - Columns: `connection_id uuid pk references bank_connections on delete cascade`, `access_token_ciphertext text not null`, `transactions_cursor text`, `updated_at`.
   - RLS enabled with **no policies**, and `revoke all from anon, authenticated`. It's readable only by the service role.
3. **`bank_accounts` additions** (plus `unique (id, owner_account_id)` so other tables can reference both):
   - `connection_id uuid null references bank_connections on delete set null`;
   - `plaid_account_id text null unique`, `mask text null check (length ≤ 4)`, `account_subtype text null`.
   - Recreate the `institution` CHECK as a length check `length(trim(institution)) between 1 and 80`, so any bank name works. Existing values remain valid.
4. **`public.bank_review_items`** (the persistent queue):
   - `id uuid pk`;
   - `owner_account_id`, `bank_account_id uuid not null references bank_accounts on delete cascade`;
   - `external_id text not null` (the Plaid `transaction_id`);
   - `fingerprint text not null`;
   - `posted_on date not null`, `amount_cents integer not null check (> 0)`, `direction text check in ('in','out')`, `description text check length ≤ 200`;
   - `suggestion jsonb null`;
   - `created_at`;
   - `unique (bank_account_id, external_id)`;
   - **composite FK `(bank_account_id, owner_account_id)` → `bank_accounts(id, owner_account_id)` on delete cascade**, so a queue row can never point at another account's bank.
   - RLS select: `is_owner_member_of_account(owner_account_id)`. No client writes.
   - Rows are **deleted** once answered: filed, or "Not rental" (which records the skip fingerprint as today).
5. **`bank_transactions`:**
   - add `external_id text null` and a unique index on `(bank_account_id, external_id)` where not null;
   - add `bank_change text null check (bank_change in ('modified','removed'))` and `bank_change_at timestamptz null`: the persistent "Bank changed this" state.
6. **Service-role-only RPCs** (each `SECURITY DEFINER`, `set search_path = ''`, schema-qualified; `revoke all … from public, anon, authenticated; grant execute … to service_role`):
   - **`public.create_bank_connection(p_owner_account_id, p_plaid_item_id, p_institution_name, p_ciphertext, p_actor_profile_id, p_accounts jsonb) returns uuid`.** One transaction: insert the connection, the secret, and one `bank_accounts` row per account (`source 'plaid'`). An existing `plaid_account_id` is re-linked only if it belongs to the same `owner_account_id`; otherwise raise.
   - **`public.file_synced_bank_item(p jsonb) returns text`.** Returns `'filed' | 'already' | 'stale'`. **One transaction** covering:
     1. `insert into bank_transactions (… external_id, fingerprint …) on conflict do nothing`. A conflict on `(bank_account_id, external_id)` or `(bank_account_id, fingerprint)` returns `'already'` with **no side effects**.
     2. Then exactly one side effect:
        - **expense:** insert `property_expenses` and set `expense_id`;
        - **rent:** conditional `update rent_charges set status='paid' where id = … and status in ('pending','late') and amount_cents = p.amount`, then insert the `payments` row and set `payment_id`, `prior_charge_status`. If the charge was already paid, just link it, with `created_record=false`. If the update matches 0 rows for any other reason, return `'stale'`, and the item goes to the review queue;
        - **transfer:** nothing extra.
     3. Validate inside the function that the property belongs to `p.owner_account_id`, and that the bank account belongs to the same owner account.
   - **`public.disconnect_bank_connection(p_connection_id) returns void`.** One transaction: delete `bank_review_items` for the connection's accounts, null `bank_accounts.connection_id`, and delete the connection (the secret cascades).

### 3.2 Server
1. **Encryption** (`lib/bank-feed/token-crypto.ts`): AES-256-GCM with the key from `BANK_TOKEN_KEY` (32 bytes base64). Random 12-byte IV, stored as `v1:<iv>:<tag>:<ciphertext>` (base64).
   - If the key is missing, fail closed with "Bank connection is not set up yet."
   - Never log tokens.
   - Claude sets `BANK_TOKEN_KEY` in Vercel.
2. **`lib/plaid.ts`:**
   - **`createLinkToken({ userId, mode: 'create' | 'update', accessToken? })`.**
     - Products: `[Transactions]` only (drop Auth).
     - `webhook: ${APP_URL}/api/webhooks/plaid`, `transactions: { days_requested: 90 }`, `account_filters`: depository (checking, savings, cash management).
     - Update mode passes `access_token` and no products.
     - Add `redirect_uri` from `PLAID_REDIRECT_URI` when set (needed for OAuth banks in production).
   - **`syncTransactions(accessToken, cursor)`**: loops `/transactions/sync` until `has_more` is false. On `TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION`, restart from the original cursor. Returns `{ added, modified, removed, nextCursor }`. On restart it **discards all accumulated arrays** and starts again from the original cursor.
   - **`removeItem(accessToken)`.**
3. **Linking** (`app/actions/bank-connections.ts`, new; AGENTS.md §3: auth → owner → active owner member of the account → zod):
   - **`startBankLink(ownerAccountId)`** → link token.
   - **`finishBankLink({ ownerAccountId, publicToken, selectedAccountIds: string[] })`.** The client sends **only** the public token and the selected account IDs.
     - The server exchanges the token, then fetches **authoritative** data: `/accounts/get` for name, mask and subtype, and `/item/get` + `/institutions/get_by_id` for the institution name.
     - Every selected ID must belong to that item. Otherwise reject.
     - Encrypt the token and call `create_bank_connection` (atomic), with `nickname = "<Account name> ••<mask>"`.
     - If the RPC fails, call `removeItem` (compensation) so no orphan Plaid item or token remains.
     - Then run the first `syncConnection`.
     - On a duplicate `plaid_item_id`, return "This bank is already connected."
   - **`startBankRelink(connectionId)`** → update-mode token. **`finishBankRelink(connectionId)`** → status `ok`, then sync.
   - **`disconnectBank(connectionId)`**: first set the status to `revoked` (so it never shows as healthy), then call `removeItem` (log and continue if Plaid errors), then call `disconnect_bank_connection`. If the local step fails, the connection stays `revoked`, shows "Disconnected", and offers **Disconnect** again to retry the cleanup. **Filed records are kept.**
   - **`refreshBank(connectionId)`**: rate-limited to 1 per minute per connection. It runs `syncConnection`.
4. **Pipeline refactor (no behavior change for uploads):** move the body of `importBankRows` after auth into `lib/bank-feed/process-rows.ts`:
   - `processBankRows({ admin, actorProfileId | null, bank, rows, source: 'upload' | 'sync' })`.
   - `importBankRows` keeps its auth, rate limit, response shape and tests, and calls it.
   - **For `source: 'sync'`:**
     - **Authority is the connection's current `owner_account_id`**, not a person. A property is allowed only if `properties.owner_account_id = connection.owner_account_id`. The audit `created_by` on new expenses is the connection's `created_by_profile_id` if that person is still an active owner member; otherwise the earliest-joined active owner member of the account. If there's none, the row is queued, not filed;
     - filing goes **only** through `file_synced_bank_item` (atomic). The upload path keeps `fileBankItem` unchanged;
     - "ask" rows are **inserted into `bank_review_items`** (`on conflict do nothing`) instead of getting browser tokens;
     - "personal" rows are dropped.
5. **`syncConnection(connectionId)`** (`lib/bank-feed/sync.ts`):
   - Load the connection and secret, decrypt, and call `syncTransactions(cursor)`.
   - **Map Plaid rows:**
     - `amount > 0` → `out`, `< 0` → `in`, and `amountCents = round(abs(amount) * 100)`;
     - `postedOn = date`; `description = merchant_name || name` (≤ 200);
     - **skip `pending: true` rows** (they come back as posted rows);
     - match each row to its `bank_accounts` row by `plaid_account_id`, and ignore accounts that weren't selected.
   - **Identity:** for synced rows, `fingerprint = HMAC(BANK_FEED_SECRET, "plaid:" + bank_account_id + ":" + transaction_id)`, independent of batch or pagination. `external_id` = the Plaid `transaction_id`. **Cross-source check:** before filing a synced row, also compute the CSV-style fingerprint (`occurrenceIndex 0`). If a `bank_transactions` row with that fingerprint exists for the same bank account (an earlier CSV upload), treat the row as `already`. CSV fingerprints are unchanged.
   - **`modified`:** if the transaction is still queued, update it. If it was filed (a `bank_transactions` row with that `external_id`) and the amount, date or direction changed, set `bank_change='modified'`. Records aren't rewritten silently.
   - **`removed`:** delete the queued item. If it was filed, set `bank_change='removed'`.
   - Flagged items appear in **"Bank changed this"** (see the UI) until the owner chooses **Keep as is** (clears the flag) or **Undo** (the existing undo path, then clears it).
   - **The cursor is saved only after all rows from that sync are processed.** Processing is idempotent through the unique `(bank_account_id, external_id)` and fingerprint constraints, so a crash re-processes safely.
   - Set `last_synced_at`, `status 'ok'`, `last_error null`.
   - **Plaid errors:**
     - `ITEM_LOGIN_REQUIRED` → `needs_login`;
     - any other error → `error`. `last_error` comes **only from an allowlist**: the Plaid `error_code` (`/^[A-Z_]{3,60}$/`), or `"SYNC_FAILED"`. Never free text, tokens or PII.
   - **Concurrency:** only one sync per connection at a time. Take a lease with a conditional update: `update bank_connections set sync_lease_until = now() + interval '5 minutes' where id = $1 and (sync_lease_until is null or sync_lease_until < now()) returning id`. If no row comes back, skip (another sync is running). Clear the lease when done, including on error.
6. **Webhook `app/api/webhooks/plaid/route.ts`:**
   - Read the **raw body text** first, then verify the `Plaid-Verification` JWT before parsing JSON or touching the DB:
     - the header `alg === "ES256"`, otherwise 401;
     - `kid` is present;
     - the key comes from `/webhook_verification_key/get` (cache by `kid`), and the key's `expired_at` is null or in the future;
     - the signature verifies (use the `jose` package if it's already a dependency, otherwise Node `crypto` with JWK);
     - `iat` is within 5 minutes;
     - SHA-256 of the exact raw body equals `request_body_sha256`, compared with `crypto.timingSafeEqual`.
   - Reject with 401 otherwise.
   - Handle:
     - `TRANSACTIONS:SYNC_UPDATES_AVAILABLE` → `syncConnection` for that `item_id`;
     - `ITEM:ERROR` with `ITEM_LOGIN_REQUIRED`, `ITEM:PENDING_EXPIRATION`, `ITEM:PENDING_DISCONNECT` → `needs_login`;
     - `ITEM:USER_PERMISSION_REVOKED` → `revoked`.
   - Always 200 for unknown types. Unknown `item_id` → 200 and a log line.
7. **Cron `app/api/cron/bank-sync/route.ts`** (daily, `CRON_SECRET`, added to `vercel.json`): sync every connection with status `ok` whose `last_synced_at` is older than 12 hours. Process them sequentially; a failure in one doesn't stop the rest.
8. **Review queue actions:**
   - `answerQueuedBankItem({ itemId, decision, choice?, always? })` uses the same choices, rules and filing as `answerBankItem`.
   - Authorize by the item's canonical `owner_account_id` plus the existing property permission.
   - On success, delete the review item. "Not rental" writes the skip fingerprint.

### 3.3 UI (`/owner/bank`, Wallet look, phone first)
1. **Top card, "Your banks":**
   - Each connection shows the bank name, its accounts (`name ••1234`), and the status line: "Up to date · <relative time>", "Sign in again" (button), or "Something went wrong. Try again." (button).
   - Each has **Refresh** and, in a ⋯ menu, **Disconnect** (confirm: "Disconnect <bank>? Items already filed stay in Domus.").
   - The primary button is **Connect a bank**. Plaid Link opens in place.
   - Load Plaid's script as today, or use `react-plaid-link` if it's already a dependency; don't add a new dependency otherwise.
2. **"Money to check" list:** persisted `bank_review_items`, newest first, using the existing review-card UI (Yes / Not rental / Always). Answering one removes it.
3. **"Bank changed this" list:** filed items with `bank_change` set. Each shows the item, "The bank changed this after it was filed." or "The bank removed this after it was filed.", and the buttons **Keep as is** and **Undo**. Include its count in the Home "Needs you" bank row.
4. **Upload** stays below, as "Or upload a statement file."
5. **Home "Needs you":** add "<n> bank items to check" (links to `/owner/bank`) when the queue is non-empty, as priority 2 after late rent.
6. The **old balance-only Plaid button** on the Ownership card is removed. Leave the `ownership_accounts.plaid_*` columns untouched; their cleanup is a later sprint.

## 4. Out of scope
- `/transactions/refresh` (paid add-on).
- Investment holdings and balances display.
- Stripe Connect payouts.
- Moving existing CSV-imported rows.
- Dropping `ownership_accounts.plaid_*`.
- Terms/Privacy text (tracked separately).
- Managers connecting banks (owners only).
- Production approval (owner action).

## 5. Exact files expected to change
- `supabase/migrations/20261014_sprint224_bank_sync.sql` (new)
- `apps/web/lib/plaid.ts`
- `apps/web/lib/bank-feed/token-crypto.ts`, `process-rows.ts`, `sync.ts` (new)
- `apps/web/app/actions/bank-feed.ts` (refactor to `process-rows`, plus `answerQueuedBankItem`)
- `apps/web/app/actions/bank-connections.ts` (new)
- `apps/web/app/actions/plaid.ts` (remove or route the old link actions)
- `apps/web/app/api/webhooks/plaid/route.ts`, `apps/web/app/api/cron/bank-sync/route.ts` (new), `vercel.json`
- `apps/web/components/bank-feed/bank-connections-card.tsx`, `queued-review-list.tsx` (new), `page-shell.tsx`
- `apps/web/components/dashboard/plaid-link-button.tsx` (reuse it, or replace it), `components/dashboard/ownership/account-card.tsx` (remove the old button)
- `apps/web/components/dashboard/owner-home/needs-you-list.tsx`, `lib/owner-wallet-home.ts` (the queue count)
- Tests for all of the above. List any other file you touch, with the reason.

## 6. Implementation requirements
- Lines ≤ 140 characters; new files ≤ 200 lines; no file over 500 lines.
- Check every Supabase error. No query inside a loop, except the per-connection cron loop and Plaid pagination.
- Server actions follow AGENTS.md §3.
- Never log, return or send an access token, a public token or a decrypted value to the client.
- The webhook route must not require a session, and must verify the signature before any DB work.
- Copy, exactly:
  - "Your banks"
  - "Connect a bank"
  - "Up to date · <time>"
  - "Sign in again"
  - "Something went wrong. Try again."
  - "Refresh"
  - "Disconnect"
  - "Disconnect <bank>? Items already filed stay in Domus."
  - "This bank is already connected."
  - "Bank connection is not set up yet."
  - "Money to check"
  - "Or upload a statement file."
  - "<n> bank items to check"
  - "Bank changed this"
  - "The bank changed this after it was filed."
  - "The bank removed this after it was filed."
  - "Keep as is"
  - "Undo"
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory. If the user needs to think about what to do, the UI needs to be clearer.
- **Invariants:**
  - CSV upload behaves exactly as today (all existing bank-feed tests pass unchanged);
  - personal transactions are never stored;
  - a transaction is filed at most once;
  - the cursor only advances after its rows are persisted.

## 7. Validation commands to run
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- `cd apps/web && npx vitest run`
- `npm run build --workspace @domus/web`
- Run `rm -rf apps/web/.next` first if tsc reports " 2" files.
- Don't apply the migration, call Plaid, or run `gate:web`.

## 8. Acceptance criteria (binary; each one needs a named test that calls real code, with Plaid mocked at the SDK boundary)
1. **Crypto:** encrypt then decrypt round-trips; tampering with the tag fails; a missing key fails closed with the exact copy; ciphertexts differ for the same input.
2. **Link:**
   - (a) `finishBankLink` saves one connection and **N** accounts for N selected accounts;
   - (b) the secret is stored encrypted, never plaintext (assert the stored value starts with `v1:` and doesn't contain the token);
   - (c) a duplicate item → the exact copy;
   - (d) a non-member, a manager or a tenant is rejected;
   - (e) the first sync runs;
   - (f) client-supplied names, masks or institution are ignored, and the stored values come from `/accounts/get` and `/institutions/get_by_id`;
   - (g) a selected ID not in the item → rejected;
   - (h) if the RPC fails → `removeItem` is called and no rows remain.
3. **Sync:**
   - (a) Plaid sign mapping and cents rounding;
   - (b) pending rows are skipped;
   - (c) rule matches and transfers are filed through `fileBankItem`;
   - (d) "ask" rows land in `bank_review_items`; personal rows aren't stored;
   - (e) running the same page twice files nothing twice and doesn't duplicate queue rows;
   - (f) the cursor is saved only after processing (a simulated failure mid-page keeps the old cursor);
   - (g) mutation during pagination restarts;
   - (h) `ITEM_LOGIN_REQUIRED` → `needs_login`;
   - (i) the lease prevents two concurrent syncs;
   - (j) `modified` and `removed` update or delete queued items, and **flag filed items** (`bank_change`), with no silent rewrite;
   - (k) **crash replay:** `file_synced_bank_item` is mocked to throw after the DB commit. A retry with the old cursor returns `'already'`, and no second expense or payment is created (Claude proves atomicity with live SQL);
   - (l) two identical-looking transactions with different `transaction_id`s in separate syncs are both processed (no fingerprint collision);
   - (m) a row already imported by CSV is treated as `already`;
   - (n) system authority: a property in another owner account is never filed; a departed creator falls back to another active owner member; with no active member, the row is queued;
   - (o) a sync failure → `last_error` is an allowlisted code only.
4. **Webhook:** a valid signature → sync is called; each of a bad signature, a stale `iat`, a body-hash mismatch, a wrong `alg`, a missing `kid`, and an expired verification key → 401 with **no DB call**; the hash is computed on the raw body (a whitespace-altered body fails); an unknown item → 200; the ITEM error codes set the right statuses.
5. **Cron:** `CRON_SECRET` is required; only stale `ok` connections are synced; one failure doesn't stop the others.
6. **Queue:** an answer files the item and deletes the row; "Not rental" writes the skip fingerprint and deletes the row; another account's owner is rejected.
7. **Disconnect:** the status becomes `revoked` first; `itemRemove` is called; `disconnect_bank_connection` removes the connection, the secret and the queue rows; filed records remain. If the local step fails, the status stays `revoked` and a retry succeeds.
7b. **"Bank changed this":** Keep clears the flag; Undo runs the existing undo and clears it; the count shows in Home.
8. **Upload unchanged:** the existing `importBankRows` tests pass unchanged, and a snapshot of its response shape for a fixture file is unchanged.
9. **UI:** connection statuses render with the exact copy; Connect opens Link (mocked); the queue renders persisted items; the Home row shows the count; the old Ownership-card Plaid button is gone.
10. **Migration text test:**
    - revokes happen before grants on all new tables;
    - `bank_connection_secrets` has RLS and no policies or grants;
    - select-only grants elsewhere;
    - the `institution` CHECK is a length check;
    - the unique constraints are present;
    - the composite FK on `bank_review_items`;
    - the 3 RPCs are SECURITY DEFINER with `search_path = ''` and granted to service_role only.

**Claude will also run live SQL (rolled back)** proving:
- `file_synced_bank_item` replays return `'already'` with no duplicate expense or payment;
- a cross-account property, or a cross-account bank account, is rejected;
- a queue row can't reference another account's bank;
- authenticated users can't read secrets or execute the RPCs;
- anon sees nothing.
11. Lint, typecheck, the full suite and the build are green.

## 9. Report format
JSON per `docs/codex-report-schema.json`, with the test names mapped to §8. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
- Don't apply the migration, touch the live DB or call Plaid.
- No deploy, commit or push. Don't run `gate:web`.
- Don't touch `.claude/launch.json`, `apps/ios`, `apps/mobile`, `docs/`, or any "* 2.*" files.
- Don't invent copy beyond what's specified here.
