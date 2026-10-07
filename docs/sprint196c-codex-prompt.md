# Sprint 196c — Fix flaky bank-feed test (L1: test only)

## 1. Objective
CI run #355 failed on `apps/web/components/__tests__/bank-feed-shell.test.tsx:53` ("closes Change when a second import replaces a row at the same index"): `expect(queryByRole("combobox", { name: "Type" })).not.toBeInTheDocument()` found the select still present. Locally it passes 15/15, so it's a timing race: the Change panel closes in a later render than the one where "Second bill" first appears.

## 2. Context
Branch `main`, HEAD current. No app code changed in this area today.

## 3. In scope
Make the final assertion wait: wrap line ~53 in `await waitFor(() => expect(screen.queryByRole("combobox", { name: "Type" })).not.toBeInTheDocument());`. Also look for the same immediate-after-waitFor pattern in this file's other cases and make them wait if they assert UI that updates asynchronously (list each). Do not change app code.

## 4. Out of scope
App code, other test files, deploy, commit, `.claude/launch.json`, `docs/`.

## 5. Exact files expected to change
`apps/web/components/__tests__/bank-feed-shell.test.tsx`

## 6. Implementation requirements
Lines ≤ 140 chars. No new dependencies. The user should never need to read instructions to complete this flow.

## 7. Validation commands to run
Run the file 20 times in a loop and report passes; `npm run lint:web`; `npx tsc --noEmit -p apps/web/tsconfig.json`.

## 8. Acceptance criteria (binary)
20/20 passes; lint and typecheck pass; only §5 file changed.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB access, no deploy, commit or push. Never touch `.claude/launch.json`.
