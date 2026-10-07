# Sprint 190 — Code health part 4: split money files, batch 1 (L3: money code, pure move) · Category 12: Code health

## 1. Objective
Bring 4 money files to ≤ 500 lines with **zero behaviour change**, by moving code verbatim into new modules:

| File | Lines | Non-whitespace chars | Max line | Kind |
|---|---|---|---|---|
| `apps/web/app/actions/charges.ts` | 571 | 13,874 | 129 | `"use server"` (card/ACH checkout, manual payment) |
| `apps/web/app/actions/charge-management.ts` | 562 | 12,793 | 141 | `"use server"` (edit/create/delete/waive rent, rent amount) |
| `apps/web/app/actions/withdrawals.ts` | 517 | 14,349 | 108 | `"use server"` (owner withdrawal request/vote/Stripe transfer) |
| `apps/web/lib/distributions.ts` | 574 | 14,273 | 113 | plain module; imported by 3 `"use client"` components (types) |

Total non-whitespace: **55,289**.

## 2. Context
- Branch `main`, HEAD `d1083c3` or a later docs-only commit. Next 15.5, React 19, Vitest.
- Sprints 185–188 split 20 files under these rules and passed. L-015: one refactor crammed code onto huge lines and was rejected. §6 shape rules are hard gates.
- **Security trap — read this first.** In a `"use server"` file, **every exported async function becomes a public, callable server endpoint.** The private helpers in the 3 action files (e.g. `prepareCheckoutContext`, `getChargeContext`, `insertChargeHistory`, `restoreWithdrawalStatus`) skip auth on their own; they rely on the caller. They must **never** be exported from a `"use server"` module.
- Existing tests that lock behaviour today: `app/actions/__tests__/charges.test.ts` (23 cases), `lib/__tests__/charge-management.test.ts` (10), `lib/__tests__/stripe-webhook-handlers.test.ts` (8, uses distributions), `lib/__tests__/owner-page-data.test.ts`, `lib/__tests__/owner-section-route.test.ts`. `withdrawals.ts` and the pure functions of `distributions.ts` have no direct tests.
- `server-only` is already used in the repo (`lib/bank-feed/rules.ts`); copy that import style.

## 3. In scope
1. **Lock behaviour first (before moving any code).** Add characterization tests before the refactor and run them on the **unmodified** code. After that run, do not change the test contents; they must pass unchanged after the move:
   - `apps/web/lib/__tests__/distributions-pure.test.ts`: `planEqualDistributionTransfers`, `planCustomDistributionTransfers`, `validateDistributionConfig`, `buildDistributionConfigSnapshot` with fixed inputs: 1, 2 and 3 members; amounts that do not divide evenly (e.g. 1,000 cents / 3, 1 cent / 2); custom percentages summing to 100, to 99.99 and to 101; an empty member list. Use `toMatchInlineSnapshot()` or exact `toEqual`.
   - `apps/web/app/actions/__tests__/withdrawals.test.ts`, mocking Supabase/Stripe the same way `charges.test.ts` does: (a) unauthenticated → no DB write, **separately for each of the 3 actions**; (a2) one existing **success** path each for `submitWithdrawalRequest` (insert payload + returned state), `voteOnWithdrawal` (vote write + returned state) and `executeApprovedWithdrawal` (status transition, Stripe transfer args, final update, in order); (b) `submitWithdrawalRequest` with a bad amount ("", "0", "-5", "abc", "1.005") → the exact error text today and no insert; (c) `voteOnWithdrawal` by a non-member → refused, no update; (d) `executeApprovedWithdrawal` when the Stripe transfer throws → the withdrawal status is restored (`restoreWithdrawalStatus` path) and the error is returned; assert the **order** of the DB/Stripe calls (status change → transfer attempt → restore), e.g. with a call log array; (e) the schema-drift error path → `SCHEMA_ERROR_MESSAGE`. These pin **current** behaviour; do not encode desired behaviour. Assert the real returned state and the mocked calls; no tautologies (L-017).
2. **Move private helpers verbatim** out of the 3 action files into new plain modules that start with `import "server-only";` and have **no** `"use server"`:
   - `apps/web/lib/charge-checkout.ts` ← from `charges.ts`: `isRetryableStripeError`, `isCheckoutContext`, `handleStripeCheckoutFailure`, `prepareCheckoutContext`, the `CheckoutContext` type and any constants only they use.
   - `apps/web/lib/charge-management-helpers.ts` ← from `charge-management.ts`: `isValidDateOnly`, `getChargeRecord`, `getChargeContext`, `insertChargeHistory`, `revalidateChargeSurfaces`.
   - `apps/web/lib/withdrawal-helpers.ts` ← from `withdrawals.ts`: `SCHEMA_ERROR_MESSAGE`, `isSchemaConstraintError`, `isWithdrawalSchemaDriftError`, `restoreWithdrawalStatus`, `parseAmountCents`.
   - "Verbatim" = each function body and signature is byte-identical; only an `export` keyword is added and imports are adjusted. Do not rename, reorder logic, reformat, or "improve" anything.
   - The **exported server actions stay in their original files**, bodies unchanged (only the import lines change). Each `"use server"` file's export list stays exactly as in §8.3.
