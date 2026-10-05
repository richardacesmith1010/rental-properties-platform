# Sprint 157 — Phone bottom bar actually sticks to the screen + two copy leftovers

**Severity: L1** (one layout fix + two copy edits). Model: gpt-6-luna, low effort.

## 1. Objective
Fix three issues Claude found verifying Sprint 156 in production (smoke owner, 390×844):
1. The owner phone bottom bar (`apps/web/components/dashboard/owner-bottom-bar.tsx`, `<nav className="fixed inset-x-0 bottom-0 … lg:hidden">`, rendered from `apps/web/components/dashboard/dashboard-layout.tsx:98-104`) is **not visible on screen**: its bounding box is at y≈2854 (end of the page), so a CSS ancestor (transform/filter/backdrop/contain) is making `position: fixed` relative to a container instead of the viewport.
2. `apps/web/components/dashboard/expenses-section.tsx:41` still says "Property P&L".
3. The Rent page shows "Rent is added each month from your leases." twice (once from the section frame description in `apps/web/components/dashboard/section-renderer-support.tsx`, once in `apps/web/components/dashboard/charge-section-controls.tsx`).

## 2. Context
Branch `main`, HEAD `62aedec` or later docs-only. Next 14.2.5, React 18.

## 3. In scope
1. Render `OwnerBottomBar` through a React portal into `document.body` (mount-guarded so SSR renders nothing until mounted), keeping its existing classes, items, badge, `onSelectItem`, `onOpenMore`, safe-area padding and `lg:hidden`. Do not change ancestors' styles.
2. Change "Property P&L" → "Money in and out by home".
3. Remove the duplicate sentence: keep the one in `charge-section-controls.tsx`; drop the owner Rent section-frame description (manager description unchanged).

## 4. Out of scope
Everything else. Do NOT modify or revert any file not listed in §5 — including `.claude/launch.json` or other files you did not create in this sprint, even if they show as modified in `git status`.

## 5. Exact files expected to change
`apps/web/components/dashboard/owner-bottom-bar.tsx`, `apps/web/components/dashboard/expenses-section.tsx`, `apps/web/components/dashboard/section-renderer-support.tsx`, plus their tests. ≤ 3 non-test files.

## 6. Implementation requirements
- Tests (Vitest): bottom bar renders into `document.body` (not inside the layout container) after mount, still hidden at `lg`, items/badge/More callback intact; "Property P&L" gone and new label present; owner Rent shows the help sentence exactly once; manager Rent description unchanged.
- Run targeted vitest while working; run the full gate once at the end.
- Plain words; tokens only. The user should never need to read instructions to complete this flow; every step must be self-explanatory. No PII in logs. Do not invent URLs or emails.

## 7. Validation commands
```bash
npm run gate:web
git diff --stat
```

## 8. Acceptance criteria (binary)
- Full `gate:web` passes.
- Bottom bar is portaled to `document.body` (tests); Claude confirms in production that it is visible at the bottom of a 390×844 viewport without scrolling.
- Copy fixes per §3.2–3.3.
- Only §5 files changed; no other file modified or reverted.

## 9. Report format
Conform to `docs/codex-report-schema.json`. `self_verification.findings`: portal approach and mount guard, the two copy changes, tests added.
No "Claude prompt" sections and no recommended next steps for Claude.

## 10. Constraints
No DB apply. No deploy. No env/secret changes. No commit/push — leave the working tree for Claude.
