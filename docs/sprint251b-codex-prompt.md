# Sprint 251b — "Unit D added." shows twice after saving a unit (L1 bug found by 251a)

## 1. Objective
251a's new test `apps/web/components/__tests__/unit-form-confirmation.test.tsx` shows `toast.success("Unit D added.")`
is called **twice** for one success state (expected once). `components/dashboard/forms/unit-form.tsx:92-107` guards
with `handledStateRef` (`useRef`, line 67), yet the toast fires twice. Not StrictMode (none configured). Find the real
cause and fix it so one save shows one confirmation. Keep all 251a tests (uncommitted in the tree — keep them).

## 2. Context
HEAD: see `git log -1`. The only toast call site is `unit-form.tsx:105`. Effect deps:
`[draft.unitNumber, getDefaultPropertyId, onUnitCreated, state]`. Suspects to check (report which one it was, with
evidence): the effect reading `draft.unitNumber` after `setDraft` resets it; the component remounting (new ref) when
the step resets; `getDefaultPropertyId` identity changing; a second effect or handler also reacting to success.

## 3. In scope
Fix in `unit-form.tsx` only. Capture the unit number for the message at the moment of success (not from a draft
that is being reset), and make the "handle this success once" guard robust to re-renders and remounts within the
same form instance.

## 4. Out of scope
Other forms, copy, styling.

## 5. Exact files expected to change
- `apps/web/components/dashboard/forms/unit-form.tsx`
- `apps/web/components/__tests__/unit-form-confirmation.test.tsx` (only if the test itself is wrong — explain)

## 6. Implementation requirements
Lines ≤ 140 characters.

## 7. Validation
```
cd apps/web
npx vitest run components/__tests__/unit-form-confirmation.test.tsx components/__tests__/lease-wizard-confirmation.test.tsx \
  components/__tests__/lease-wizard-rent-prefill.test.tsx lib/__tests__/lease-wizard.test.ts \
  components/__tests__/tenant-invite-wizard.test.tsx components/__tests__/needs-you-list.test.tsx
```
then from the repo root `npm run gate:web`.

## 8. Acceptance criteria
- U1 The 251a T1 test passes unchanged: exactly one `toast.success("Unit D added.")`, `onUnitCreated` once, form reset,
  no second toast on rerender with the same state.
- U2 A second, distinct success state (save another unit "E") shows "Unit E added." once more (total 2) — add this case.
- U3 All 251a tests (31) and the gate pass (counts verbatim). Report the root cause in one sentence.

## 9. Report format
Compact status only. Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact
status only.

## 10. Constraints
Stay inside §5. Do not commit. The user should never need to read instructions to complete this flow: one save, one
message.
