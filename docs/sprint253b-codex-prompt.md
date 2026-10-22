# Sprint 253b — Code health: characterize, then split `app/actions/account-wipe.ts` (780 lines) (L3: deletion) — rev 1

## 1. Objective
`apps/web/app/actions/account-wipe.ts` is 780 lines (limit 500) and has **no tests**. It permanently deletes an owner's
data. First add a characterization suite that pins exactly what each of the six actions deletes, in order. Then split the
private helpers into `server-only` modules with **verbatim moves only — no behavior change**. The six server actions keep
their names, signatures and file (`app/actions/account-wipe.ts`, re-exported by `app/actions/index.ts:36-42`).

## 2. Context
- HEAD: see `git log -1`. Same approved pattern as Sprint 253a (stripe-webhook split) and Sprints 190/232.
- File map (line → symbol): 15 `interface DeletionScope`; 41 `interface AuthContext`; 46 `type WipeAuthResult`;
  48 `unique`; 52 `requireOwnerForWipe`; 65 `requireDeleteConfirmation`; 73 `selectRows`; 87 `executeMutation`;
  97 `deleteByIds`; 110 `updateByIds`; 124 `removeStorageObjects`; 138 `loadNotificationIdsForEntity`;
  158 `loadDeletionScope` (to 395); 397 `deleteDistributionRecords`; 402 `deleteLeaseFinancials`; 409
  `deleteLeasingPipeline`; 416 `deleteDocuments`; 429 `deleteMaintenance`; 444 `deleteAutomation`; 449
  `revalidateSettingsSurfaces`; exported actions 456 `deleteAllProperties`, 499 `deleteAllTenants`, 581
  `deleteAllManagers`, 615 `deleteAllLeases`, 651 `deleteAllFinancialData`, 679 `fullAccountWipe`.
- The file starts with `"use server"`. **Every export of a `"use server"` file becomes a callable server endpoint.** The
  moved helpers (`deleteByIds`, `updateByIds`, `executeMutation`, …) use the service-role admin client with no auth
  check, so they must never be exported from any `"use server"` file. This is the main risk of the sprint.
- Importers: `app/actions/index.ts` (re-exports the six); `app/settings/page.tsx` (uses them via forms).
- Two lines in the file are already longer than 140 characters (pre-existing; exempt, see §6 step 4).

## 3. In scope
1. **Characterization suite first** — `apps/web/app/actions/__tests__/account-wipe.test.ts` (new), written and passing
   against the **unchanged** file before any move (§6 step 2).
2. New folder `apps/web/lib/account-wipe/`, each file's first statement `import "server-only";`, no `"use server"` or
   `"use client"` anywhere:
   - `scope.ts` — `DeletionScope` (exported), `unique`, `selectRows`, `loadNotificationIdsForEntity`, `loadDeletionScope`.
   - `mutations.ts` — `executeMutation`, `deleteByIds`, `updateByIds`, `removeStorageObjects`,
     `deleteDistributionRecords`, `deleteLeaseFinancials`, `deleteLeasingPipeline`, `deleteDocuments`,
     `deleteMaintenance`, `deleteAutomation`.
3. `app/actions/account-wipe.ts` keeps `"use server"`, its imports, `AuthContext`, `WipeAuthResult`,
   `requireOwnerForWipe`, `requireDeleteConfirmation`, `revalidateSettingsSurfaces` (all still **not** exported) and the
   six exported actions. It exports exactly those six async functions and nothing else (no `export *`, no re-export of
   a helper or type).
4. Moved symbols gain `export` and nothing else. **Allowed import edges (allowlist):** `mutations → scope` (type
   `DeletionScope` only, `import type`); façade `account-wipe.ts → scope, mutations`. `scope` imports neither new
   module. Nothing outside `lib/account-wipe/`, the façade and tests imports `lib/account-wipe/*`.

## 4. Out of scope
Any logic, query, table, column, order of deletes, error string, log tag, success/error message, rate limit or auth
change. Adding `unstable_rethrow` or any other fix (record ideas in the report only). `app/actions/index.ts`,
`app/settings/page.tsx`. Renaming anything. The other large files.

## 5. Exact files expected to change
- `apps/web/app/actions/account-wipe.ts`
- `apps/web/lib/account-wipe/scope.ts`, `apps/web/lib/account-wipe/mutations.ts` (new)
- `apps/web/app/actions/__tests__/account-wipe.test.ts` (new: characterization, §8 K1–K5)
- `apps/web/lib/__tests__/account-wipe-split.test.ts` (new: structure, §8 K7)
- `apps/web/scripts/verify-account-wipe-split.mjs` (new, dev-only proof script)
- `apps/web/lib/plain-language/exceptions.json` — **paths only**, and only if the plain-language guard requires it for a
  moved string (report each changed entry; if a string would need a *new* exception, stop and report instead).

## 6. Implementation requirements
Do these in order.
1. **Baseline.** Record `BASE=$(git rev-parse HEAD)`; confirm `git diff --quiet $BASE -- apps/web/app/actions/account-wipe.ts`.
   Use that one SHA for every comparison below and print it in the report.
