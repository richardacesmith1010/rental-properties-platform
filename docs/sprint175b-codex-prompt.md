# Sprint 175b — Declare the web app's undeclared dependencies after workspace isolation (L2) · Category 6: Security & privacy

## 1. Objective
Sprint 175's uncommitted working tree took `apps/mobile` out of the npm workspace. A clean `npm ci` then showed two dependencies the web app uses but never declared. They had only resolved before through hoisting from the mobile workspace:
1. `server-only`, imported by `apps/web/lib/bank-feed/fingerprint.ts`, `rules.ts`, `file-item.ts` and others. Vitest fails with "Failed to resolve import server-only".
2. `@typescript-eslint/eslint-plugin` and `@typescript-eslint/parser`. Lint fails loading `@typescript-eslint`. They are declared only in the root `package.json` devDependencies, at `^7.2.0`.

Declare them correctly, so a clean install plus the full gate passes.

## 2. Context
- Working tree: the Sprint 175 changes are uncommitted (`package.json`, `package-lock.json`, `scripts/gate-web.sh`, `apps/mobile/README.md`). Keep them.
- Next 15.5.27 and React 19.2.8 must stay pinned.
- Use the `server-only` version Next 15.5.27 expects, the same one it vendors/peers (check `node_modules/next/package.json` or npm). For `@typescript-eslint/*`, use versions compatible with the repo's ESLint and `eslint-config-next@15.5.27`; prefer the same major already used (`^7.2.0`) if it is compatible.

## 3. In scope
1. Add `server-only` to `apps/web/package.json` **dependencies**.
2. Add `@typescript-eslint/eslint-plugin` and `@typescript-eslint/parser` to `apps/web/package.json` **devDependencies**. Keep or remove the root duplicates, whichever makes `npm ci` + lint resolve cleanly; explain which you chose.
3. Run `npm install` to update the lockfile. Do not delete the lockfile; the sandbox forbids `rm -rf`, so use `npm install` and `npm ci`.
4. Prove it from clean: run `npm ci` (it replaces `node_modules`), then `npm run gate:web`.
5. Re-run `npm audit --omit=dev` in `apps/web`. It must not get worse than Sprint 175's result: 0 critical; highs only on the Tailwind 3 chain (`braces`, `chokidar`, `micromatch`, `fast-glob`, `tailwindcss`) and `postcss` via Next.

## 4. Out of scope
Source code changes, Tailwind 4, Next 16, Supabase or Anthropic SDK major upgrades, `apps/mobile` files, `.claude/launch.json`, `docs/`, `CLAUDE.md`, `AGENTS.md`.

## 5. Exact files expected to change
`apps/web/package.json`, `package.json` (only if the root devDependencies change), `package-lock.json`.

## 6. Implementation requirements
No `--force` or `--legacy-peer-deps`. No other new dependencies. The lockfile must still list no `apps/mobile` workspace.

## 7. Validation commands to run
- `npm ci`
- `npm run gate:web`
- `cd apps/web && npm audit --omit=dev`

## 8. Acceptance criteria (binary)
1. `npm ci` followed by `npm run gate:web` passes fully: all tests (1,372 expected), lint, typecheck and build.
2. `server-only` is in the web dependencies. `@typescript-eslint/*` resolve for the web lint.
3. Audit: 0 critical. Highs only in the Tailwind 3 chain and `postcss`.
4. The lockfile has no `apps/mobile` entries. Next is 15.5.27 and React 19.2.8.
5. Only §5 files changed (plus the uncommitted Sprint 175 files).

## 9. Report format
JSON per `docs/codex-report-schema.json`. Include the test count, the audit summary and the versions chosen. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB writes, deploy, commit or push. Never touch `.claude/launch.json`.
