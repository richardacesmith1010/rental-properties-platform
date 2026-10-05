# Sprint 165 — Code health 2/3: split dashboard navigation and shell by role (pure refactor)

**Severity: L2** (refactor; no behaviour change). Model: gpt-reserve, medium. One run.

## 1. Objective
Separate owner, manager, and shared logic in the dashboard navigation hook and shell so one role can no longer break another (the Sprint 158 bug class), and so future sprints read smaller files. **Zero behaviour change for every role.**

## 2. Context
- Branch `main`, HEAD `8d86591` or later docs-only. Paths under `apps/web/`.
- `components/dashboard/dashboard-section-loaders.ts` (381 lines, 46 role checks): one `useDashboardNavigation(props, kpis)` that mixes owner (section cache `navigateOwnerDashboard`, owner URL sync effect, hover/focus preload), manager (manager URL sync effect with query-change guard, `history.replaceState` in `openSection`), and shared logic (`navigationAvailability`, `allSectionItems`, command palette, wizard open/close). Used by `components/dashboard/dashboard-data-loader.tsx`.
- `components/dashboard/index.tsx` (470 lines, 23 role checks): `PageHeader` still accepts `pageCountLabel`/`onPrevious`/`onNext` and the shell still wires `goToPreviousSection`/`goToNextSection` for non-managers although owners no longer show arrows (Sprint 154) — verify whether anything renders them; if provably unreachable, remove.
- Invariants that must survive (L-014): owner section cache + URL tracking + preload on hover/focus; owner legacy `?mode=` dropping; manager `?section=` written on switch and kept after reload/`router.refresh()` (query-change-only resync); manager/owner Add menus (owner 4 items, manager 2); tenant pages don't use this hook.

## 3. In scope
1. Split the hook into: `useSharedDashboardNavigation` (availability, section items, command palette, wizards), `useOwnerNavigation`, and `useManagerNavigation`, composed by a thin `useDashboardNavigation` that returns **exactly the same shape** (`DashboardNavigationState` unchanged) so callers don't change. New files under `components/dashboard/navigation/` (name them).
2. In `index.tsx`, extract role-specific pieces into small components (e.g. owner header actions vs manager header) where it reduces branching; remove the previous/next arrow plumbing only if a whole-tree grep + tests prove it unreachable for every role.
3. Each new file ≤ 250 lines; `dashboard-section-loaders.ts` becomes a thin composer (or re-export) ≤ 120 lines.

## 4. Out of scope / invariants
- **No behaviour, copy, layout, or URL change.** All existing tests must pass **unmodified** (this is a pure refactor — if a test needs editing, stop and report why instead).
- No changes to `owner-section-cache.ts` logic, server code, data loaders, or tenant files.
- Do NOT modify or revert any file not listed in §5 — including `.claude/launch.json`.
- No DB writes, deploy, env/secret changes, commit, or push.

## 5. Exact files expected to change
`components/dashboard/dashboard-section-loaders.ts`, `components/dashboard/index.tsx`, new files under `components/dashboard/navigation/`, and new unit tests for the split hooks (optional). Nothing else.

## 6. Implementation requirements
- Validation (Claude runs the full gate): lint, typecheck, the FULL unit suite (`cd apps/web && npx vitest run` — refactors can break anything), and `npm run build:web`.
- Report before/after line counts and role-check counts (`isOwnerRole|isManagerRole`) for each touched file.
- No PII in logs.

## 7. Validation commands
```bash
npm run lint:web
npx tsc -p apps/web/tsconfig.json --noEmit
cd apps/web && npx vitest run && cd ../..
npm run build:web
git diff --stat
```

## 8. Acceptance criteria (binary)
- Lint, typecheck, full vitest (with **zero** existing test files modified), and build pass.
- `DashboardNavigationState` shape unchanged; new files ≤ 250 lines; composer ≤ 120 lines.
- Only §5 files changed; nothing else modified or reverted.

## 9. Report format
Conform to `docs/codex-report-schema.json` (set `gate_passed` from the checks above). Findings: new file list with line counts, before/after role-check counts, whether arrow plumbing was removed (and the proof), confirmation that no existing test file changed.
No "Claude prompt" sections and no recommended next steps for Claude.

## 10. Constraints
No DB apply. No deploy. No env/secret changes. No commit/push — leave the working tree for Claude.
