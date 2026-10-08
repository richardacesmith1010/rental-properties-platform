# Sprint 206b — Client status fixes (L1) · follow-up to Sprint 206 (uncommitted in the working tree; keep all of it)

## 1. Objective
Fix 3 bugs in `apps/web/lib/client-overview.ts` found in review.

## 2. Context
Sprint 206's work is uncommitted in the working tree; don't revert any of it. Live `rent_charges.status` values are `pending`, `late`, `paid` and `waived`.

## 3. In scope
1. **Waived rent is settled.** `waived` is never overdue and never "due". Only `pending` and `late` count as unpaid. A home whose only rent this month is waived and has nothing else unpaid falls through to the next-due rule, as if paid for status purposes but without the `paid` label.
   - Rule: overdue = any (`pending`|`late`) with `due_date < today`; paid = any `paid` this month; due = the earliest (`pending`|`late`) on or after today; otherwise the computed next due date.
2. **Archived homes are excluded.** The properties query adds `active` to its columns and keeps `active !== false`. Home counts and summaries use only active homes.
3. **Year-wrap-safe earliest due.** Keep an ISO `dueDate` (YYYY-MM-DD) on `ClientHome` with `status: "due"`. `summarizeClientHomes` picks the earliest by that ISO string, not by parsing `dueLabel`.

## 4. Out of scope
Everything else.

## 5. Exact files expected to change
`apps/web/lib/client-overview.ts`, `apps/web/lib/__tests__/client-overview.test.ts`.

## 6. Implementation requirements
Lines ≤ 140. No new dependencies.

## 7. Validation commands to run
- `npx vitest run apps/web/lib/__tests__/client-overview.test.ts` (or the workspace equivalent)
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`

## 8. Acceptance criteria (binary)
New real tests:
- a waived past-due rent → not overdue;
- a waived current-month rent → not "paid";
- an inactive home → not counted;
- Dec 30 vs Jan 3 → the summary picks Dec 30.

All client-overview tests pass; lint and typecheck pass.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB access, deploy, commit or push. Never touch `.claude/launch.json`.
