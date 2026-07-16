# Sprint 127b — Grooming: remove dead exports + junk transcript doc

## 1. Objective
Reduce token waste (CLAUDE.md §12 / AGENTS.md §13): delete a ~115k-token agent transcript mis-saved as a doc, and remove verified-dead exports flagged in the Sprint 53 audit. No behavior change.

## 2. Context
- Branch `main`, HEAD `35242f3` (sprint 127 shipped + verified live).
- `docs/feature-inventory-2026-05-08.md` is a raw agent JSONL transcript (69 lines of giant JSON, ~115k tokens), not a usable doc.
- `docs/agent-handoff.md` "Efficiency Audit (Sprint 53)" flagged candidate dead exports that need verification before removal.

## 3. In scope
- Delete `docs/feature-inventory-2026-05-08.md`.
- For each candidate export below: grep the ENTIRE repo (`apps/`, `packages/`, `scripts/`) for the symbol, excluding its own definition file. If it has **zero** importers/callers outside its own file and test files, remove the export (plus any private helper used only by it, and update/remove any test that existed only to cover it). If it IS referenced anywhere in non-test code, **leave it** and report it as kept.
  - `apps/web/lib/analytics.ts`: `buildLastTwelveMonths`, `average`, `overlapMonth`
  - `apps/web/lib/csv-export.ts`: `downloadCSV`
  - `apps/web/lib/distribution-approvals.ts`: `getCurrentDistributionConfigForAccount`

## 4. Out of scope
- No behavior changes, no refactors beyond removing the dead symbols, no renames, no new files.
- Do NOT remove anything still imported anywhere — verify first (L-006).
- No DB, no deploy, no env changes.

## 5. Exact files expected to change
- `docs/feature-inventory-2026-05-08.md` (delete)
- `apps/web/lib/analytics.ts`, `apps/web/lib/csv-export.ts`, `apps/web/lib/distribution-approvals.ts` — only the exports confirmed unused
- Any `__tests__` file that referenced a removed export
Touch nothing else without flagging why.

## 6. Implementation requirements
- Verify-before-remove: for each symbol, run a full-tree grep; removal is allowed ONLY when there are zero non-test, non-self references.
- `average` is also an English word — match the identifier at import/call sites, not prose, to avoid false "in use" positives.
- If removing an export orphans a private helper used only by it, remove that helper too.
- Keep any export that is still used; do not force-remove.

## 7. Validation commands
```bash
npm run gate:web
```

## 8. Acceptance criteria (binary)
- `gate:web` passes (a green gate proves nothing still imports what was removed).
- `docs/feature-inventory-2026-05-08.md` no longer exists.
- Each of the 5 candidate exports is either removed (confirmed zero-importer) OR explicitly reported as kept-because-used, citing the using file.
- No files changed outside §5.

## 9. Report format (required booleans)
`gate_passed`, `junk_doc_deleted`; plus `exports_removed` (list) and `exports_kept_used` (list of `{symbol, used_by}`). Files changed. No "Claude prompt" / "next steps" sections.

## 10. Constraints
Grooming only. No DB, no deploy, no env changes. Do NOT `git commit` or `git push` — leave all changes UNCOMMITTED in the working tree for Claude to review, gate, and commit. Report the required booleans at the end.
