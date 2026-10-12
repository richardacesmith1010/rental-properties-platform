# Sprint 215c — Settings avatar file input overflows at 375 px (L1)

## 1. Objective
After the Geist font change (Sprint 215), `tests/e2e/smoke-mobile-layout.spec.ts` fails on `/settings` at 375 px for owner, manager and tenant:
```
div.space-y-2 extends 72..388
input#settings-avatar.block.text-sm extends 72..388
p.text-xs.text-[var(--muted)] extends 72..388
```
The native file input (`#settings-avatar`, `components/settings/profile-settings.tsx` ~line 135) is wider than its container. Make it fit.

## 2. Context
HEAD `8a6f06e`. File: `apps/web/components/settings/profile-settings.tsx`.

## 3. In scope
- Constrain the input and its wrapper: add `w-full max-w-full min-w-0` to the input, and `min-w-0` to its flex/grid parents if any.
- If the native control still can't shrink, let its file-button text wrap, or put the input in an `overflow-hidden` wrapper that keeps the button visible.
- Keep its look, label and accept types.

## 4. Out of scope
Everything else.

## 5. Exact files expected to change
`apps/web/components/settings/profile-settings.tsx` (and its test, only if a class assertion needs updating)

## 6. Implementation requirements
Lines ≤ 140.

## 7. Validation commands to run
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- `cd apps/web && npx vitest run components/settings`

## 8. Acceptance criteria (binary)
1. The input and its wrapper have the width constraints.
2. Lint, typecheck and tests pass.
3. Claude's live 375 px smoke shows no overflow on `/settings`.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB access, deploy, commit or push. Don't run `gate:web`.