2. **Characterization suite (before any move).** Mock `@/lib/supabase/admin` with a recording fake admin client:
   every `from(table)` chain records `{ table, op: "select"|"delete"|"update", filters: [[method, column, value]…],
   values? }` in call order when awaited; `storage.from(bucket).remove(paths)` records `{ bucket, remove: paths }`.
   Selects return fixture rows keyed by table so `loadDeletionScope` produces a scope where **every** id array and both
   file arrays are non-empty (distinct ids per table, e.g. `"lease-1"`). Mock `./auth-helpers` (`requireAuth`),
   `@/lib/rate-limit`, `@/lib/property-access`, `next/cache` (`revalidatePath`) and `@/lib/logger`. Shared helpers:
   `mutationLog()` (deletes/updates/storage removals only, in order) and `expectNoWrites()` (no delete, update,
   storage removal, RPC or `revalidatePath` call). No `expect` inside mock implementations (L-028). Assert with
   `toEqual` on literal arrays written in the test (no generated snapshot files). Run it against the unchanged file and
   record the pass count.
3. **Move verbatim.** Cut each block character for character; add only `export` and the imports each file needs.
   No reformatting, renaming, reordering inside a block, or comment edits. Import order inside the façade may change.
4. **Proof script** `verify-account-wipe-split.mjs`: reads `git show $BASE:apps/web/app/actions/account-wipe.ts`,
   extracts every top-level symbol block by name, extracts the same names from the three new/changed files, strips only
   a leading `export ` added by this sprint, and asserts byte-identical text per symbol (`OK <symbol>` / `DIFF
   <symbol>`), including the six action bodies and the private auth helpers left in the façade. It also asserts the
   façade's non-import text equals BASE minus the moved blocks. **Long lines:** list every line in moved blocks already
   > 140 characters at BASE; those stay verbatim (exempt, listed in the report); every *new* line ≤ 140 characters.
5. **Declarations.** Emit `.d.ts` for the façade at BASE and after the move (TypeScript compiler API or
   `tsc --declaration --emitDeclarationOnly`); the six exported declarations must be identical (diff expected empty),
   and the façade's export list must be exactly the six names.
6. Each file ≤ 500 lines.

## 7. Validation
```
cd apps/web
npx vitest run app/actions/__tests__/account-wipe.test.ts lib/__tests__/account-wipe-split.test.ts
npx vitest run lib/__tests__/plain-language.test.ts
node scripts/verify-account-wipe-split.mjs
npx tsc --noEmit
```
then from the repo root `npm run lint:web` and `npm run build:web` (Claude runs `npm run gate:web`).

## 8. Acceptance criteria
- K1 `fullAccountWipe` with confirmation `"DELETE"` as an owner: `mutationLog()` equals the **complete literal ordered
  list** of every delete/update/storage removal (table, filter method, column, ids or value) and the result is
  `{ success: true, message: "Your Domus account data has been wiped." }`; `revalidatePath` called with `/settings`,
  `/owner`, `/manager`, `/tenant`.
- K2 Each of `deleteAllProperties`, `deleteAllTenants`, `deleteAllManagers`, `deleteAllLeases`,
  `deleteAllFinancialData`: the complete literal ordered `mutationLog()` and the exact success message from the source.
  `deleteAllProperties` must show `document_templates` is **not** deleted; `fullAccountWipe` must show it is.
- K3 Guards, each with `expectNoWrites()` and the exact error object: role `manager` and role `tenant` →
  `{ success: false, error: "Only owners can perform this action." }`; rate limit denied →
  `"Too many requests. Please try again later."`; confirmation missing, `"delete"` and `"DELETE "` →
  `'Type "DELETE" to confirm this action.'`. Run for all six actions (table-driven).
- K4 A mutation error (non-missing-schema) on the first delete → the action's exact error message from the source (e.g.
  `"Unable to complete the full account wipe right now."`) and **no later** mutation is recorded; a missing-schema error
  on a select or delete is skipped and the run continues (assert a later delete is recorded).
- K5 A storage removal error is logged through `sideEffectError("accountWipe", "remove_storage_objects", …)` and the
  run continues.
- K6 The K1–K5 file passes with the **same** test count before and after the move (report both) with no edit to it after
  step 2, and `verify-account-wipe-split.mjs` prints `OK` for every symbol and no `DIFF`; the declaration diff is empty.
- K7 Structure test: first statement of each new module is `import "server-only"`; no new module contains
  `"use server"` or `"use client"`; the façade still starts with `"use server"` and its exports are exactly the six
  action names (parse the file; fail on any other `export`); every internal import edge belongs to the §3 allowlist (an
  unused permitted edge does not fail; any other edge, reverse dependency, self-import or cycle fails); no importer of
  `lib/account-wipe/*` outside the folder, the façade and tests; each file ≤ 500 lines.
- K8 Report a table: each moved symbol → BASE line range → new file:line range; `wc -l` of all three files; L-015
  character totals (supplement only).

## 9. Report format
Compact status only: BASE SHA, K1–K8 → test names, validation counts, exempt long lines. Do NOT include 'Claude prompt'
or 'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
Stay inside §5. Do not commit. No Undo (no behavior change). Never run any wipe action against a real database — tests
use the fake admin client only. Claude re-runs the proof script and the declaration diff, runs the gate, deploys, then
verifies on production **without deleting anything**: the Settings page loads for the owner test account and the
"Delete" section renders (nothing is submitted); Sentry shows no new issue on `/settings`.
The user should never need to read instructions to complete this flow (no UI change).
