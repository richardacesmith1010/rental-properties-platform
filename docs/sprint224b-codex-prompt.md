# Sprint 224b — Bank sync: fill the test gaps + 3 fixes (L3 follow-up to 224) · rev 1

## 1. Objective
Sprint 224's code is in the working tree (uncommitted). Claude's review mapped `docs/sprint224-codex-prompt.md` §8 to the tests and found many items **MISSING** or **WEAK**. In particular, `bank-sync-worker.test.ts` mocks both `syncTransactions` and `processBankRows` with empty arrays, so `lib/bank-feed/sync.ts` row handling is effectively untested.

Write real tests for every item below, and make the 3 code fixes. Keep everything else unchanged.

## 2. Context
- HEAD `587b030`, plus the uncommitted 224 work. Don't revert anything.
- Test files from 224 live under `apps/web/lib/__tests__/bank-*.test.ts` and `apps/web/components/__tests__/bank-sync-ui.test.tsx`. There's a fake admin helper in `bank-feed-test-admin.ts`.
- **The fake admin ignores `.eq` / `.in` / `.or` filters.** Extend it, or use a query-recording mock, so tests can assert the filters themselves (status guards, the cron selection).

## 3. In scope
### 3.1 Code fixes
1. **Cron retry gap:** `app/api/cron/bank-sync/route.ts` selects only `status = 'ok'`. Select `status in ('ok','error')` where `last_synced_at` is null or older than 12 hours, so a failed first sync is retried.
2. **Confirm conflict mapping:** `confirm_bank_account_links` raises `'conflict'` (P0001). Make `confirmBankLinks` map it robustly: match the PostgREST error by `code === 'P0001'` and the message containing "conflict", to the copy "This bank was already set up. Refresh to see it." Any other error gives the generic failure.
3. **Sync worker testability:** if needed, split `sync.ts` so the row mapping, the pending filter, modified/removed handling, actor selection and the error mapping are exported pure or helper functions that can be tested directly. Keep behavior identical.

### 3.2 Tests to add or strengthen (each one is a named test that calls the real code)
- **3a:** Plaid sign mapping (`amount > 0` → out, `< 0` → in) and cents rounding (e.g. 12.345 → 1235, −0.1 → 10 in).
- **3b:** `pending: true` rows are skipped.
- **3c (parity):** for the same row and choice, the payload built for `file_synced_bank_item` carries the same category, description format (`label · first 80 chars`), amount, date, nickname, `matched_by` and `rule_id` that `fileBankItem` would use. Cover these cases: expense, rent with a pending charge, rent with an already-paid charge, and transfer.
- **3e:** replaying the same page twice creates no second queue row: the insert uses on-conflict-do-nothing, and the count stays at 1.
- **3f:** a failure partway through processing a page keeps the old cursor (`save_bank_sync_cursor` is not called).
- **3h:** the sync path maps a Plaid `ITEM_LOGIN_REQUIRED` error to `needs_login`.
- **3j:**
  - a `modified` row that's queued → the queue row is updated, with a new fingerprint and `updated_at`;
  - a `modified` row that was filed with changed amount, date or direction → `bank_change = 'modified'`;
  - a `removed` row that's queued → the queue row is deleted;
  - a `removed` row that was filed → `bank_change = 'removed'`;
  - in no case is the payment or expense rewritten.
