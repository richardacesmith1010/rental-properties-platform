# Sprint 164 — Code health 1/3: remove proven-dead code (knip)

**Severity: L2** (deletions of unused code only; no behaviour change). Model: gpt-reserve, medium. One run.

## 1. Objective
Shrink the web app by deleting files, exports, and dependencies that are provably unused, so later refactors and every future Codex run read less code. Zero behaviour change.

## 2. Context
- Branch `main`, HEAD `cd6cd79` or later docs-only. Web app at `apps/web/` (Next.js 14 App Router; route entry points are `app/**/page.tsx`, `layout.tsx`, `route.ts`, `error.tsx`, `not-found.tsx`, `loading.tsx`, `middleware.ts`, `instrumentation*.ts`, `sentry.*.config.ts`, `next.config.mjs`; tests in `**/__tests__/**` and `tests/e2e/**`; scripts in `/scripts`).
- A naive grep scan flagged hundreds of "unused exports" with many false positives — so use a real tool: run `npx knip` (do NOT add it to package.json) with a temporary config you pass via `--config` from a file you create under your scratch area or `apps/web/knip.tmp.json` (delete it before finishing).

## 3. In scope
1. Run knip for the web workspace (entry points as in §2; include `vitest` and `playwright` plugins so tests count as users). Produce three lists: unused **files**, unused **exports** (incl. types), unused **dependencies**.
2. **Verify each candidate yourself** before deleting: whole-repo grep for the file/export name (L-006), incl. dynamic imports, string-based references, `next/dynamic`, route conventions, and tests. Anything with any doubt stays.
3. Delete: unused files; unused exports (remove the `export` or the dead function, whichever leaves no dead code); unused npm dependencies from `apps/web/package.json` (update the lockfile with `npm install` — network is enabled).
4. **Never touch** (even if knip flags them): `lib/stripe*.ts`, `lib/stripe-webhook-handlers.ts`, `app/api/webhooks/**`, `app/actions/charges.ts`, `app/actions/charge-management.ts`, `app/actions/account-wipe.ts`, `app/actions/inbox.ts`, anything under `app/api/cron/**`, `lib/plaid.ts` + `app/actions/plaid.ts` (kept for the upcoming bank-feed work), `supabase/**`, `scripts/**`, `.claude/**`, migrations, env files.
5. Report the before/after totals: files, lines of non-test TS/TSX under `apps/web/{app,components,lib}`, and dependencies.

## 4. Out of scope / invariants
- No refactors, renames, or moves; no behaviour or UI change; no test weakening (delete a test file only if it exclusively tests deleted dead code — say which).
- Do NOT modify or revert any file not required by a verified deletion — including `.claude/launch.json`.
- No DB writes, deploy, env/secret changes, commit, or push.

## 5. Exact files expected to change
Only deletions/`export` removals in `apps/web/{app,components,lib}/**` (excluding §3.4), `apps/web/package.json` + `package-lock.json` (dependency removals), and test files that only covered deleted code. List every file in the report.

## 6. Implementation requirements
- Validation (Claude runs the full gate): `npm run lint:web`, `npx tsc -p apps/web/tsconfig.json --noEmit`, the FULL unit suite `cd apps/web && npx vitest run` (deletions can break anything), and `npm run build:web`.
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
- Lint, typecheck, full vitest, and build pass.
- Every deletion verified by whole-repo grep; nothing from §3.4 touched; temporary knip config removed.
- Report lists deleted files/exports/deps and before/after totals.

## 9. Report format
Conform to `docs/codex-report-schema.json` (set `gate_passed` from the checks above). Findings: counts deleted (files/exports/deps), before/after line totals, anything knip flagged that you kept and why (top 10).
No "Claude prompt" sections and no recommended next steps for Claude.

## 10. Constraints
No DB apply. No deploy. No env/secret changes. No commit/push — leave the working tree for Claude.
