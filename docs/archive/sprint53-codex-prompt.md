# Sprint 53 — Codex Implementation Prompt

## 1. Objective

Repository cleanup: archive old sprint prompt docs, remove stale untracked files, update agent-handoff.md to current state, and run an efficiency audit on the codebase.

## 2. Context

- **Branch**: `main`
- **HEAD**: (use latest after Sprint 52)
- **Gate baseline**: all unit tests passing, lint clean, typecheck clean, build clean
- **Problem**: 30+ untracked sprint prompt files in docs/, stale test-results directories, old migration files that were never applied, and agent-handoff.md is outdated

## 3. In Scope

### Part A: Archive Sprint Docs
1. Create `docs/archive/` directory
2. Move all completed sprint prompt files (`docs/sprint17-codex-prompt.md` through `docs/sprint53-codex-prompt.md`) to `docs/archive/`
3. Keep only `docs/agent-handoff.md` and `docs/stripe-live-mode-checklist.md` in the active docs root

### Part B: Clean Up Untracked Files
1. Remove `apps/web/test-results/` and `apps/web/test-results 2/` directories (test artifacts)
2. Remove `test-results/` at repo root
3. Add `test-results/` to `.gitignore` if not already present
4. Remove `ChatGPT Image Mar 8, 2026, 09_22_16 PM.png` (stray image file)

### Part C: Update agent-handoff.md
Update `docs/agent-handoff.md` to reflect the current state of all features after Sprints 39-52:
- Sprint 39: Ops monitoring (health endpoint, cron history, ops dashboard)
- Sprint 40: Error recovery (retry utility, Promise.allSettled, sideEffectError expansion, Stripe degradation)
- Sprint 41-42: Account governance (rename individual/LLC, delete LLC with voting, UI polish)
- Sprint 43: Performance optimization (parallel queries, lazy-load sections, component splits)
- Sprint 44: Dashboard KPIs (6 cards, rent collection bar, status colors, trends)
- Sprint 45: Property drill-down (property selector, breadcrumbs, property summary card)
- Sprint 46: Visual polish (empty states, shadow cards, typography)
- Sprint 47: Command palette + notification feed
- Sprint 48: Inline editing, batch ops, tenant portal
- Sprint 49: E2E test coverage (55 tests)
- Sprint 50: Dark mode fixes
- Sprint 51: Mobile responsiveness
- Sprint 52: Onboarding improvements

Include:
- Current test counts (unit + E2E)
- Current production URL
- Pending user action items (env vars)
- Feature status matrix

### Part D: Efficiency Quick Scan
1. Check for any files over 500 lines in `apps/web/components/` — report if found
2. Check for dead exports (exported functions never imported) in `apps/web/lib/` — report top 5 if found
3. Check for duplicate component names across different directories
4. Report findings but do NOT fix them (just document)

## 4. Out of Scope

- Code changes to application logic
- New features
- Database migrations
- CLAUDE.md edits (Claude owns this file per §16)
- AGENTS.md edits by this sprint

## 5. Exact Files Expected to Change

### New
1. `docs/archive/` directory with all moved sprint docs

### Modified
1. `docs/agent-handoff.md` — complete rewrite to current state
2. `.gitignore` — add test-results entries if missing

### Deleted
1. `apps/web/test-results/` directory
2. `apps/web/test-results 2/` directory
3. `test-results/` directory
4. `ChatGPT Image Mar 8, 2026, 09_22_16 PM.png`

## 6. Implementation Requirements

### Moving Files
```bash
mkdir -p docs/archive
mv docs/sprint17-codex-prompt.md docs/archive/
mv docs/sprint18-codex-prompt.md docs/archive/
# ... repeat for all sprint prompts through sprint53
```

### .gitignore Additions
```
# Test artifacts
test-results/
apps/web/test-results/
**/test-results/
```

### agent-handoff.md Structure
```markdown
# Domus — Agent Handoff Document

Last updated: 2026-03-16

## Production
- URL: https://domusbase.com
- Supabase: vawqdqkaguhdgfhdebqw
- Vercel: deployed, production

## Test Coverage
- Unit tests: ~540+
- E2E tests: 55/55 passing
- Gate: npm run gate:web
- Smoke: APP_URL=https://domusbase.com npm run smoke:web
- E2E: cd apps/web && APP_URL=https://domusbase.com npx playwright test

## Feature Status Matrix
[Table of all features with status: shipped/pending/blocked]

## Pending User Actions
- Set RESEND_API_KEY + RESEND_FROM_EMAIL in Vercel
- Set PLAID_CLIENT_ID + PLAID_SECRET + PLAID_ENV in Vercel
- Complete docs/stripe-live-mode-checklist.md

## Pending Migrations
- supabase/migrations/20260315_sprint41_account_rename_delete.sql (4 governance tables)

## Architecture Notes
[Brief description of key patterns: feature capabilities, status colors, retry utility, etc.]
```

### Efficiency Report
At the end of agent-handoff.md, add an "Efficiency Audit" section with findings from the scan. Format as a table:

```markdown
## Efficiency Audit (Sprint 53)

| Finding | File | Action Needed |
|---------|------|---------------|
| ... | ... | ... |
```

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] All sprint prompt files moved to `docs/archive/`
2. [ ] `docs/` root contains only `agent-handoff.md`, `stripe-live-mode-checklist.md`, and `archive/`
3. [ ] Test results directories deleted
4. [ ] Stray PNG file deleted
5. [ ] `.gitignore` includes test-results patterns
6. [ ] `agent-handoff.md` reflects all features through Sprint 52
7. [ ] Feature status matrix is complete and accurate
8. [ ] Efficiency findings documented
9. [ ] `npm run gate:web` passes
10. [ ] No application code changes

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_MOVED: [count]
FILES_DELETED: [count]
AGENT_HANDOFF_UPDATED: yes | no
EFFICIENCY_FINDINGS: [count]
TESTS_UNIT: xxx/xxx
LINT: clean | [errors]
BUILD: clean | [errors]
NOTES: [any issues]
```

## 10. Constraints

- Do NOT modify application source code
- Do NOT create database migrations
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md (Claude owns it per §16)
- Do NOT modify AGENTS.md
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Do NOT delete docs/stripe-live-mode-checklist.md or any migration files in supabase/migrations/
- Only delete explicitly listed files — no wildcard deletions
