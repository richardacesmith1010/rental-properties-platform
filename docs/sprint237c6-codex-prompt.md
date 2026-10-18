# Sprint 237c-6 — Fix the flaky wizard test (L1, test-only)

## 1. Objective
Make `apps/web/components/__tests__/unified-property-wizard.test.tsx` stop failing at random in CI. Test-only change.

## 2. Context
- HEAD `0e4a85c` (docs-only since `240667d`). The file has 97 lines.
- `reachSuccess` (:9-49) ends with `await waitFor(() => expect(action).toHaveBeenCalledOnce())`. That waits for the action
  call, not for the success screen to render.
- Three tests then read the success screen synchronously with `getByText`: :72 ("We emailed Maya an invite."), :78
  ("Connect your bank so tenants can pay online."), :84 ("We emailed Maya an invite."). CI failed at :72 on `83154c8`
  (passed on re-run of the same app code). The tests at :54 and :62 already use `await screen.findByText(...)`.

## 3. In scope
- Wait for the success screen before the first synchronous assertion in the tests at :66, :76 and :82.

## 4. Out of scope
- Any app code. Any other test file. `reachSuccess` itself. Changing what any test asserts.

## 5. Exact files expected to change
1. `apps/web/components/__tests__/unified-property-wizard.test.tsx`

## 6. Implementation requirements
- :72 and :84 → `expect(await screen.findByText("We emailed Maya an invite.")).toBeInTheDocument();`
- :78 → `expect(await screen.findByText("Connect your bank so tenants can pay online.")).toBeInTheDocument();`
- Every other line stays byte-identical. Lines ≤ 140 characters.

## 7. Validation commands
```
(cd apps/web && for i in 1 2 3 4 5; do npx vitest run components/__tests__/unified-property-wizard.test.tsx || exit 1; done)
(cd apps/web && npx tsc --noEmit)
npm run lint:web
```

## 8. Acceptance criteria
1. `git diff --stat` shows only the one file, 3 lines changed.
2. The three lines above use `await screen.findByText(...)` with the same text; no assertion was removed or weakened.
3. Five consecutive runs of the file pass; tsc and lint pass.

## 9. Report format
Compact status only: the diff line count, the 5 run results, tsc and lint results.
Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
- Only the file in §5. No new dependencies. Do not run `npm run gate:web`.
