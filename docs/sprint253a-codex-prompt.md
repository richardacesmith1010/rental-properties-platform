# Sprint 253a — Code health: split `stripe-webhook-handlers.ts` (1,005 lines) by verbatim moves (L3: money)

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
nothing else. Import direction (no cycles): `context` ← `notify`, `transfers` ← `payments` ← handlers file.
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
- `apps/web/lib/__tests__/stripe-webhook-split.test.ts` (new: structure test, §8 W4)

## 6. Implementation requirements
Do these in order.
1. **Baseline first.** Before editing, run `npx vitest run lib/__tests__/stripe-webhook-handlers.test.ts` and record
   the pass count (it is the characterization suite; it must pass unchanged before and after).
2. **Move verbatim.** Cut each function/type block character for character into its new file; add only `export`
   and the imports each file needs. No reformatting, renaming, reordering inside a block, or comment edits.
3. **Verbatim check (Claude diffs this).** For every moved block, the text in the new file equals the HEAD text
   (allowing only the added `export ` keyword). The handlers file differs from HEAD only by removed blocks and import
   edits. Every changed/new line ≤ 140 characters. L-015: non-whitespace characters across old + new files within
   ±10% of HEAD.
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
- W1 `stripe-webhook-handlers.test.ts` passes with the **same** test count before and after (report both), with no
  edit to the file.
- W2 The six handler exports are unchanged in name and type (TS: `import * as H` in the new test and assert the
  six function names exist and `typeof === "function"`).
- W3 Plain-language guard passes with the same number of exceptions (report before/after counts).
- W4 Structure test: every new module's first statement is `import "server-only"`; no new module imports
  `@/lib/stripe-webhook-handlers` (no cycle); each file ≤ 500 lines.
- W5 Report a table: each moved symbol → HEAD line range → new file:line range, plus `wc -l` of all five files and the
  L-015 character totals.

## 9. Report format
Compact status only: W1–W5, validation counts. Do NOT include 'Claude prompt' or 'recommended next steps for Claude'
sections. Report compact status only.

## 10. Constraints
Stay inside §5. Do not commit. No Undo (no behavior change). Claude diffs every moved block against HEAD, runs the
gate, deploys, and runs production smoke plus a Stripe webhook health check (Stripe dashboard event delivery for the
last day unchanged; no new Sentry errors on `/api/webhooks/stripe`).
The user should never need to read instructions to complete this flow (no UI change).
