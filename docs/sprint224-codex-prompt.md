# Sprint 224 — Bank sync: connect once, transactions flow in (L3: bank data + secrets + schema) · rev 1

The owner decided on 2026-10-12 that this comes next, ahead of partner sprints 221–223.

**Goal:** connecting a bank is Robinhood-easy. After that, the owner's rental money (Angel's rent landing at Fidelity, the solar bill leaving NFCU) shows up in Domus automatically, with no file uploads.

Design source: `docs/bank-feed-design.md` (Phase 2). Plaid stays in **sandbox** until the owner's production application is approved. This sprint must work end to end in sandbox, and switching to production must only need the `PLAID_ENV` and secret change.

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
3. **`bank_accounts` additions:**
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
   - `unique (bank_account_id, external_id)`.
   - RLS select: `is_owner_member_of_account(owner_account_id)`. No client writes.
   - Rows are **deleted** once answered: filed, or "Not rental" (which records the skip fingerprint as today).
5. **`bank_transactions`:** add `external_id text null` and a unique index on `(bank_account_id, external_id)` where not null.

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
   - **`syncTransactions(accessToken, cursor)`**: loops `/transactions/sync` until `has_more` is false. On `TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION`, restart from the original cursor. Returns `{ added, modified, removed, nextCursor }`.
   - **`removeItem(accessToken)`.**
3. **Linking** (`app/actions/bank-connections.ts`, new; AGENTS.md §3: auth → owner → active owner member of the account → zod):
   - **`startBankLink(ownerAccountId)`** → link token.
   - **`finishBankLink({ ownerAccountId, publicToken, accounts: [{ id, name, mask, subtype }] , institutionName })`.**
     - Exchange the token, encrypt it, and insert `bank_connections` + `bank_connection_secrets` + one `bank_accounts` row per selected account (`source 'plaid'`, `institution = institutionName`, `nickname = "<Account name> ••<mask>"`).
     - If an account already exists by `plaid_account_id`, re-link it to the new connection.
     - Then run the first `syncConnection`.
     - On a duplicate `plaid_item_id`, return "This bank is already connected."
   - **`startBankRelink(connectionId)`** → update-mode token. **`finishBankRelink(connectionId)`** → status `ok`, then sync.
   - **`disconnectBank(connectionId)`**: `removeItem` (log and continue if Plaid errors), then delete the connection. Its secrets cascade, review items for its accounts are deleted, and `bank_accounts.connection_id` becomes null. **Filed records are kept.**
   - **`refreshBank(connectionId)`**: rate-limited to 1 per minute per connection. It runs `syncConnection`.
4. **Pipeline refactor (no behavior change for uploads):** move the body of `importBankRows` after auth into `lib/bank-feed/process-rows.ts`:
   - `processBankRows({ admin, actorProfileId | null, bank, rows, source: 'upload' | 'sync' })`.
   - `importBankRows` keeps its auth, rate limit, response shape and tests, and calls it.
   - **For `source: 'sync'`:**
     - `actorProfileId` is null. Filing uses `created_by` = the connection's `created_by_profile_id`;
     - the per-property permission check uses that profile;
     - "ask" rows are **inserted into `bank_review_items`** (`on conflict do nothing`) instead of getting browser tokens;
     - "personal" rows are dropped.
5. **`syncConnection(connectionId)`** (`lib/bank-feed/sync.ts`):
   - Load the connection and secret, decrypt, and call `syncTransactions(cursor)`.
   - **Map Plaid rows:**
     - `amount > 0` → `out`, `< 0` → `in`, and `amountCents = round(abs(amount) * 100)`;
     - `postedOn = date`; `description = merchant_name || name` (≤ 200);
     - **skip `pending: true` rows** (they come back as posted rows);
     - match each row to its `bank_accounts` row by `plaid_account_id`, and ignore accounts that weren't selected.
   - The fingerprint uses the existing `bankFingerprint`, with `occurrenceIndex` from a stable `external_id` sort, plus `external_id` stored on `bank_transactions` and `bank_review_items`.
   - **`modified`:** if the transaction is still in the review queue, update it; filed items are left alone.
   - **`removed`:** delete the matching review item; filed items are left alone, and the removal is logged.
   - **The cursor is saved only after all rows from that sync are processed.** Processing is idempotent through the unique `(bank_account_id, external_id)` and fingerprint constraints, so a crash re-processes safely.
   - Set `last_synced_at`, `status 'ok'`, `last_error null`.
   - **Plaid errors:**
     - `ITEM_LOGIN_REQUIRED` → `needs_login`;
     - any other error → `error`, with a short `last_error`, never the token.
   - **Concurrency:** only one sync per connection at a time. Take a lease with a conditional update: `update bank_connections set sync_lease_until = now() + interval '5 minutes' where id = $1 and (sync_lease_until is null or sync_lease_until < now()) returning id`. If no row comes back, skip (another sync is running). Clear the lease when done, including on error.
6. **Webhook `app/api/webhooks/plaid/route.ts`:**
   - Verify the `Plaid-Verification` JWT: ES256, the key from `/webhook_verification_key/get` (cache by `kid`), `iat` within 5 minutes, and the body's SHA-256 equal to `request_body_sha256`. Reject with 401 otherwise.
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
3. **Upload** stays below, as "Or upload a statement file."
4. **Home "Needs you":** add "<n> bank items to check" (links to `/owner/bank`) when the queue is non-empty, as priority 2 after late rent.
5. The **old balance-only Plaid button** on the Ownership card is removed. Leave the `ownership_accounts.plaid_*` columns untouched; their cleanup is a later sprint.

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
   - (e) the first sync runs.
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
   - (j) `modified` and `removed` update or delete queued items only.
4. **Webhook:** a valid signature → sync is called; a bad signature, a stale `iat` or a body-hash mismatch → 401 and no DB call; an unknown item → 200; the ITEM error codes set the right statuses.
5. **Cron:** `CRON_SECRET` is required; only stale `ok` connections are synced; one failure doesn't stop the others.
6. **Queue:** an answer files the item and deletes the row; "Not rental" writes the skip fingerprint and deletes the row; another account's owner is rejected.
7. **Disconnect:** `itemRemove` is called; the connection and secret are gone; filed `bank_transactions`, payments and expenses remain.
8. **Upload unchanged:** the existing `importBankRows` tests pass unchanged, and a snapshot of its response shape for a fixture file is unchanged.
9. **UI:** connection statuses render with the exact copy; Connect opens Link (mocked); the queue renders persisted items; the Home row shows the count; the old Ownership-card Plaid button is gone.
10. **Migration text test:**
    - revokes happen before grants on all new tables;
    - `bank_connection_secrets` has RLS and no policies or grants;
    - select-only grants elsewhere;
    - the `institution` CHECK is a length check;
    - the unique constraints are present.
11. Lint, typecheck, the full suite and the build are green.

## 9. Report format
JSON per `docs/codex-report-schema.json`, with the test names mapped to §8. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
- Don't apply the migration, touch the live DB or call Plaid.
- No deploy, commit or push. Don't run `gate:web`.
- Don't touch `.claude/launch.json`, `apps/ios`, `apps/mobile`, `docs/`, or any "* 2.*" files.
- Don't invent copy beyond what's specified here.
