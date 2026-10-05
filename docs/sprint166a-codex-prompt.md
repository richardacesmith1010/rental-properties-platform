# Sprint 166a — Code health 3a: split three big files (pure refactor)

**Severity: L2** (refactor; no behaviour change). Model: gpt-reserve, medium. One run.

## 1. Objective
Bring three of the largest web files under 500 lines each by splitting them into focused modules, with **zero behaviour change**, so future Codex runs read less code.

## 2. Context
- Branch `main`, HEAD `b252aa3` or later docs-only. Paths under `apps/web/`.
- Targets (current lines): `app/owner/owner-page-data.ts` (857 — owner server data loader: request resolution, bundle plan, section bundle loading, perf measurement, page data assembly), `components/dashboard/charges-section.tsx` (614 — Rent section with tenant / simple-rent-view / classic branches), `components/dashboard/section-renderer.tsx` (521 — section switch).
- These are imported widely (owner page, section-data API core, dashboard renderer, many tests). Existing behaviour to keep (L-014): owner bundle plan and section-data API output identical; tenant Rent (pay-state rules, hidden pay/autopay when not `can_pay`), owner/manager simple Rent view, classic view; section rendering for every role.

## 3. In scope
1. `owner-page-data.ts` → keep it as the public entry that re-exports the same names (so no importer changes), moving cohesive parts into sibling modules under `app/owner/page-data/` (e.g. `request.ts` for `resolveOwnerPageRequest`, `bundle-plan.ts` for `buildOwnerBundlePlan`/availability, `section-bundles.ts` for `loadOwnerSectionBundles`, `perf.ts` for measurement helpers). Server-only stays server-only.
2. `charges-section.tsx` → split by view into small components under `components/dashboard/charges/` (e.g. tenant list, simple rent view, classic view, shared row list/filters) behind the same `ChargesSection` export and props.
3. `section-renderer.tsx` → extract groups of section cases into small renderer modules under `components/dashboard/sections/` behind the same `SectionRenderer` export and props.
4. Every touched/new file ≤ 500 lines (aim ≤ 300). Public exports and prop types unchanged.

## 4. Out of scope / invariants
- **No behaviour, copy, layout, data, or URL change.** All existing tests must pass **unmodified**; if a test needs editing, stop and report why.
- No changes to auth, payments, server actions, the section-data API route/core logic (only import paths if a re-export isn't possible — prefer re-exports).
- Do NOT modify or revert any file not required by the split — including `.claude/launch.json`.
- No DB writes, deploy, env/secret changes, commit, or push.

## 5. Exact files expected to change
`app/owner/owner-page-data.ts`, new files under `app/owner/page-data/`, `components/dashboard/charges-section.tsx`, new files under `components/dashboard/charges/`, `components/dashboard/section-renderer.tsx`, new files under `components/dashboard/sections/`. Nothing else (importers keep working through re-exports).

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
