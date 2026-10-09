# Sprint 207c — PDF drops the minus sign on negative amounts (L1 hotfix)

## 1. Objective
Live check: the owner statement PDF shows the reversal row as `$1,400.00` instead of a negative amount. `money()` in `apps/web/lib/pdf/owner-statement-template.tsx:21` prefixes U+2212 (`−`), and the built-in PDF font (Helvetica) has no glyph for it, so it renders as nothing. Use ASCII `-`.

## 2. Context
Sprint 207 is live (`a919e08`). The CSV is correct (`-1400.00`).

## 3. In scope
1. In the PDF template, negative amounts render as `-$1,400.00` (ASCII hyphen-minus U+002D). Export `formatStatementMoney` from the template for testing.
2. Test in `lib/__tests__/owner-statement-pdf.test.tsx`:
   - `formatStatementMoney(-140000) === "-$1,400.00"` and it contains no U+2212;
   - `formatStatementMoney(5)` is `$0.05` and `formatStatementMoney(-5)` is `-$0.05`;
   - render a statement with a reversal line through `renderToBuffer`, and assert the buffer is a PDF (starts with `%PDF`).

## 4. Out of scope
Anything else. The sheet UI uses its own formatting; leave it.

## 5. Exact files expected to change
`apps/web/lib/pdf/owner-statement-template.tsx`, `apps/web/lib/__tests__/owner-statement-pdf.test.tsx`.

## 6. Implementation requirements
Lines ≤ 140.

## 7. Validation commands to run
- The PDF test file
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`

## 8. Acceptance criteria (binary)
The tests pass, and lint and typecheck pass.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB access, deploy, commit or push. Never touch `.claude/launch.json`.
