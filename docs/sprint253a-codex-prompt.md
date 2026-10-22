# Sprint 253a — Code health: split `stripe-webhook-handlers.ts` (1,005 lines) by verbatim moves (L3: money) — rev 4 (rev 1 AWC → rev 2 AWC → rev 3 + test-harness note)

## 1. Objective
`apps/web/lib/stripe-webhook-handlers.ts` is 1,005 lines (the largest source file; limit 500). Split it into focused
`server-only` modules with **verbatim moves only — no behavior change**. The six exported handlers keep their names
and signatures; `app/api/webhooks/stripe/route.ts` keeps importing them from `@/lib/stripe-webhook-handlers`.

## 2. Context
- HEAD: see `git log -1`. Scorecard Code health 80; four money/deletion files > 500 lines remain (this, `account-wipe.ts`
  780, `lib/ownership.ts` 709, `lib/stripe-connect.ts` 685) — one sprint each, this is the first.
- File map (line → symbol): 25–60 types `AdminClient`, `Match`, `Ctx`, `CtxResult`, `PaymentParams`; 63 `received`;
  67 `retryableWebhookError`; 74 `isConstraintViolation`; 82 `getCtx`; 150 `isAuthorizedUser`; 174
  `insertPaymentRecord`; 218 `markChargePaid`; 260 `updateAutopay`; 272 `createTransfersForPayment`; 434
  `notifyManagerOfFeeTransfer`; 473 `queuePaymentNotifications`; 505 `queueAutopayFailure`; 547 `recordPayment`;
  exported handlers 713 `handleAccountUpdated`, 734 `handlePaymentIntentSucceeded`, 764
  `handlePaymentIntentPaymentFailed`, 800 `handleAsyncPaymentSucceeded`, 833 `handleAsyncPaymentFailed`, 967
  `handleCheckoutSessionCompleted`.
- Importers: `app/api/webhooks/stripe/route.ts`; `lib/plain-language/exceptions.json` lists this file path for
  allowed Stripe description strings. Tests: `lib/__tests__/stripe-webhook-handlers.test.ts` (562 lines).
- Prior approved pattern: Sprints 190 and 232 (characterization first, byte-identical moves, Claude diffs every block).

## 3. In scope
New folder `apps/web/lib/stripe-webhook/`, each file starting with `import "server-only";`:
1. `context.ts` — the types (exported), `received`, `retryableWebhookError`, `isConstraintViolation`, `getCtx`,
   `isAuthorizedUser`.
2. `notify.ts` — `notifyManagerOfFeeTransfer`, `queuePaymentNotifications`, `queueAutopayFailure`.
3. `transfers.ts` — `createTransfersForPayment`.
4. `payments.ts` — `insertPaymentRecord`, `markChargePaid`, `updateAutopay`, `recordPayment`.
`lib/stripe-webhook-handlers.ts` keeps only the six exported handlers plus imports. Moved functions gain `export` and
nothing else. **Allowed import edges (the only ones):** `notify → context`; `transfers → context, notify`;
`payments → context, notify, transfers`; façade `stripe-webhook-handlers.ts → context, notify, transfers, payments`.
`context` imports none of the new modules. Nothing outside `lib/stripe-webhook/` and the façade imports
`lib/stripe-webhook/*` (tests excepted).
Update `lib/plain-language/exceptions.json` so every exception that pointed at a moved string points at its new file
(same strings, same count).

## 4. Out of scope
Any logic, copy, error message, query, Stripe call, idempotency key, log tag or notification change. The other three
large files. Renaming anything. Test logic changes (only import paths may change, and only if a test imported a
now-moved private symbol — none should).

## 5. Exact files expected to change
- `apps/web/lib/stripe-webhook-handlers.ts`
- `apps/web/lib/stripe-webhook/context.ts`, `notify.ts`, `transfers.ts`, `payments.ts` (new)
- `apps/web/lib/plain-language/exceptions.json` (paths only)
- `apps/web/lib/__tests__/stripe-webhook-handlers.test.ts` — **one line only**: add `vi.mock("server-only", () => ({}));`
  next to the existing `vi.mock` calls (the repo pattern, used in 45 test files). The real `server-only` package throws
  outside the `react-server` condition, so the new modules' first statement would otherwise break this suite at import.
  No other edit to this file.
- `apps/web/lib/__tests__/stripe-webhook-split.test.ts` (new: structure test, §8 W4)
- `apps/web/scripts/verify-verbatim-split.mjs` (new, dev-only, **generic** proof script reused by Sprints 253b–d)

