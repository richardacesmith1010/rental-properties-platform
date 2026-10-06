# Sprint 177 — Scheduled production smoke + cron freshness check (L2) · Category 7: Reliability & monitoring

## 1. Objective
1. Run the full production smoke automatically every day through GitHub Actions. GitHub emails the repo owner when a scheduled workflow fails.
2. Make it detectable when the daily rent-charge cron stops running: add a cron freshness endpoint and check it in the smoke.

## 2. Context
- Branch `main`, HEAD `8549e3d` or a later docs-only commit. Next 15.5.27. npm workspaces = `["apps/web"]`.
- `scripts/smoke-web.sh` runs the production smoke. It requires `APP_URL` plus `SMOKE_OWNER_EMAIL/PASSWORD`, `SMOKE_MANAGER_EMAIL/PASSWORD` and `SMOKE_TENANT_EMAIL/PASSWORD`, and runs the Playwright specs (auth, theme, a11y, keyboard, mobile layout). Locally, a clean `npm ci` needs `npx playwright install chromium` before smoke.
- The existing `.github/workflows/ci.yml` runs on push/PR with Node 20. Leave it unchanged.
- Vercel crons (`apps/web/vercel.json`):
  - `/api/cron/generate-charges` daily at 08:00 UTC;
  - `/api/cron/verify-stripe-accounts` daily at 06:00 UTC.
- Table `cron_runs` has columns `(id, job_name, started_at, completed_at, status, operations jsonb, error, created_at)`. Check how the cron routes write `job_name` and `status` values (`apps/web/app/api/cron/*/route.ts`, `lib/*cron*`).
- The health route `apps/web/app/api/health/route.ts` uses `lib/health.ts` (`buildHealthPayload`, `checkSupabase`, `checkStripe`), and returns 503 when not ok. Smoke expects `/api/health` to be 200. **Do not add the cron check to `/api/health`.** A stale cron must not make the main health endpoint fail.
- GitHub secrets for the smoke credentials will be added by the owner. Reference them by the exact env names above.

## 3. In scope
1. **New route `apps/web/app/api/health/cron/route.ts`**, unauthenticated and read-only, `dynamic = "force-dynamic"`, with `Cache-Control: no-store`. It uses the admin client to read the latest successful run per job for `generate-charges` and `verify-stripe-accounts`, using the real `job_name` values. It returns:
   `{ ok, jobs: [{ job, lastSuccessAt, ageHours, stale }] }`
   - `stale` when there is no success within 26 hours;
   - status 200 when every job is fresh, 503 when any is stale.
   - The response holds no operations data and no error text.
   - Put the pure staleness logic in `lib/health.ts` (or a new `lib/cron-health.ts`), with unit tests for: fresh; 25 h; 27 h; no runs; failed-only runs (counted as stale).
2. **`scripts/smoke-web.sh`:** after the `/api/health` check, call `/api/health/cron`. On a non-200, print the JSON body and exit 1.
3. **New workflow `.github/workflows/smoke.yml`:**
   - name "Production smoke";
   - triggers: `schedule` daily at `30 13 * * *` (13:30 UTC, after both crons) and `workflow_dispatch`;
   - one job on `ubuntu-latest`, Node 24 with the npm cache, `npm ci`, `npx playwright install --with-deps chromium` (run in `apps/web`), then `APP_URL=https://domusbase.com npm run smoke:web`;
   - env from secrets: the six `SMOKE_*` and `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` if the smoke helpers need them (check `tests/e2e/helpers.ts` and the specs; include only what is needed);
   - upload Playwright `test-results/` as an artifact on failure;
   - `timeout-minutes: 20`;
   - concurrency group so runs never overlap.
   - No step may echo secrets.

## 4. Out of scope
- Changes to `ci.yml`, the cron jobs' own logic, Sentry configuration (Claude does that in the Sentry UI), notifications to users.
- `.claude/launch.json`, `docs/`, `CLAUDE.md`, `AGENTS.md`.

## 5. Exact files expected to change
- `apps/web/app/api/health/cron/route.ts` (new)
- `apps/web/lib/health.ts` or `apps/web/lib/cron-health.ts` (new)
- tests: `apps/web/lib/__tests__/cron-health.test.ts` (new) and a route test `apps/web/app/api/health/cron/__tests__/route.test.ts` (new)
- `scripts/smoke-web.sh`
- `.github/workflows/smoke.yml` (new)

## 6. Implementation requirements
- Read-only. Never log row contents. Check the query `error` and return 503 with a fixed message on a DB error.
- Each line at most 140 characters.

## 7. Validation commands to run
- `npm run gate:web`
- `npx vitest run` on the new tests (from `apps/web`)
- `bash -n scripts/smoke-web.sh`
- Validate the workflow YAML parses (for example `python3 -c "import yaml,sys;yaml.safe_load(open('.github/workflows/smoke.yml'))"` if PyYAML is available; otherwise say so).

## 8. Acceptance criteria (binary)
1. Unit tests cover the 5 staleness cases. Route tests cover: 200 when fresh; 503 when stale; 503 with a fixed message on a DB error; no operations or error text in the body; the `no-store` header.
2. The smoke script calls `/api/health/cron` and fails on a non-200.
3. `smoke.yml` matches §3.3 exactly, with no secret echoing.
4. The gate passes. Only §5 files changed.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Include the real `job_name` values found. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB writes, deploy, commit or push. Never touch `.claude/launch.json`. No new dependencies.
