# Sprint 199b — URGENT: phone Settings clipped off-screen (L1: one layout fix)

## 1. Objective
At 375 px, `/settings` for every role is wider than the screen: the tab row and the section card run past the right edge and are cut off (card text ends mid-word; right border not visible). Later tabs (Security, Account & Data, Your data) sit off-screen. Pre-existing since Sprint 136; CLAUDE.md classes clipped content as production-breaking.

## 2. Context
`apps/web/components/settings/settings-layout.tsx:60` `<div className="grid gap-6 md:grid-cols-[14rem_minmax(0,1fr)]">`. Below `md` the grid has no explicit column, so its implicit column sizes to the max-content width of the phone tab row (`:89` `<nav className="flex gap-2 overflow-x-auto pb-1">`, non-wrapping), which stretches the card too. The document itself is 375 px wide (an ancestor clips).

## 3. In scope
1. Give the grid an explicit single shrinkable column below `md` (e.g. `grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[14rem_minmax(0,1fr)]`) and add `min-w-0` to the `<aside>` and the section wrapper (`:117`) so neither can grow past the screen. The phone tab row must then scroll horizontally **inside** the screen (keep `overflow-x-auto`; tabs `shrink-0`). Make the active tab scroll into view on mount/change (`scrollIntoView({ inline: "nearest", block: "nearest" })`).
2. Desktop (`md` and up) must render exactly as today.
3. Test: render at a mocked narrow width is impractical in jsdom, so assert the classes (grid has `grid-cols-[minmax(0,1fr)]`, aside and section have `min-w-0`, nav keeps `overflow-x-auto`, tab buttons `shrink-0`) and that selecting a tab calls `scrollIntoView` on it.

## 4. Out of scope
Any other component, copy or behavior. Deploy, commit, `.claude/launch.json`, `docs/`.

## 5. Exact files expected to change
`apps/web/components/settings/settings-layout.tsx` and its test (existing or new `components/settings/__tests__/settings-layout.test.tsx`).

## 6. Implementation requirements
Lines ≤ 140 chars. No new dependencies. The user should never need to read instructions to complete this flow.

## 7. Validation commands to run
`npm run lint:web`; `npx tsc --noEmit -p apps/web/tsconfig.json`; the settings tests (`grep -rl "settings-layout\|your-data-settings" apps/web --include=*.test.tsx`).

## 8. Acceptance criteria (binary)
Classes and `scrollIntoView` as in §3, tests pass, lint and typecheck pass, only §5 files changed.

## 8b. Post-deploy (Claude)
At 375 px for owner, manager and tenant: the card's right edge ≤ 375 px, every tab is reachable by scrolling the tab row, and "Your data" / "Account & Data" open and show their content; light/dark; desktop unchanged; 0 console errors.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB access, no deploy, commit or push. Never touch `.claude/launch.json`.