- **3k:** `file_synced_bank_item` is mocked to throw after commit; a retry with the old cursor gets `'already'`, and no second filing call happens.
- **3l:** two same-looking rows with different `transaction_id`s in **separate** sync runs are both processed.
- **3m:** a CSV-lookalike row is not skipped either (no skip fingerprint is written); two genuinely identical rows with different IDs are both kept.
- **3n:** a property in another owner account is never filed (it's queued); a departed creator falls back to the earliest active owner member; with no active owner member, the row is queued.
- **3o:** `last_error` holds only an allowlisted code (`/^[A-Z_]{3,60}$/` or `SYNC_FAILED`), never message text.
- **3p0:** retries that run out set status `error`; the 50-page cap stops the loop.
- **3p1:** losing the lease during processing (the `onProgress` heartbeat) aborts without saving the cursor.
- **3q:** the sync status update is filtered by `status in ('ok','error')` and by the lease token. Assert the recorded filters.
- **5:** cron selects `status in ('ok','error')` with the null-or-stale `last_synced_at` filter. Assert the recorded filters.
- **6b0:**
  - cron and `refreshBank` skip a `pending_account_match` connection;
  - `confirmBankLinks` with a P0001 conflict → the exact copy, and no sync is started.
- **6b:**
  - `confirmBankLinks` with real pairs → the RPC receives them, and afterwards sync targets the upload account's `bank_account_id`;
  - statement-then-connect: a CSV-filed row plus a synced row for the same transaction on the linked account → queued as a possible duplicate, never filed twice;
  - "No, it's new" → no cross-account dedupe;
  - a mismatched institution isn't offered as a match option.
- **2d:** a manager and a tenant are rejected by both `startBankLink` and `finishBankLink`.
- **7:** a retry after a local-delete failure succeeds.
- **7b:**
  - `keepBankChange` clears the flag;
  - flagged Undo goes through `undoBankItem` (assert it's called, and an auto-created rule is reversed exactly as `undoBankItem` does today), then the flag clears;
  - another account's owner is rejected.
- **7c:**
  - the same `SYNC_UPDATES_AVAILABLE` delivered twice → the second sync is skipped by the lease or files nothing new;
  - repeated ITEM errors use the conditional update `where status <> 'revoked'`. Assert the filter.
- **8:** a response-shape snapshot of `importBankRows` for a small fixture CSV (an inline snapshot).
- **9:** the Ownership `account-card` no longer renders any Plaid link button.
- **10 (migration text test):**
  - for each new table, `revoke all` appears **before** that table's `grant`;
  - no `grant insert`, `update` or `delete` to authenticated on any new table;
  - the uniques on `plaid_item_id`, `plaid_account_id` and `(id, owner_account_id)` exist;
  - every function's revoke list includes public, anon and authenticated, and its only grant is to `service_role`;
  - `_file_bank_choice` is SECURITY DEFINER with `search_path = ''`, and has no grant.

## 4. Out of scope
- Any behavior change beyond the 3 fixes.
- The migration's SQL logic (Claude reviews and applies it). Only add the text tests.
- The UI design.

## 5. Exact files expected to change
- `apps/web/app/api/cron/bank-sync/route.ts`
- `apps/web/app/actions/bank-connections.ts` (the confirm mapping)
- `apps/web/lib/bank-feed/sync.ts` (testability split only)
- `apps/web/lib/__tests__/bank-*.test.ts`, `apps/web/lib/__tests__/bank-feed-test-admin.ts`
- `apps/web/components/__tests__/bank-sync-ui.test.tsx`
- New test files if clearer, named `apps/web/lib/__tests__/bank-sync-*.test.ts`.

## 6. Implementation requirements
- Lines ≤ 140 characters; files ≤ 500 lines.
- Tests must call the real code, with Plaid and Supabase mocked only at the boundary. No tautologies (no asserting a mock equals its own input).
- Name each test with its §3.2 id (e.g. `"3j modified filed row sets bank_change"`).
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory.

## 7. Validation commands to run
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- `cd apps/web && npx vitest run`
- `npm run build --workspace @domus/web`

## 8. Acceptance criteria
1. Every §3.2 id has at least one named test that calls real code with a meaningful assertion. The report lists each id with its test name.
2. The 3 code fixes are in place, each with a test.
3. All pre-existing tests pass unchanged; lint, typecheck and the build are green.

## 9. Report format
JSON per `docs/codex-report-schema.json`, with the id → test name map. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
- No DB access, Plaid calls, deploy, commit or push. Don't run `gate:web`.
- Don't touch `.claude/launch.json`, `apps/ios`, `apps/mobile`, `docs/`, or "* 2.*" files.
