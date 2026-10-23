# Sprint 255a — Account wipe runs as ONE database transaction (all-or-nothing) (L3: deletion + schema) — rev 2 (rev 1 AWC)

## 1. Objective
Today each of the six wipe actions in `apps/web/app/actions/account-wipe.ts` sends its deletes one request at a time
(`lib/account-wipe/mutations.ts`). Sprint 253b's characterization proved that an error mid-wipe leaves a **partial
deletion** (K4/K4b). Make every wipe all-or-nothing: the app reads the scope, builds the ordered list of operations,
and sends it in **one** call to a new database function that runs them in one transaction. If anything fails, nothing
is deleted. Which rows are deleted, and in which order, must stay exactly as today.

## 2. Context
- HEAD: see `git log -1`. Files: façade `app/actions/account-wipe.ts` ("use server", six exports), `lib/account-wipe/
  scope.ts` (reads), `lib/account-wipe/mutations.ts` (writes), characterization `app/actions/__tests__/account-wipe.
  test.ts` (47 tests, literal traces `fullLog`, `propertiesLog`, … in `[table, op, filters]` form), structure test
  `lib/__tests__/account-wipe-split.test.ts`.
- **Database function (Claude writes and applies it; do not edit SQL):**
  `supabase/migrations/20261103_sprint255a_account_wipe_apply.sql` — `public.account_wipe_apply(p_ops jsonb) returns
  jsonb`, `security invoker`, `search_path = ''`, EXECUTE granted to `service_role` only. Each op:
  `{ "table": string, "kind": "delete" | "update", "label": string, "set"?: { "occupied": false },
  "filters": [ { "op": "in", "column": string, "values": string[] } | { "op": "eq", "column": string, "value": string }
  | { "op": "not_null", "column": string } ] }`. Tables/columns are allowlisted (the exact set the wipe uses today);
  every op needs an `in` or `eq` filter; the only update allowed is `units` `{ "occupied": false }`. Values are cast
  to the column's catalog type (`uuid`/`text` only), so comparisons stay typed and indexed, and an invalid uuid fails
  the whole call (22P02, same as PostgREST's cast error today). A missing table/column skips that op (same as today's
  `isMissingSchemaError` skip). Any other error raises and rolls the whole call back. Returns `{ operations, results:
  [{ label, rows } | { label, skipped: true }] }`. Limits: 500 ops, 1,000,000 bytes. Unknown JSON properties are
  ignored. Dry run on prod (rolled back, 14 cases) passed: atomic rollback, injected column/value rejected or inert,
  invalid uuid fails, payload limit, typed index plan, `authenticated`/`anon` denied, grants `service_role` only.
- **Hoisted-read parity proof (Claude, live catalog):** the four request tables and four vote tables have **no
  foreign keys** (so no cascade can reach them), **no triggers**, and the schema has **no rules**; no trigger function
  on any table deleted earlier in `fullAccountWipe` references them (catalog search of all 9 trigger functions). So no
  earlier op can remove or alter those rows, and reading their ids before any delete returns the same ids as today's
  mid-sequence reads (lines ~328–355).
- Known, out of scope here (Sprint 255b): `vendors` has no `property_id` column, so today's vendor delete is always
  skipped. Keep that op exactly as today (the function skips it).

## 3. In scope
1. `lib/account-wipe/mutations.ts`: replace the per-request writers with a **plan builder** that performs no I/O:
   `createWipePlan()` returning an object with `deleteIn(table, column, ids, label)` (skips empty `ids`, exactly like
   `deleteByIds` today), `deleteWhere(table, filters, label)` (for today's `executeMutation(admin.from(t).delete()…)`
   calls, including `.eq`, `.in` even with an empty array, and `.not(col, "is", null)` → `not_null`), `updateIn("units",
   { occupied: false }, "id", ids, label)` (skips empty `ids`), `removeStorage(bucket, paths)` (queued, skips empty),
   and `ops` / `storage` accessors. Keep `deleteDistributionRecords`, `deleteLeaseFinancials`,
   `deleteLeasingPipeline`, `deleteDocuments`, `deleteMaintenance`, `deleteAutomation` with the same order of entries,
   now taking the plan. Add `applyWipePlan(plan)`: one `createAdminClient().rpc("account_wipe_apply", { p_ops:
   plan.ops })`; classify the outcome:
   - **`database_rollback_confirmed`** — a response arrived with an `error` object (PostgREST/SQL error, including
     function missing `PGRST202`/`42883`): the transaction rolled back; throw.
   - **`rpc_result_unknown`** — the call threw, timed out, or returned neither `data` nor `error` (network/transport):
     the commit status is unknown; throw. **Never retry automatically.**
   Log each with `sideEffectError("accountWipe", <category>, { action })` (no ids or emails in logs). No fallback to
   per-op writes; after success, run the queued storage removals in order (best effort, each
   failure logged with today's `sideEffectError("accountWipe", "remove_storage_objects", { entityType: bucket })` and
   also counted under `storage_cleanup_failed`).
