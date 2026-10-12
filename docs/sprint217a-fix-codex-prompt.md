# Sprint 217a-fix — "Rent late" must match the existing late rules (L1) · rev 1

## 1. Objective
In `apps/web/lib/owner-wallet-home.ts`, `isLate` currently means "a charge with status pending or late whose due date is before today". That's wrong in two ways:
- **It ignores the grace period.** The nightly job sets `status = "late"` only after grace.
- **It ignores leases collected outside Domus.** `tracksLateRent` in `lib/lease-collection.ts` says those don't count as late.

Make `isLate` match the rule the Sprint 216 Needs-you list used (`lib/action-items.ts:161`).

## 2. Context
- Working tree has the uncommitted Sprint 217a changes (HEAD `5f69191`). Don't revert any of them.
- `getPortfolioData` leases carry `collectsOutsideDomus` (`lib/portfolio.ts:56`).
- The `rentRows.leases` in the loader come from `lib/owner-rent-rows.ts` and don't carry the collection flag.

## 3. In scope
- `isLate` = true only when the home has a charge with `status === "late"` AND that charge's lease passes `tracksLateRent`.
  - Look up the lease's collection preference by lease id from `portfolio.leases`. A missing lease counts as tracked.
  - Charges with `pending` status are never late here.

## 4. Out of scope
Everything else. No changes to `owner-rent-rows.ts`, `action-items.ts` or any UI.

## 5. Exact files expected to change
- `apps/web/lib/owner-wallet-home.ts`
- `apps/web/lib/__tests__/owner-wallet-home.test.ts`

## 6. Implementation requirements
- Lines ≤ 140 characters. No new queries.

## 7. Validation commands to run
- `cd apps/web && npx vitest run lib/__tests__/owner-wallet-home.test.ts components/__tests__/wallet-home.test.tsx`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- `npm run lint:web`

## 8. Acceptance criteria (binary; each one needs a named test)
1. A `pending` charge due before today → `isLate` is false.
2. A `late` charge on a tracked lease → true.
3. A `late` charge on a lease with `collectsOutsideDomus: true` (and not a client home) → false.
4. The existing 6 tests still pass (update the old "unpaid before today" test to the new rule). Typecheck and lint are green.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Compact status only. No "Claude prompt" or next-steps sections.

## 10. Constraints
- No DB access, deploy, commit or push.
- Don't touch other files.
