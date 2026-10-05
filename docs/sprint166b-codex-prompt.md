# Sprint 166b — Code health 3b: split three more big files (pure refactor)

**Severity: L2** (refactor; no behaviour change). Model: gpt-reserve, medium. One run.

## 1. Objective
Bring the remaining three large dashboard components under 500 lines each by splitting them into focused modules, with **zero behaviour change**.

## 2. Context
- Branch `main`, HEAD = Sprint 166a commit or later docs-only. Paths under `apps/web/`.
- Targets: `components/dashboard/unified-property-wizard.tsx` (777 — multi-step property/unit/lease wizard used by owners and managers), `components/dashboard/leases-section.tsx` (738 — lease list, edit, renew, end, rent change, pays-outside flag), `components/dashboard/inbox-section.tsx` (~526 — owner/manager inbox with Timeline/Threads + tenant simple chat from Sprint 163 + tenant composer from Sprint 162).
- Behaviour to keep (L-014): owner Add → Add a home opens this wizard; post-create jump to Homes; lease edit/renew/end/rent change; "Pays outside Domus" badge + flag; owner/manager inbox tabs and reply; tenant chat ("You" bubbles, reply box, composer when no thread, multi-home picker).

## 3. In scope
1. `unified-property-wizard.tsx` → step components under `components/dashboard/property-wizard/` (one per step + shared state/types), same default/ named exports and props.
2. `leases-section.tsx` → row/edit/renew/end/rent-change pieces under `components/dashboard/leases/`, same `LeasesSection` export and props.
3. `inbox-section.tsx` → split the owner/manager inbox and the tenant chat into separate components under `components/dashboard/inbox/` (shared message list/composer pieces where they are truly shared), same `InboxSection` export and props (it can choose the tenant or staff view internally).
4. Every touched/new file ≤ 500 lines (aim ≤ 300). Public exports and prop types unchanged.

## 4. Out of scope / invariants
- **No behaviour, copy, layout, data, or URL change.** All existing tests must pass **unmodified**; if a test needs editing, stop and report why.
- No changes to server actions (`app/actions/**`), auth, payments, `lib/inbox.ts`.
- Do NOT modify or revert any file not required by the split — including `.claude/launch.json`.
- No DB writes, deploy, env/secret changes, commit, or push.

## 5. Exact files expected to change
`components/dashboard/unified-property-wizard.tsx`, `components/dashboard/leases-section.tsx`, `components/dashboard/inbox-section.tsx`, and new files under `components/dashboard/property-wizard/`, `components/dashboard/leases/`, `components/dashboard/inbox/`. Nothing else.

## 6. Implementation requirements
- Validation (Claude runs the full gate): lint, typecheck, the FULL unit suite, and the production build.
- Report before/after line counts per original file and the new file list with line counts; confirm zero existing test files changed.

## 7. Validation commands
```bash
npm run lint:web
npx tsc -p apps/web/tsconfig.json --noEmit
cd apps/web && npx vitest run && cd ../..
npm run build:web
git diff --stat
```

## 8. Acceptance criteria (binary)
- Lint, typecheck, full vitest (zero existing test files modified), and build pass.
- The three originals ≤ 500 lines; every new file ≤ 500; public exports/props unchanged.
- Only §5 files changed; nothing else modified or reverted.

## 9. Report format
Conform to `docs/codex-report-schema.json` (set `gate_passed` from the checks above). Findings: before/after line counts, new files with line counts, confirmation no test file changed.
No "Claude prompt" sections and no recommended next steps for Claude.

## 10. Constraints
No DB apply. No deploy. No env/secret changes. No commit/push — leave the working tree for Claude.