2. Façade: each action keeps auth, rate limit and confirmation exactly as today, then: load scope and **all** reads
   (hoist `fullAccountWipe`'s four request-id reads to right after `loadDeletionScope`), build the plan in today's
   exact order, `await applyWipePlan(plan)`, then `revalidateSettingsSurfaces()` and today's success message. The
   `catch` blocks and their user messages stay unchanged. The façade still exports exactly the six actions.
3. Nothing else may call `.delete()`/`.update()` on the admin client in these files.

## 4. Out of scope
The SQL file. Vendors/preventive-maintenance fixes (255b). Copy, UI, auth helpers, scope reads (other than hoisting
the four reads). Storage becoming transactional (it cannot; it now runs only after the DB commit).

## 5. Exact files expected to change
- `apps/web/lib/account-wipe/mutations.ts`
- `apps/web/app/actions/account-wipe.ts`
- `apps/web/app/actions/__tests__/account-wipe.test.ts`
- `apps/web/lib/__tests__/account-wipe-split.test.ts` (only where exported helper names/edges change)
- `apps/web/lib/__tests__/account-wipe-plan.test.ts` (new)

## 6. Implementation requirements
- **Order proof (primary).** Keep every existing literal trace array (`fullLog`, `propertiesLog`, the tenants,
  managers, leases and financial arrays) **byte-identical** (Claude diffs those lines against HEAD). Add one helper
  `opsToLog(ops)` that converts the RPC payload to the existing `[table, op, filters]` tuple format, and assert, per
  action: `opsToLog(rpcPayload)` equals the literal array **with its storage entries removed**, and the recorded
  storage removals equal the literal's storage entries in the same relative order (now after the RPC). Report the
  `git diff` of the literal arrays (expected empty).
- **Single call.** The fake admin client records every `from(...).delete/update` and every `rpc`. Each successful
  action: exactly one `rpc("account_wipe_apply", …)` and **zero** direct deletes/updates.
- No `expect` inside mocks (L-028). Exact copy with `toEqual`. Lines ≤ 140 characters.
- L-002: the RPC error is checked; L-028: catch blocks unchanged (no redirect inside).
- Undo: none by design (owner typed DELETE); safety is the rollback on failure.

## 7. Validation
```
cd apps/web
npx vitest run app/actions/__tests__/account-wipe.test.ts lib/__tests__/account-wipe-split.test.ts \
  lib/__tests__/account-wipe-plan.test.ts
npx tsc --noEmit
```
then from the repo root `npm run gate:web`.

## 8. Acceptance criteria
- A1 For all six actions (success path): one RPC call, zero direct writes; `opsToLog(p_ops)` equals the literal trace
  minus storage entries; storage removals equal the literal's storage entries, in order, after the RPC; success message
  and the four `revalidatePath` calls unchanged.
- A2 (rollback confirmed) RPC resolves with `{ error }` (SQL error; also `PGRST202`/`42883` function missing) → the
  action returns today's exact error object (e.g. `{ success: false, error: "Unable to complete the full account wipe
  right now." }`), **no** storage removal, **no** `revalidatePath`, zero direct writes, one `database_rollback_confirmed`
  log, and the fake DB state is unchanged.
- A2b (result unknown) RPC rejects (network error) or resolves `{ data: null, error: null }` → same user error object,
  no storage removal, no `revalidatePath`, **exactly one** RPC call (no retry), one `rpc_result_unknown` log. The test
  must not assert that nothing was deleted.
- A3 Guards (role manager/tenant, rate limit, confirmation missing/`"delete"`/`"DELETE "`) for all six actions: no RPC,
  no writes, exact error objects (keep the 253b table-driven cases).
- A4 `fullAccountWipe`: the four request-id reads happen before the RPC, and their ids appear in the vote deletes at
  the same positions as in `fullLog`.
- A5 Plan builder unit tests (`account-wipe-plan.test.ts`): `deleteIn` with `[]` adds nothing; `deleteWhere` with an
  empty `in` array keeps the op; `not_null` mapping; `updateIn` payload is exactly `{ table: "units", kind: "update",
  set: { occupied: false }, label, filters: [{ op: "in", column: "id", values }] }`; labels equal today's labels; a
  storage failure is logged and the next removal still runs.
- A6 Old K4/K4b "partial deletion" tests are replaced by A2 (state this in the report: behavior intentionally changed
  from partial to none).
- A7 Structure test still passes (façade exports exactly six; no new module imports outside the allowlist; no
  `"use server"` in `lib/account-wipe/*`).
- A8 Gate green (counts verbatim).

## 9. Report format
Compact status only: A1–A8 → test names, literal-array diff (expected empty), counts. Do NOT include 'Claude prompt'
or 'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
Stay inside §5. Do not commit. Never run a wipe against a real database. Claude applies the migration (after ChatGPT
review, dry run already done) **before** deploying this code, verifies grants and attacker SQL live, deploys, then runs
a read-only production check (owner Settings → Account & Data renders; no submit) and one live RPC call as
`service_role` with a no-op plan (ids that match nothing) to prove the function answers `{ operations: 1, rows: 0 }`.
Rollback (Claude): (1) redeploy the previous app revision; (2) confirm the production alias serves that revision
(deployment SHA) and that no request to the 255a revision's wipe actions is still in flight (Vercel logs for
`/settings` POSTs since the switch); (3) only then run `supabase/rollback/20261103_sprint255a_account_wipe_apply_
rollback.sql` (`drop function if exists public.account_wipe_apply(jsonb)`), which ChatGPT reviews with this packet.
The user should never need to read instructions to complete this flow (no UI change).
