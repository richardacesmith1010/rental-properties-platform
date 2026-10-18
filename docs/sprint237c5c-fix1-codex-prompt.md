# Sprint 237c-5c fix 1 — make four UI tests real (test-only, L3 sprint)

## 1. Objective
Four facts in your uncommitted 5c tests are under-asserted or vacuous (L-017, L-030). Make them real. No app code
changes. `docs/sprint237c5c-codex-prompt.md` (rev 3.1) stays the spec.

## 2. Context
- Uncommitted 5c work on top of the committed 5a+5b. 20 UI tests and the full suite (2,890) are green.
- `manager-invite-entry-points.test.tsx:13-16` mocks `useFormState` so the returned state is always `null`. Inline
  `FormError`/`FormSuccess` can therefore never render, so "no error text renders twice" (:100, :112, :124, :134) and
  "re-render without a submit does not toast" (:142-143, :151-152) pass whatever the code does.
- `invite-manager-form.test.tsx:120-134` checks only part of the draft after an error and after a success.

## 3. In scope
T1-T4 below.

## 4. Out of scope
Any file outside §5. App code. Copy.

## 5. Exact files expected to change
- `apps/web/components/dashboard/__tests__/manager-invite-entry-points.test.tsx`
- `apps/web/components/__tests__/invite-manager-form.test.tsx`

## 6. Implementation requirements
- **T1** Replace the always-`null` `useFormState` mock with one whose returned state the test can set (or use the real
  `useFormState` with the real wrapper and a stubbed action). Then: render a row whose resend/revoke state is an error
  (`{ success: false, error: "They already signed in. No email was sent." }`) and assert that text is NOT in the DOM
  (errors are toasts only). Same for the revoke error. These replace the vacuous `queryByText` checks.
- **T2** C2 (iii): with a settable error state already present, re-render the section with unchanged props and no
  submit → `toast.error` and `toast.success` call counts do not change.
- **T3** Add one Revoke test that submits by clicking the row's Revoke button (`fireEvent.click` / submit the form), with
  the action stubbed to return `{ success: true, message: "Invitation revoked." }` → `toast.success` once with that text.
  This proves the `<form action>` wiring uses the wrapped action.
- **T4** C1 draft: after a server error, assert the review still shows `Homes: Maple Home`, the email and the name, and
  that a second Send posts `email` and `fullName` unchanged in FormData. After success, advance and assert the email and
  name fields are empty and no home is picked.

## 7. Validation commands
```
(cd apps/web && npx vitest run components/dashboard/__tests__/manager-invite-entry-points.test.tsx \
  components/__tests__/invite-manager-form.test.tsx)
(cd apps/web && npx vitest run --reporter=dot)
(cd apps/web && npx tsc --noEmit)
npm run lint:web
```
Do NOT run `npm run gate:web`.

## 8. Acceptance criteria
1. T1-T4 implemented; each named in the report with file:line.
2. Mutation proofs (revert each): MT1 re-add `<FormError state={resendState} />` in `InvitationRow` → T1 fails. MT2 add
   a `useEffect` in `InvitationRow` that toasts `resendState.error` on every render → T2 fails. MT3 pass the raw
   `onRevokeInvite` to `useFormState` → T3 fails. MT4 reset the draft on error → T4 fails.
3. M16, M17, M23, M24 still caught. Full suite, tsc, lint green.

## 9. Report format
Compact status only: files changed with line counts, T item → file:line, mutation results, command results.
Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
- Only the files in §5. No new dependencies. Exact copy only. Lines ≤ 140 characters; files ≤ 500 lines.
