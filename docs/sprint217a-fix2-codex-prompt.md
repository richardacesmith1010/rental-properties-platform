# Sprint 217a-fix2 — Owner title row overflows at 375px (L1) · rev 1

## 1. Objective
On phones (375px wide), the owner section title row runs off the right edge on sections with long names, such as `/owner?section=applications`. The cause is the 34px title (Sprint 217a) sitting on the same line as the Send Announcement and Add buttons. The buttons end at about x = 415 on a 375px screen.

Make the row fit with no horizontal overflow.

## 2. Context
- HEAD `a24fd0a`, on `main`.
- The owner title row is in `apps/web/components/dashboard/index.tsx`, in the `isOwnerRole` block. It's the `div` with `flex w-full items-start justify-between gap-3 py-4`, and its actions container is `flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center`.

## 3. In scope
For non-Home owner sections below `sm`:
- The title block takes `min-w-0` and the text may wrap (`break-words`).
- The actions move **under** the title on their own row, left-aligned, and wrap if needed: `flex-wrap`.
- From `sm` up, the layout stays as it is now.
- The Home title row (greeting, `Home`, round Add) is unchanged.

## 4. Out of scope
Everything else.

## 5. Exact files expected to change
- `apps/web/components/dashboard/index.tsx`
- `apps/web/components/__tests__/owner-dashboard-header.test.tsx`

## 6. Implementation requirements
- Lines ≤ 140 characters.
- Use Tailwind classes only. No new CSS.

## 7. Validation commands to run
- `cd apps/web && npx vitest run components/__tests__/owner-dashboard-header.test.tsx components/__tests__/owner-daily-ops-home.test.tsx`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- `npm run lint:web`

## 8. Acceptance criteria
1. A test asserts that the non-Home owner title row container has `flex-wrap` (or `flex-col sm:flex-row`), and that the title block has `min-w-0`.
2. The Home title row markup is unchanged; the existing tests pass.
3. Typecheck and lint are green.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Compact status only. No "Claude prompt" or next-steps sections.

## 10. Constraints
- No deploy, commit or push.
- Don't touch other files.
