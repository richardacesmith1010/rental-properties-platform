# Sprint 207b — Owner statement: compare timestamps as instants (L1 fix; Sprint 207 is uncommitted in the working tree, keep it all)

## 1. Objective
`apps/web/lib/owner-statement.ts` compares `timestamptz` values as **strings** (`inMonth`, `deleted`, `waived`, and the owed `paid_at`/`reversed_at` filters) against `statementMonthWindow()` values like `2026-11-01T06:00:00.000Z`. Live Supabase returns `2026-11-01T06:00:00+00:00` (and microseconds like `.778892+00:00`). String order is wrong at exact boundaries, because `+` sorts before `.`. Fix it by comparing epoch milliseconds.

## 2. Context
Tests only used `Z` strings, which hid the bug.

## 3. In scope
1. In `owner-statement.ts`, parse `window.start` and `window.next` once to milliseconds. Use a helper `ms(value) = Date.parse(value)`, throwing on `NaN`, for every timestamp comparison: `paid_at`, `reversed_at`, `deleted_at`, `waived_at`. Date-only columns (`due_date`, `expense_date`) stay `YYYY-MM-DD` string comparisons.
2. Replace the per-charge `payments.filter(...)` in the owed loop with a `Map<chargeId, Payment[]>` built once.
3. Tests in `lib/__tests__/owner-statement.test.ts`, using **Supabase-format** strings:
   - `paid_at = "2026-11-01T06:00:00+00:00"` counts in **November**, not October;
   - `"2026-11-01T05:59:59.999999+00:00"` counts in October;
   - `deleted_at = "2026-11-01T06:00:00+00:00"` keeps the charge in October;
   - `waived_at = "2026-11-01T06:00:00+00:00"` keeps the charge owed in October;
   - `reversed_at = "2026-11-01T06:00:00+00:00"` doesn't reduce October's owed amount;
   - a malformed timestamp throws.

## 4. Out of scope
Everything else.

## 5. Exact files expected to change
`apps/web/lib/owner-statement.ts`, `apps/web/lib/__tests__/owner-statement.test.ts`.

## 6. Implementation requirements
Lines ≤ 140. No behavior change other than the comparison fix.

## 7. Validation commands to run
- `npx vitest run` on the owner-statement tests (workspace equivalent)
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`

## 8. Acceptance criteria (binary)
All new tests are real and pass. All existing owner-statement tests still pass. Lint and typecheck pass.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB access, deploy, commit or push. Never touch `.claude/launch.json`.
