# Sprint 238g-fix1 — App Review seed: dry-run placeholder ids, stale rent item, weak tests (L2, scripts only)

## 1. Objective
Fix the issues the Claude review found in the uncommitted 238g seed (packet `docs/sprint238g-codex-prompt.md` rev 3.1):
one runtime bug (the dry run fails on the first live run), one App Review hazard (a stale rent review item), and weak
tests (L-017). No other behavior changes.

## 2. Context
- The 238g files are uncommitted in the working tree: `scripts/seed-appreview-accounts.mjs` (217 lines),
  `scripts/lib/appreview-graph.mjs` (265), `scripts/lib/seed-helpers.mjs` (263), `scripts/__tests__/seed-appreview.test.mjs`
  (390), `scripts/__tests__/helpers/fake-admin.mjs` (203). `npm run test:scripts` passes 29/29 today.
- Bug: in dry run with no demo user yet, `ensureUser` returns id `appreview-dryrun-<role>`
  (`seed-appreview-accounts.mjs:143`). Live Postgres rejects it as an invalid uuid (22P02) on the first `profiles` lookup
  (`:170`) and in the graph (`appreview-graph.mjs:44`). The fake does not validate uuids, so tests missed it.
- Hazard: `ensureBank` (`appreview-graph.mjs:160-192`) creates month-keyed `bank_review_items`. After a month rolls over, the
  seed marks the old month's charge paid, but the old month's rent review item stays. If App Review taps "Yes" on it, a
  second payment is recorded and the next seed run refuses with "conflicting payment".

## 3. In scope
The five files in §5 only.

## 4. Out of scope
`scripts/seed-smoke-accounts.mjs`, `scripts/lib/seed-helpers.mjs`, `scripts/lib/demo-png.mjs`, `seed-smoke-pin.test.mjs`,
`package.json`, anything under `apps/`, `.claude/`, `docs/`. Running either seed in any mode.

## 5. Exact files expected to change
1. `scripts/seed-appreview-accounts.mjs`
2. `scripts/lib/appreview-graph.mjs`
3. `scripts/__tests__/seed-appreview.test.mjs`
4. `scripts/__tests__/helpers/fake-admin.mjs`
5. `scripts/__tests__/seed-appreview-graph.test.mjs` (new; only if file 3 would pass 500 lines — move whole tests, unchanged)

## 6. Implementation requirements
1. **Placeholder ids.** The dry-run placeholder id becomes `deterministicUuid("appreview-dryrun-<role>")` (the existing helper
   in `seed-helpers.mjs`, imported). It must not equal any id the real graph uses.
2. **Fake validates uuids.** In `fake-admin.mjs`, any filter or payload value for a column named `id` or ending in `_id`
   (except `external_id`) that is a string and not a uuid (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`)
   returns `{ data: null, error: { code: "22P02", message: "invalid input syntax for type uuid" } }`, like Postgres.
   Insert of a row whose `id` already exists in that table returns `{ error: { code: "23505" } }`.
3. **Stale rent items.** In `ensureBank`, before creating the current month's items, delete the demo rent review items for
   months `M0-1`, `M0-2` and `M0-3` by their deterministic id (`id("bank-item-<month>-rent")`), filtered also by
   `owner_account_id` = the demo account and `bank_account_id` = the demo bank account. Only the `rent` slug; expense items
   stay. In dry run, print `would-delete` lines instead and write nothing. A missing row is fine (no error, no line).
   Check every delete's error (L-002).
4. Error messages: the two `Failed to create/update <role> auth user` errors append `: ${error.message}` when an error
   exists. They must never include a password.
5. Lines ≤ 140 characters; each file ≤ 500 lines.

## 7. Validation commands
- `npm run test:scripts`
- `for f in scripts/seed-appreview-accounts.mjs scripts/lib/*.mjs; do node --check "$f"; done`
- `wc -l scripts/seed-appreview-accounts.mjs scripts/lib/*.mjs scripts/__tests__/*.mjs scripts/__tests__/helpers/*.mjs`
- `awk 'length > 140' scripts/seed-appreview-accounts.mjs scripts/lib/appreview-graph.mjs scripts/__tests__/*.mjs` prints nothing
- `git status --short scripts/` lists only §5 files plus the other existing 238g files, unchanged.
Do NOT run `node scripts/seed-*.mjs` in any mode, against any database.

## 8. Acceptance criteria (new or strengthened tests; each asserts on real seed output, never inside a mock)
1. "dry run works with no demo users": empty fake (uuid validation on) + `dryRun: true` → resolves (no throw), zero write
   calls, and the summary has `would-create` lines for both auth users and both profiles (files 1, 3, 4).
2. "fake rejects bad uuids": a direct fake query with `id = "not-a-uuid"` returns error code `22P02`; a duplicate-id
   insert returns `23505` (file 4, asserted in file 3 or 5).
3. "old rent item is removed on month rollover": run at `now`, then at `now` + 1 month → the old month's rent review item
   id no longer exists, the old month's two expense items still exist, the new month's three items exist; a third run at
   the same `now` makes zero writes (files 2, 3/5).
4. "a foreign rent item is not deleted": a `bank_review_items` row with the old month's rent id but a different
   `owner_account_id` → still present after the rollover run (no delete matched it) (files 2, 3/5).
5. "smoke ids never collide" (replaces the WEAK acceptance 4): the set of all ids written by an App Review run shares no
   member with `deterministicUuid(label)` for the real smoke labels `smoke-owner-account`, `smoke-property`, `smoke-unit`,
   `smoke-lease` (files 3/5).
6. "post-create access aborts" (strengthens 15): the trigger fake adds a membership on `createUser` for the **owner** → the
   write log after the `createUser` call has zero entries; same for the tenant (files 3/5).
7. "foreign lease and membership are refused" (strengthens 16): a demo user that passes preflight (no access rows) but
   whose deterministic lease id or membership row is pre-seeded with a different parent → refused, and the write log
   shows no update or upsert to that table (files 3/5).
8. "cron M0 adopted unchanged" (strengthens 17): the pre-seeded `pending` (and, separately, `late`) `M0` charge keeps its
   status and amount after the run (files 3/5).
9. "conflicting payment refuses before writing" (strengthens 19): pre-seed the full graph with a clean run, then add an
   active 300-cent payment on a demo paid charge; the next run throws "conflicting payment" and the write log for that run
   is empty (files 3/5).
10. "rev 3.1 fields": the tenant message has `sender_email` null; the owner message has `sender_email` equal to the owner
    email; the photo row has `file_name` ending `.png`, `file_type` `image/png`, `file_size_bytes` equal to the uploaded
    byte length; the upload call's `contentType` is `image/png`; two `demoPng()` calls return identical bytes (files 3/5).
11. "auth errors are readable but never leak a password": a fake `createUser` error `{ message: "boom" }` → the thrown
    message contains `boom` and not the generated password (files 1, 3/5).
12. All 29 existing tests still pass unchanged except where this packet strengthens them.

## 9. Report format
Status (PASS/FAIL); files changed with line counts; test count; the §7 command results; any deviation with its reason.
Token usage. Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
- Change only §5 files. No new dependencies. No SQL, migrations or schema changes.
- Never run either seed, including `--dry-run`. Never read, print or commit `.env.local` values; never invent emails or URLs.
- Do not commit (Claude commits).
