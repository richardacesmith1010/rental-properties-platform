# Sprint 174 — Security patch: Next.js 14.2.35 and dependency fixes (L3) · Category 6: Security & privacy

## 1. Objective
Remove the known critical and high vulnerabilities in the web app's production dependencies without changing app behaviour:
- upgrade `next` (and `eslint-config-next`) from 14.2.5 to **14.2.35**, the latest 14.2 patch;
- apply every **non-breaking** dependency fix.

Claude handles the database side separately (`supabase/migrations/20261005_sprint174_security_hardening.sql`, applied by Claude) and the Supabase dashboard setting.

## 2. Context
- Branch `main`, HEAD at or after the commit that adds this packet.
- Next.js 14 App Router, deployed on Vercel. Middleware exists (`apps/web/middleware.ts`).
- `npm audit --omit=dev` run in `apps/web` (2026-10-05) found:
  - **critical:** `next` (fix: `next@14.2.35`);
  - **high, non-breaking fix available:** `axios`, `brace-expansion`, `browserslist`, `fast-glob`, `form-data`, `glob`, `globby`, `js-yaml`, `minimatch`, `nanoid`, `picomatch`, `postcss` (via next), `source-map-js`, `ws`;
  - **high, fix only through Tailwind 4 (breaking):** `tailwindcss`, `braces`, `chokidar`, `micromatch`. These are **out of scope**: build-time only, and accepted and documented by Claude.
- The repo is an npm workspace (`apps/web`, `apps/mobile`). `apps/mobile` is a stale Expo app. **Do not touch it** or its dependencies.

## 3. In scope
1. In `apps/web/package.json`, set `next` and `eslint-config-next` to `14.2.35`, exactly as currently pinned style (no caret, if none today).
2. Run `npm audit fix` (never `--force`) so only non-breaking fixes are applied. Use whichever scope updates the lockfile correctly for the web workspace without changing `apps/mobile`'s resolved versions. If the root-level command also bumps mobile packages, revert those lockfile changes.
3. Fix anything the upgrade breaks: types, lint rules, build warnings that become errors, and tests. Keep behaviour identical. Note in particular:
   - Next 14.2.x patch changes to `redirect`/`notFound` typing;
   - `next/image` and `headers()` changes;
   - middleware matcher behaviour.
4. Re-run `npm audit --omit=dev` in `apps/web`. Report the remaining critical/high list. It must contain only the Tailwind-4-only chain (`tailwindcss`, `braces`, `chokidar`, `micromatch`) or packages that have no non-breaking fix (name them with the reason).

## 4. Out of scope
- Tailwind 4, React 19, or Next 15 upgrades.
- `apps/mobile`.
- Any feature or copy change, the DB, Supabase settings, deploy.
- `.claude/launch.json`, `docs/`, `CLAUDE.md`, `AGENTS.md`.

## 5. Exact files expected to change
- `apps/web/package.json`
- `package-lock.json` (root workspace lockfile)
- Only if required by the upgrade: the minimal source or test files needed to keep typecheck, lint, build and tests green. List each one with the reason.

## 6. Implementation requirements
- No `--force` and no `--legacy-peer-deps` unless the upgrade cannot install otherwise. If you need it, explain why.
- No new dependencies.
- Middleware and auth behaviour must be unchanged. Do not edit `middleware.ts` unless the build requires it; if you do, explain.

## 7. Validation commands to run
- `npm run gate:web` (full gate: tests, lint, typecheck, build, mobile typecheck)
- `cd apps/web && npm audit --omit=dev`
- `node -e "console.log(require('next/package.json').version)"` from `apps/web` → `14.2.35`

## 8. Acceptance criteria (binary)
1. `next` resolves to `14.2.35` in `apps/web`. `eslint-config-next` is `14.2.35`.
2. `npm audit --omit=dev` (web) shows **0 critical**. Every remaining high is in the Tailwind-4-only chain, or is listed with "no non-breaking fix".
3. `npm run gate:web` passes fully.
4. `apps/mobile/package.json` is unchanged, and mobile's resolved versions in the lockfile are unchanged.
5. Only §5 files changed. Every extra file is listed with its reason.

## 9. Report format
JSON per `docs/codex-report-schema.json`. In `self_verification.findings`, include the before/after audit counts, the remaining high list, and any source change the upgrade forced. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB writes, deploy, commit or push. Never modify or revert files outside §5 (the extras must be justified). Never touch `.claude/launch.json`.
