# Sprint 237a-b — Fix build: move getRecentPaymentsForAi out of the route file (L1, verbatim move)

## 1. Objective
`npm run gate:web` fails at `next build`: `Route "app/api/ai/chat/route.ts" does not match the required types of a Next.js
Route. "getRecentPaymentsForAi" is not a valid Route export field.` Sprint 237a exported that function for its test. Move it
out of the route file so the build passes. No behavior change.

## 2. Context
- 237a changes are uncommitted in the working tree (HEAD `159ff46`); keep them all.
- `apps/web/app/api/ai/chat/route.ts:144` `export async function getRecentPaymentsForAi(userId, accountId?)` (uses
  `createAdminClient`, `getAdministeredPropertyIds`, `getAdministeredPropertyIdsForAccount`, type `AiRecentPayment`).
- Test `apps/web/lib/__tests__/ai-chat-payments.test.ts` imports it from `@/app/api/ai/chat/route`.

## 3. In scope
Verbatim move of `getRecentPaymentsForAi` (and `AiRecentPayment` type if only it and the route use it) to a new
`apps/web/lib/ai-recent-payments.ts`; the route imports it; the test imports from the new module and mocks stay valid.

## 4. Out of scope
Any logic or copy change. Any other 237a file.

## 5. Exact files expected to change
1. `apps/web/lib/ai-recent-payments.ts` (new)
2. `apps/web/app/api/ai/chat/route.ts`
3. `apps/web/lib/__tests__/ai-chat-payments.test.ts` (import path only)

## 6. Implementation requirements
- Function body moved verbatim (including the `.is("reversed_at", null)` before `.limit(10)`). Route keeps only Next.js
  route exports (`runtime`, `POST`, etc.). Remove now-unused imports from the route. Lines ≤ 140.

## 7. Validation commands
```
cd apps/web && npx vitest run --reporter=dot
cd apps/web && npx tsc --noEmit
npm run lint:web
cd apps/web && npx next build
```
Do NOT run `npm run gate:web`. Do not commit.

## 8. Acceptance criteria
1. `next build` passes (no route-export type error).
2. `ai-chat-payments.test.ts` passes unchanged except its import path; full suite green.
3. `/usr/bin/grep -n "^export" apps/web/app/api/ai/chat/route.ts` shows only route exports.

## 9. Report format
Compact status only: files changed with line counts and command results. Do NOT include "Claude prompt" or
"recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
Only the files in §5. No new dependencies.
