# Sprint 225b — year rent must stay rent-only (L1) · rev 1

## 1. Objective
In the uncommitted Sprint 225 work, `apps/web/lib/owner-wallet-home.ts` computes `yearRentReceivedByPropertyId` with `rentReceivedByPropertyId` (all categories). The live behavior it replaces (`lib/owner-ytd.ts`, since Sprint 220) uses **`rentOnlyReceivedByPropertyId(..., lines)`**, which excludes water lines. Packet 225 was wrong here. Make `yearRentReceivedByPropertyId` use exactly the same rent-only, charge-line-aware computation as `owner-ytd.ts` did, over the calendar year. Reuse the already-computed per-property rent-only map if it's the same value.

## 2. Context
Uncommitted Sprint 225 changes are in the tree. Don't revert them.

## 3. In scope
- `owner-wallet-home.ts`: the single computation change.
- Update the owner-wallet-home and owner-page-data tests so they assert the rent-only value. Add a test where a charge with a water line is paid: `yearRentReceivedByPropertyId` excludes the water part and equals what `rentOnlyReceivedByPropertyId` returns.

## 4. Out of scope
Everything else.

## 5. Exact files expected to change
- `apps/web/lib/owner-wallet-home.ts`
- `apps/web/lib/__tests__/owner-wallet-home.test.ts`
- `apps/web/lib/__tests__/owner-page-data.test.ts` (only if it asserts the value)

## 6. Implementation requirements
Lines ≤ 140 characters.

## 7. Validation commands to run
- `cd apps/web && npx vitest run lib/__tests__/owner-wallet-home.test.ts lib/__tests__/owner-page-data.test.ts`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- `npm run lint:web`

## 8. Acceptance criteria
1. The water-line test passes.
2. The targeted tests, typecheck and lint are green.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Compact status only.

## 10. Constraints
No DB access, deploy, commit or push. Touch no other files.
