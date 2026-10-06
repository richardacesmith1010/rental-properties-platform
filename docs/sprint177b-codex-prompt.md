# Sprint 177b — Record verify-stripe-accounts runs in cron_runs (L2) · Category 7: Reliability & monitoring

## 1. Objective
Sprint 177 (uncommitted in the tree) added `/api/health/cron`, which reports a job as stale when it has no successful `cron_runs` row within 26 h. You found that `/api/cron/verify-stripe-accounts` never writes `cron_runs`, so it would always be stale and the daily smoke would always fail.

Make `verify-stripe-accounts` record its runs exactly the way `generate-charges` does: same helper, same `status` values. `job_name` is `verify-stripe-accounts`.

## 2. Context
- Find how `generate-charges` writes `cron_runs`: the started row, the completion, `status` success or failure, `operations` and `error`. Reuse the same helper. If the logic is inline, extract a small shared helper and use it in both routes; that counts as in scope.
- Keep the auth (`CRON_SECRET`) check first, unchanged.
- Record a failure row with a fixed error message on exceptions. Never put secrets or Stripe account IDs into `error`.

## 3. In scope
1. `apps/web/app/api/cron/verify-stripe-accounts/route.ts` writes `cron_runs` on start and on completion (success or failure).
2. The shared helper, if extracted, plus tests:
   - the route records success on a normal run;
   - the route records failure with a fixed message when verification throws;
   - an unauthorized request writes nothing.
3. `cron-health` keeps checking both jobs.

## 4. Out of scope
The verification logic itself, the schedules, other crons. `.claude/launch.json`, `docs/`, `CLAUDE.md`, `AGENTS.md`.

## 5. Exact files expected to change
- `apps/web/app/api/cron/verify-stripe-accounts/route.ts`
- the existing cron-run helper file, or a new `apps/web/lib/cron-runs.ts`
- `apps/web/app/api/cron/generate-charges/route.ts`, only if you switch it to the shared helper (behaviour unchanged)
- tests for the above

## 6. Implementation requirements
Check every insert and update error. Logs use fixed names only. Each line at most 140 characters.

## 7. Validation commands to run
`npm run gate:web`

## 8. Acceptance criteria (binary)
1. The new tests pass; the existing generate-charges tests are unchanged and passing.
2. The gate passes. Only §5 files changed, plus the uncommitted Sprint 177 files.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB writes outside tests, no deploy, commit or push. Never touch `.claude/launch.json`. No new dependencies.
