# Sprint 200b — 44 px tap targets on the screens the new phone smoke found (L1: styling) · same working tree as Sprint 200

## 1. Objective
Sprint 200's extended `smoke-mobile-layout.spec.ts` (uncommitted, in the working tree; keep it) found **no clipping**, only buttons/links shorter than 44 px at 375 px wide. CLAUDE.md requires 44 px touch targets. Fix them so the extended smoke passes. Desktop must look the same.

## 2. Findings (Claude ran the spec against production at 375×812)
| View | Element (selector as reported) | Height |
|---|---|---|
| `/settings` (all roles, both tabs states) | phone tab buttons `button.inline-flex.shrink-0` in `components/settings/settings-layout.tsx` (`[data-settings-mobile-nav]`) | 38 |
| owner + manager `?section=inbox` | Messages tabs `button.relative.z-10` (`components/ui/animated-tabs.tsx`) | 36 |
| owner `?section=portfolio`, `?section=units` | `button.inline-flex.items-center` | 28 |
| owner + manager `?section=units`, `?section=leases` | `button.tabular-nums.inline-flex` | 32 |
| owner `?section=units` | `button.inline-flex.max-w-full` | 24 |
| owner `?section=notifications` | `button.tabular-nums.inline-flex` | 36 |
| owner `?section=members` | `a.mt-3.inline-flex` | 20 |

## 3. In scope
1. Find each element's component (search for the class combos and the section components) and give it `min-h-11` on phones while keeping today's size from `sm`/`md` up (e.g. `min-h-11 sm:min-h-0`, or the repo's existing pattern). For `animated-tabs.tsx`, make sure the indicator still lines up after the height change (it measures `offsetLeft`/`offsetWidth`, so it should).
2. Do not change copy, colors, behavior or desktop sizes. List each file and element changed.
3. Keep Sprint 200's spec and icon change as they are.

## 4. Out of scope
Other screens, other rules, deploy, commit, `.claude/launch.json`, `docs/`.

## 5. Exact files expected to change
The components behind the §2 elements (list each), plus any unit test that asserts their class names.

## 6. Implementation requirements
Lines ≤ 140 chars; no new dependencies. The user should never need to read instructions to complete this flow.

## 7. Validation commands to run
`npm run lint:web`; `npx tsc --noEmit -p apps/web/tsconfig.json`; unit tests importing the changed components (+ `animated-tabs` tests). Claude will run the Playwright spec (your sandbox can't start Chromium).

## 8. Acceptance criteria (binary)
Every §2 element is ≥ 44 px tall below `sm`; desktop classes unchanged; tests, lint and typecheck pass; only listed files changed.

## 9. Report format
JSON per `docs/codex-report-schema.json`, listing file → element → class change. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB access, no deploy, commit or push. Never touch `.claude/launch.json`.
