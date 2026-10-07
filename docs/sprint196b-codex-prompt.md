# Sprint 196b — "rent bill" → "payment" (L1: copy only, same working tree as Sprint 196)

## 1. Objective
Sprint 196 replaced "charge" with "rent bill" in owner-facing fallback strings. The repo word list (CLAUDE.md §18) says owners see **"payment"**, and Sprint 194 already uses "View payment" / "Waive payment". "Rent bill" is also wrong for late fees. Change every "rent bill" string from Sprint 196 to the payment wording below.

## 2. Context
Uncommitted Sprint 196 changes are in the working tree; keep them. Only the strings below change.

## 3. In scope (exact)
- `components/dashboard/charge-row.tsx:~219` and `components/reports/drilldown-panel.tsx:~130`: `Rent bill has been edited.` → `Payment has been edited.`
- `components/dashboard/actionable-notification.tsx:~141,146`, `components/dashboard/charges/charges-implementation.tsx:~251,254`, `components/reports/drilldown-panel.tsx:~88,91`: `Unable to waive this rent bill.` → `Unable to waive this payment.`; `Rent bill waived.` → `Payment waived.`
- `charges-implementation.tsx:~233,236`, `drilldown-panel.tsx:~69,72`: `Unable to delete this rent bill.` → `Unable to delete this payment.`; `Rent bill deleted.` → `Payment deleted.`
- `charges-implementation.tsx:~419`: `Collapse the rent bills preview.` → `Collapse the payments preview.`; `Show all rent bills.` → `Show all payments.`
- `charges-implementation.tsx:~431–432`: `rent bill of` → `payment of`; `Delete this rent bill? This cannot be undone.` → `Delete this payment? This cannot be undone.`
- `charge-edit-modal.tsx:~72`: `Rent bill updated.` → `Payment updated.`; `charge-create-form.tsx:~67`: `Rent bill created.` → `Payment created.`
- Update any test asserting the "rent bill" strings.
Do not touch `leasing-hub-section.tsx` ("rent billing") or `charge-section-controls.tsx`.

## 4. Out of scope
Everything else. Deploy, commit, `.claude/launch.json`, `docs/`.

## 5. Exact files expected to change
The 6 component files above plus any test asserting those strings (under `apps/web/`).

## 6. Implementation requirements
Exact copy. Lines ≤ 140 chars. The user should never need to read instructions to complete this flow.

## 7. Validation commands to run
`grep -rni "rent bill" apps/web/app apps/web/components apps/web/lib` returns nothing; `npm run lint:web`; `npx tsc --noEmit -p apps/web/tsconfig.json`; tests importing the changed files; `lib/__tests__/plain-language.test.ts`.

## 8. Acceptance criteria (binary)
The grep returns nothing; tests, lint, typecheck pass; only §5 files changed beyond Sprint 196's.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB access, no deploy, commit or push. Never touch `.claude/launch.json`.
