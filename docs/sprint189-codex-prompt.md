# Sprint 189 — Label the lease "Manage" edit boxes (L1) · Categories 1 (Owner) / 10 (Visual)

## 1. Objective
On the owner Leases screen, clicking **Manage** on an active lease opens edit boxes with **no labels**. An owner sees six number/date boxes (e.g. "25, 0, 1, 5, 0, date") and cannot tell rent from deposit, due day, grace days or late fee. The Renew boxes (4) and the End Lease note box have the same problem. Give every one a visible label that is tied to its input, so it also works with screen readers.

## 2. Context
- Branch `main`, HEAD `be2055d` or a later docs-only commit. Next 15.5, Tailwind, React `useFormState`.
- File: `apps/web/components/dashboard/leases-section.tsx` (495 lines). Relevant blocks:
  - lines ~185–213: "Edit Rent Amount" form. It is already labeled correctly and is the **pattern to copy**:
    `<label className="block text-xs font-medium text-muted-foreground" htmlFor={\`lease-rent-amount-${lease.id}\`}>` + `<Input id=...>`.
  - lines ~215–275: Manage edit form (`updateAction`), six unlabeled `<Input>`s: `monthlyRentDollars`, `depositDollars`, `dueDayOfMonth`, `gracePeriodDays`, `lateFeeDollars`, `endDate`; then `LeaseCollectionSetting` and the Save button.
  - lines ~295–330: Renew form (`renewAction`), four unlabeled `<Input>`s: `newStartDate`, `newEndDate`, `newMonthlyRentDollars`, `newDueDayOfMonth`.
  - lines ~350–358: End Lease form (`terminateAction`), unlabeled `<Textarea name="terminationReason">` (placeholder only).
- The file is 495 lines; adding labels inline would push it over 500 (repo rule: no source file > 500 lines). So move the whole Manage panel (the `activeEditLeaseId === lease.id` block: edit form + Renew card + End Lease card) into a new component.
- Plain-language rules: `docs/plain-language.md`. A test guard enforces banned words.

## 3. In scope
1. **New file** `apps/web/components/dashboard/lease-manage-panel.tsx` (`"use client"`), exporting `LeaseManagePanel`. It renders exactly what the Manage block renders today (same forms, same `name`s, same `min/max/step/required/defaultValue`, same buttons, button text and `title`s, same classes and layout), plus labels. Props: `lease`, the three form actions (`updateAction`, `renewAction`, `terminateAction`), `isActiveLease`, and the renew/terminate open-state values and setters that the block uses today. Keep the existing state in `leases-section.tsx`; just pass it down. Move `addDays`/`addYears` usage along with it (import from wherever they come from today; do not duplicate them).
2. `leases-section.tsx` renders `<LeaseManagePanel ... />` in place of the block. Remove any imports that become unused.
3. **Labels:** each field gets a `<label>` with the existing class `block text-xs font-medium text-muted-foreground`, `htmlFor` pointing to a unique input `id` of the form `lease-<field>-${lease.id}`. Wrap each label and input in `<div className="space-y-1">` (in the edit grid, the wrapper is the grid cell). Exact label text:

   | Input `name` | Label |
   |---|---|
   | `monthlyRentDollars` | `Monthly rent ($)` |
   | `depositDollars` | `Deposit ($)` |
   | `dueDayOfMonth` | `Rent due day (1–28)` |
   | `gracePeriodDays` | `Days before rent is late (0–30)` |
   | `lateFeeDollars` | `Late fee ($)` |
   | `endDate` | `Lease end date` |
   | `newStartDate` | `New start date` |
   | `newEndDate` | `New end date` |
   | `newMonthlyRentDollars` | `New monthly rent ($)` |
   | `newDueDayOfMonth` | `New rent due day (1–28)` |
   | `terminationReason` | `Why is this lease ending?` (keep the placeholder) |

4. **Tests** in `apps/web/components/__tests__/leases-section.test.tsx` (13 `it(` today):
   - Render an active lease with controls, click **Manage**, and assert `getByLabelText` finds each of the six edit labels; for each, assert the input's `name` and its default value (e.g. rent 25 → value "25", due day → lease's due day).
   - Open **Renew** and assert the four renew labels map to inputs with the right `name`s.
   - Open **End Lease** and assert `getByLabelText("Why is this lease ending?")` is the `terminationReason` textarea.
   - All 13 existing tests stay green, unchanged unless a test queried by a moved structure (if so, say which and why).

## 4. Out of scope
- The "Edit Rent Amount" form (already labeled), `LeaseCollectionSetting`, the delete form, server actions, validation, `lease-section-presentation.tsx`, other screens, any wording other than §3.3.
- Deploy, commit, `.claude/launch.json`, `docs/`, `CLAUDE.md`, `AGENTS.md`.

## 5. Exact files expected to change
- `apps/web/components/dashboard/leases-section.tsx`
- `apps/web/components/dashboard/lease-manage-panel.tsx` (new)
- `apps/web/components/__tests__/leases-section.test.tsx`

## 6. Implementation requirements
- Use the exact label text in §3.3; do not invent other wording. The en dash in "1–28" / "0–30" is U+2013.
- Form `name`s, input attributes, button labels/titles and action wiring must be byte-identical to today. The forms must still submit the same fields.
- Lines ≤ 140 characters; both components ≤ 500 lines; no compaction (L-015).
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory.

## 7. Validation commands to run
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- `npm run test --workspace @domus/web -- --run components/__tests__/leases-section.test.tsx`
- Also run every other test file that imports `leases-section` (find with `grep -rl "leases-section" apps/web --include=*.test.tsx`).

## 8. Acceptance criteria (binary)
1. All 11 inputs have a visible label from §3.3, linked by `htmlFor`/`id`; ids are unique per lease.
2. Field names, attributes, defaults, buttons and actions are unchanged.
3. New tests cover every label → input mapping in §3.4 with real assertions; existing 13 tests pass.
4. Lint, typecheck and targeted tests pass; only §5 files changed; both files ≤ 500 lines, lines ≤ 140 chars.
5. **Claude, after deploy:** smoke owner → Leases → Manage on the Smoke Test Property lease, plus Renew and End Lease opened (not submitted), at 1280 px and 375 px, light and dark; labels readable; 0 console errors; smoke specs, Sentry clean, CI green.

## 9. Report format
JSON per `docs/codex-report-schema.json`. List the new test names. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB access, no deploy, commit or push. Never touch `.claude/launch.json`. No new dependencies.