3. **Split `lib/distributions.ts`:** move the pure planners/validators (`roundPct`, `planEqualDistributionTransfers`, `planCustomDistributionTransfers`, `toNumber`, `toDistributionMode`, `buildEqualDistribution`, `validateDistributionConfig`, `buildDistributionConfigSnapshot`) and the shared interfaces/types into `apps/web/lib/distribution-plans.ts` (no `server-only`; it must stay importable by client components). `lib/distributions.ts` keeps the DB functions and **re-exports** everything it exports today so no importer changes. Type-only exports stay type exports (`export type { ... }`), value exports stay values; the export surface (names and value/type kind) is identical. Do not add `server-only` to `lib/distributions.ts`.
4. If a file is still > 500 lines after these moves, move the next-largest private helper the same way **into the matching helper module already listed in §5** (no other new files) and say which.

## 4. Out of scope
- Any logic, copy, error text, query, auth/role check, rate limit, audit log, revalidate path, or Stripe call change. Any rename.
- The other oversized files (`stripe-webhook-handlers.ts`, `account-wipe.ts`, `ownership.ts`, `stripe-connect.ts`, `app/tenant/page.tsx`, `charge-row.tsx`).
- Editing importers of these 4 files (none should be needed). Existing tests: only import-path fixes if a test imported a moved private symbol — list each.
- Deploy, commit, `.claude/launch.json`, `docs/`, `CLAUDE.md`, `AGENTS.md`.

## 5. Exact files expected to change
- The 4 files in §1.
- New: `apps/web/lib/charge-checkout.ts`, `apps/web/lib/charge-management-helpers.ts`, `apps/web/lib/withdrawal-helpers.ts`, `apps/web/lib/distribution-plans.ts`.
- New tests: `apps/web/lib/__tests__/distributions-pure.test.ts`, `apps/web/app/actions/__tests__/withdrawals.test.ts`.
- Existing tests only per §4.

## 6. Implementation requirements (hard gates)
- Every touched or new **source** file ≤ 500 lines, each line ≤ 140 characters (`charge-management.ts:552` has one 141-char line today, inside `updateLeaseRentAmount`, which is **not** moved: wrap only that line, whitespace-only, without changing the expression. This is the single permitted edit inside an action body.)
- **Character budget:** total non-whitespace of the 4 originals + 4 new source files (tests excluded) within **49,760–60,818** (±10% of 55,289).
- No compaction, no deleted comments, no minified code, no `eslint-disable`, no new dependencies.
- No new module may contain `"use server"`. The 3 helper modules start with `import "server-only";`.
- Every Supabase mutation keeps its existing error check exactly (L-002) — nothing may be dropped in the move.

## 7. Validation commands to run
- Before moving code: run the 2 new test files on the unmodified code; report pass counts and `git status` at that moment.
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- `npm run test --workspace @domus/web -- --run app/actions/__tests__/charges.test.ts lib/__tests__/charge-management.test.ts app/actions/__tests__/withdrawals.test.ts lib/__tests__/distributions-pure.test.ts lib/__tests__/stripe-webhook-handlers.test.ts lib/__tests__/owner-page-data.test.ts lib/__tests__/owner-section-route.test.ts`
- `npm run build --workspace @domus/web`
- Security check: `grep -n "^export" apps/web/app/actions/{charges,charge-management,withdrawals}.ts` lists exactly the §8.3 names; `grep -rn '"use server"' ` on the 4 new files returns nothing.
- Report per source file: lines, max line length, non-whitespace chars; and the total vs. 55,289.

## 8. Acceptance criteria (binary)
1. All 8 source files ≤ 500 lines, max line ≤ 140; total non-whitespace within 49,760–60,818.
2. No new file has `"use server"`; the 3 helper modules import `server-only`; no helper is exported from any `"use server"` file.
3. Exports are exactly:
   - `charges.ts`: payWithCard, payWithACH, payWithCardState, payWithACHState, deletePendingCharge, recordManualPayment.
   - `charge-management.ts`: editCharge, createManualCharge, deleteCharge, waiveCharge, updateLeaseRentAmount.
   - `withdrawals.ts`: submitWithdrawalRequest, voteOnWithdrawal, executeApprovedWithdrawal.
   - `distributions.ts`: every export it has today (types + functions), unchanged names.
4. Every moved function is byte-identical to the original apart from an added `export` (Claude will diff the bodies). Action bodies are unchanged except the one wrap at `charge-management.ts:552`.
5. The new characterization tests passed on the unmodified code and pass unchanged after; all §7 tests, lint, typecheck and build pass. Only §5 paths changed.

## 8b. Post-deploy verification (Claude only; not part of Codex completion)
- **Claude, after deploy:** full gate; `/owner` Rent, Ownership and Payouts screens load for the smoke owner in light and dark with 0 console errors; the smoke tenant's Pay screen opens (no payment made); smoke specs pass; Sentry clean; CI green.

## 9. Report format
JSON per `docs/codex-report-schema.json`, plus the metrics table, the export lists and the before-refactor test run. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB access beyond the gate's read-only checks, no Stripe calls, no deploy, commit or push. Never touch `.claude/launch.json`. Do not "fix" anything you notice; list it instead.
