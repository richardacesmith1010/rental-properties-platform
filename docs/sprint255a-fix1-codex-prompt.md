# Sprint 255a fix1 — remove `as never` casts in wipe logging (L1) — rev 1

## 1. Objective
Review of Sprint 255a (uncommitted in the tree — keep all of it) found six `as never` casts in
`apps/web/lib/account-wipe/mutations.ts` (`sideEffectError("accountWipe", <category>, { action: plan.action } as never)`).
`sideEffectError(action, operation, ctx)` types `ctx` without `action`; the cast smuggles `action` in, and because `ctx`
is spread last it silently overwrites the first argument. Make the intent explicit and type-safe.

## 2. Context
`apps/web/lib/logger.ts:70-84` — `sideEffectError(action, operation, ctx?)` logs `{ action, operation, ...ctx }`.
Today's effective log: `{ action: plan.action, operation: <category> }`.

## 3. In scope
1. Replace each `sideEffectError("accountWipe", X, { action: plan.action } as never)` with
   `sideEffectError(plan.action, X)` (same effective log: action = plan action, operation = category). Keep the
   existing `sideEffectError("accountWipe", "remove_storage_objects", { entityType: bucket })` calls exactly as they are.
2. Update the assertions in the two 255a test files that expect `("accountWipe", <category>, { action: … })` to expect
   `(<action>, <category>)`.

## 4. Out of scope
Anything else in 255a; logger.ts.

## 5. Exact files expected to change
- `apps/web/lib/account-wipe/mutations.ts`
- `apps/web/app/actions/__tests__/account-wipe.test.ts`
- `apps/web/lib/__tests__/account-wipe-plan.test.ts`

## 6. Implementation requirements
No `as never`, `as any` or `as unknown as` added anywhere in these files. Lines ≤ 140 characters.

## 7. Validation
```
cd apps/web
npx vitest run app/actions/__tests__/account-wipe.test.ts lib/__tests__/account-wipe-plan.test.ts lib/__tests__/account-wipe-split.test.ts
npx tsc --noEmit
```
then from the repo root `npm run gate:web`.

## 8. Acceptance criteria
- F1 `grep -c "as never" apps/web/lib/account-wipe/mutations.ts` = 0.
- F2 Tests assert `sideEffectError` called with `("fullAccountWipe", "database_rollback_confirmed")`,
  `("fullAccountWipe" | "deleteAllProperties", "rpc_result_unknown")` and `(<action>, "storage_cleanup_failed")` where
  they asserted the old shape; counts unchanged.
- F3 Gate green (counts verbatim).

## 9. Report format
Compact status only. Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact
status only.

## 10. Constraints
Stay inside §5. Do not commit. The user should never need to read instructions to complete this flow (no UI change).