## 6. Implementation requirements
Do these in order.
1. **Baseline first.** Record `BASE=$(git rev-parse HEAD)` and confirm `git diff --quiet $BASE --
   apps/web/lib/stripe-webhook-handlers.ts apps/web/lib/plain-language/exceptions.json` (no local edits); use that one
   SHA for every source comparison and declaration snapshot, and print it in the report. Then, run `npx vitest run lib/__tests__/stripe-webhook-handlers.test.ts` and record
   the pass count (it is the characterization suite; it must pass unchanged before and after).
2. **Move verbatim.** Cut each function/type block character for character into its new file; add only `export`
   and the imports each file needs. No reformatting, renaming, reordering inside a block, or comment edits.
3. **Verbatim proof (primary).** Add `apps/web/scripts/verify-verbatim-split.mjs` (dev-only, not shipped, generic:
   `node scripts/verify-verbatim-split.mjs --base <sha> --old <path> --facade <path> --new <path>...`). It reads the old
   file via `git show <base>:<path>`, finds every top-level declaration with the TypeScript compiler API
   (`ts.createSourceFile`, each node's full text; no regex extraction; each name must match exactly one top-level
   declaration per file, else fail), extracts the same names from the new files and the façade, removes only a leading
   `export ` added by this sprint, and asserts **byte-identical** text per symbol (prints `OK <symbol>` / `DIFF
   <symbol>`). The six handler bodies in the façade must also be byte-identical to HEAD. It also asserts that the
   façade's non-import text equals HEAD minus the moved blocks. Claude re-runs it. Character totals (L-015) are reported
   only as a supplement.
   **Long lines:** before moving, list every line in the moved blocks already longer than 140 characters; those lines
   stay verbatim (exempt, listed in the report). No reformatting of money code; every *new* line (imports, `export`)
   ≤ 140 characters.
   **Signatures:** before editing, emit declarations for the façade at HEAD
   (`npx tsc --declaration --emitDeclarationOnly --noEmit false --outDir <tmp>` scoped to the file, or an equivalent
   `ts-morph`-free script using the TypeScript compiler API) and save the six exported function declarations; after
   the move, emit again; the six declaration texts must be identical (report the diff, expected empty).
4. Each new file ≤ 500 lines; the handlers file ≤ 500 lines.

## 7. Validation
```
cd apps/web
npx vitest run lib/__tests__/stripe-webhook-handlers.test.ts lib/__tests__/stripe-webhook-split.test.ts
npx vitest run lib/__tests__/plain-language.test.ts
npx tsc --noEmit
```
then from the repo root `npm run lint:web` and `npm run build:web` (Claude runs `npm run gate:web`).

## 8. Acceptance criteria
- W1 `stripe-webhook-handlers.test.ts` passes with the **same** test count before and after (report both); its only
  diff is the one `vi.mock("server-only", …)` line (report the `git diff` of the file, expected +1 line).
- W2 The six exported handler declarations (parameters and return types) are identical before and after (the §6 step 3
  declaration diff is empty), and `verify-verbatim-split.mjs` prints `OK` for every symbol and no `DIFF`.
- W3 `exceptions.json` before vs after differs **only** in file paths for moved strings: every affected string is
  byte-identical, each new path really contains its string, and no exception is added, removed or duplicated (the
  plain-language guard passes; report the changed entries).
- W4 Structure test (parses import statements of the five files): first statement of each new module is
  `import "server-only"`; none contains `"use server"` or `"use client"`; every actual internal import edge among the
  five files belongs to the §3 allowlist (a permitted edge that is not used does **not** fail; any other edge, a
  reverse dependency, a self-import or a cycle fails); a repo search finds no importer of `lib/stripe-webhook/*` outside
  the folder, the façade and tests; each file ≤ 500 lines.
- W5 Report a table: each moved symbol → HEAD line range → new file:line range, plus `wc -l` of all five files and the
  L-015 character totals.

## 9. Report format
Compact status only: W1–W5, validation counts. Do NOT include 'Claude prompt' or 'recommended next steps for Claude'
sections. Report compact status only.

## 10. Constraints
Stay inside §5. Do not commit. No Undo (no behavior change). Claude re-runs the proof script and the declaration
diff, runs the gate, deploys, confirms the deployed revision, then checks **without replaying or creating any live
payment event**: Vercel runtime logs for `/api/webhooks/stripe` after deploy show only 2xx responses for real
deliveries (Hobby keeps 1 h — check within the hour), Stripe Workbench / the webhook endpoint's delivery log
(not the Events API) shows the post-deploy delivery outcomes and retries are all successful, and Sentry has no new
issues on the webhook route. Claude reports the number of real post-deploy deliveries examined; if none occurred,
delivery verification is **INCONCLUSIVE**, not PASS (rechecked at the next real delivery).
The user should never need to read instructions to complete this flow (no UI change).
