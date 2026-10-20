# Sprint 242f-web2 — Owner dashboard title rule (L1, web, look only)

## 1. Objective
Give the owner dashboard's screen title block (Home and every in-dashboard section) the 2 px ink rule the other screens
got in 242d/242e (`docs/design/domus-design-system.md` §4), and use the spec's title weight. Look only.

## 2. Context
- `apps/web/components/dashboard/index.tsx:375-378`: the title row `<div className={\`flex w-full items-start
  justify-between gap-3 py-4 ...\`}>` (shown when `activeSection !== "portfolio"`).
- `:384` and `:388`: the two `<h1>` titles use `font-display ... font-bold`.
- The working tree has other uncommitted 242f-web changes in other files; do not touch them.

## 3. In scope / 4. Out of scope
In: those three lines and one test. Out: everything else in the file and all other files; copy; layout.

## 5. Exact files expected to change
1. `apps/web/components/dashboard/index.tsx`
2. `apps/web/components/__tests__/redesign-leftovers.test.tsx` (add one test)

## 6. Implementation requirements
1. Title row (`:375-378`): change `py-4` to `pt-4 pb-3` and add `border-b-2 border-[var(--ink)]` to both class branches.
2. Both `<h1>`s: `font-bold` → `font-semibold`. Nothing else changes.

## 7. Validation commands
```
(cd apps/web && npx vitest run components/__tests__/redesign-leftovers.test.tsx)
(cd apps/web && npx vitest run --reporter=dot)
(cd apps/web && npx tsc --noEmit)
npm run lint:web
```
Do NOT run `npm run gate:web`.

## 8. Acceptance criteria
1. New test in `redesign-leftovers.test.tsx` "dashboard title rule": reading `components/dashboard/index.tsx` as text, the
   title-row class string contains `border-b-2 border-[var(--ink)]` in both branches and neither `<h1>` contains
   `font-bold` (a source assertion is acceptable here because rendering the full dashboard needs heavy fixtures).
2. All existing tests pass.

## 9. Report format
Compact status only: files changed, test names, command results.
Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
Only §5 files. No copy changes. The user should never need to read instructions to complete this flow. Every step must
be self-explanatory. If the user needs to think about what to do, the UI needs to be clearer.
