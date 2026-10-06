# Sprint 175 — Security: isolate the stale mobile workspace, then fix the remaining web dependency advisories (L3) · Category 6: Security & privacy

Revision 2 — ChatGPT verdict APPROVE WITH CHANGES. Adopted: the audit acceptance is deterministic, Claude proves the build on a Vercel preview, the lockfile isolation is asserted, and node/npm versions are recorded.

## 1. Objective
After Sprint 174, `npm audit --omit=dev` in `apps/web` shows 0 critical and 9 high. 8 of the 9 are fixable without breaking changes, but applying them changes resolutions shared with the stale `apps/mobile` Expo workspace.
- Take `apps/mobile` out of the npm workspace. Keep the folder and its files untouched, but it no longer shares the root lockfile.
- Then apply every non-breaking fix, so the web production dependencies have **0 critical and 0 high**, except anything that genuinely has no non-breaking fix (expected: `postcss`, bundled by Next, whose fix needs Next 16).

## 2. Context
- Branch `main`, HEAD at or after the commit adding this packet. Next.js 15.5.27 + React 19.2.8 (Sprint 174).
- Root `package.json` has `"workspaces": ["apps/*"]` and the scripts `dev:mobile`, `typecheck:mobile`. `scripts/gate-web.sh` (lines ~42–43) runs `npx tsc -p apps/mobile/tsconfig.json --noEmit`. `.github/workflows/ci.yml` has no mobile steps.
- Vercel project `rental-properties-platform-web` has Root Directory `apps/web`, the Next.js preset, and default npm install and build.
- The mobile app was abandoned around Sprint 23. The scorecard plans to rebuild the phone app later (a wrapped store build), so mobile does not need to build in this repo's gate.
- Remaining highs after Sprint 174: `brace-expansion`, `braces`, `fast-glob`, `globby`, `js-yaml`, `micromatch`, `minimatch`, `picomatch`, `postcss`.

## 3. In scope
1. Root `package.json`:
   - set `"workspaces": ["apps/web"]`;
   - remove the `dev:mobile` and `typecheck:mobile` scripts;
   - add one line to `apps/mobile/README.md` (create it if missing): "Archived. Not part of the npm workspace or the web gate. Install inside this folder if revived."
2. `scripts/gate-web.sh`: remove the mobile typecheck stage, and its echo line, entirely.
3. Regenerate the root `package-lock.json` for the web-only workspace with `npm install`. Do not hand-edit it.
4. Run `npm audit fix` (never `--force`) in the root/web scope. Re-run `npm audit --omit=dev` in `apps/web`.
5. Make sure a clean install reproduces the build: `rm -rf node_modules apps/web/node_modules && npm ci && npm run gate:web`.
6. Write down the remaining audit list with a reason for each item.

## 4. Out of scope
- Deleting `apps/mobile`, or changing any file inside it other than adding `README.md`.
- Tailwind 4, Next 16, or any app source or behaviour change.
- The DB, deploy, `.claude/launch.json`, `docs/`, `CLAUDE.md`, `AGENTS.md`.

## 5. Exact files expected to change
- `package.json`
- `package-lock.json`
- `scripts/gate-web.sh`
- `apps/mobile/README.md` (new)
- `apps/web/package.json`: only if `npm audit fix` must bump a direct dependency, with the reason.

## 6. Implementation requirements
- No new dependencies. No `--force` and no `--legacy-peer-deps`.
- Next must stay exactly `15.5.27` and React exactly `19.2.8` after the fixes.
- If `npm audit fix` proposes a major bump of a **direct** dependency, do not apply it. Report it instead.

## 7. Validation commands to run
- `rm -rf node_modules apps/web/node_modules && npm ci`
- `npm run gate:web`
- `cd apps/web && npm audit --omit=dev`
- `node -e "console.log(require('next/package.json').version, require('react/package.json').version)"` from `apps/web` → `15.5.27 19.2.8`

## 8. Acceptance criteria (binary)
1. Root workspaces equal `["apps/web"]`. The gate script has no mobile stage. `apps/mobile` files are byte-identical except the new README.
2. A clean `npm ci` followed by `npm run gate:web` passes (all web tests, lint, typecheck, build).
3. `npm audit --omit=dev` (web): **0 critical**. Every currently listed high except `postcss` is **eliminated**:
   `brace-expansion`, `braces`, `fast-glob`, `globby`, `js-yaml`, `micromatch`, `minimatch`, `picomatch`.
   The only allowed exception is one where npm's actual resolved graph proves there is no non-breaking path under the pinned Next 15.5.27 / React 19.2.8. Each exception must name the package, the dependency path, the advisory ID, and the breaking or direct-major upgrade it would need.
4. Next 15.5.27 and React 19.2.8 are unchanged.
5. Only §5 files changed.
6. The regenerated `package-lock.json` lists `apps/web` as a workspace and contains **no** `apps/mobile` workspace entry or `node_modules` graph rooted at it. Assert this with a grep or JSON check, and include the output in the report.
7. The report records the `node -v` and `npm -v` used for lockfile regeneration and for the clean `npm ci`.

## 9. Report format
JSON per `docs/codex-report-schema.json`. In `self_verification.findings`, include the before/after audit counts, the remaining items with reasons, and confirmation of the clean `npm ci` + gate. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 9b. Vercel proof (Claude)
Before production, Claude pushes the change to a non-`main` branch and confirms the Vercel **preview** deployment builds successfully, with Root Directory `apps/web` and the default npm install. Production deploys only after that preview build passes.

## 10. Constraints
No DB writes, deploy, commit or push. Never touch `.claude/launch.json`. Never delete `apps/mobile`.
