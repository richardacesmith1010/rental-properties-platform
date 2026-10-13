# Sprint 226b — Bank page error visibility + retry; hide the empty balances card (L1) · rev 1

## 1. Objective
`/owner/bank` intermittently shows "Bank activity is not ready yet." (2 of ~10 loads today, once in production smoke). `app/owner/bank/page.tsx` returns that message from about 8 branches, without logging the error. Apply the same pattern Sprint 226 used on `/owner/money`:
- wrap the page's DB steps with `withOneRetry` from `apps/web/lib/retry-transient.ts` (one retry on transient errors);
- log every failure branch: `console.error("[owner-bank-load-failed]", { step, name, code, status, message: first 160 chars })`, with the same safe fields as `[owner-money-load-failed]`.

Also: in dark mode, the Bank page shows an **empty rounded card** at the top when no bank account has a balance. Don't render `BankBalancesCard` (`components/bank-feed/bank-balances-card.tsx`) when it would have no rows.

## 2. Context
- HEAD = the Sprint 226 commit. `lib/retry-transient.ts` and its tests exist; reuse them.
- Supabase query results return `{ error }` rather than throwing. Treat a result whose `error` is transient (HTTP status ≥ 500, a PostgREST code `PGRST301`, or a code starting `57`) as retryable, the same way `retry-transient` does.

## 3. In scope
- `app/owner/bank/page.tsx`: retry and logging on each data step, with a distinct `step` name per branch. The user-facing copy is unchanged.
- `bank-balances-card.tsx` (or its parent): render nothing when there are no rows to show.

## 4. Out of scope
Everything else.

## 5. Exact files expected to change
- `apps/web/app/owner/bank/page.tsx`
- `apps/web/components/bank-feed/bank-balances-card.tsx` (or the parent that mounts it)
- Tests: a new `apps/web/app/owner/bank/__tests__/page-errors.test.tsx`, plus the balances-card test.

## 6. Implementation requirements
Lines ≤ 140 characters. Never log tokens, emails or row data.

## 7. Validation commands to run
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- `cd apps/web && npx vitest run`
- `npm run build --workspace @domus/web`

## 8. Acceptance criteria
1. A transient error on one step, then success → the page renders.
2. Two transient errors → the status copy plus one `[owner-bank-load-failed]` log with `step` and `code`.
3. A non-transient error → no retry, and it's logged.
4. The balances card renders nothing with zero rows.
5. All green.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Compact status only.

## 10. Constraints
- No DB access, deploy, commit or push.
- Don't touch `.claude/launch.json`, `apps/ios`, `apps/mobile`, `docs/`, or "* 2.*" files.
