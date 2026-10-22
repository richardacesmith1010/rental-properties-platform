# Sprint 251a — Pay the Sprint 160 test debt (O2, O4, O5) (L1, tests only)

## 1. Objective
Sprint 160 shipped three owner-setup behaviors whose focused tests were skipped twice. Add tests that pin the
**current** behavior. No source changes.

## 2. Context
HEAD `1329a60`. Behavior today:
- **O2 confirmations.** `components/dashboard/forms/unit-form.tsx:92-107`: on `state.success` it resets the draft
  (blank unit number, 1 bed, 1 bath, blank rent, default property), returns to step 0, calls
  `toast.success(\`Unit ${unitNumber} added.\`)` once per state (`handledStateRef`).
  `components/dashboard/lease-wizard.tsx:324-330`: on success `toast.success("Lease created for <name>.")`, then
  `onOpenChange(false)`, `onOpenSection("leases")`, `router.refresh()`.
- **O4 rent pre-fill.** `lease-wizard-support.tsx:111-113` initial draft uses `(cents/100).toFixed(2)` when there is
  exactly one unit; `lease-wizard.tsx:200-202` re-fills on property change (one unit) else blanks;
  `lease-wizard.tsx:207-210` and `tenant-invite-wizard.tsx:96-99` fill rent when a unit is selected and the field is
  empty, never overwriting typed text. `tenant-invite-wizard.tsx:270` step-2 button "Skip — you'll add rent later"
  (no trailing period).
- **O5 joined prompt.** `components/dashboard/owner-home/needs-you-list.tsx:39-42` row "<Name> joined. Set up their
  lease" (first invite only, no period). Existing tests cover the filter (`dashboard-home-loader.test.tsx:120-144`) and
  the label/order (`needs-you-list.test.tsx:13-26`), not the click. Manager card `owner-daily-ops-home.tsx:134-139`
  "<Name> joined. Set up their lease." + "Set up lease".

## 3. In scope
New/extended tests only (§8). If a test reveals a real bug, stop and report it — do not change source.

## 4. Out of scope
Any file under `apps/web` that is not a test.

## 5. Exact files expected to change
- `apps/web/components/__tests__/unit-form-confirmation.test.tsx` (new)
- `apps/web/components/__tests__/lease-wizard-confirmation.test.tsx` (new)
- `apps/web/lib/__tests__/lease-wizard.test.ts` (extend: initial draft rent)
- `apps/web/components/__tests__/lease-wizard-steps.test.tsx` or a new `lease-wizard-rent-prefill.test.tsx`
- `apps/web/components/__tests__/tenant-invite-wizard.test.tsx` (extend)
- `apps/web/components/__tests__/needs-you-list.test.tsx` (extend)

## 6. Implementation requirements
Mock `sonner` (`toast.success`/`toast.error`) and `next/navigation`. Assert exact strings with `toEqual`/`toHaveBeenCalledWith`.
No `expect` inside mock implementations (L-028). Lines ≤ 140 characters.

## 7. Validation
```
cd apps/web
npx vitest run components/__tests__/unit-form-confirmation.test.tsx components/__tests__/lease-wizard-confirmation.test.tsx \
  lib/__tests__/lease-wizard.test.ts components/__tests__/tenant-invite-wizard.test.tsx components/__tests__/needs-you-list.test.tsx
```
then from the repo root `npm run gate:web`.

## 8. Acceptance criteria
- T1 Unit form: fill unit "D", rerender with action state `{ success: true }` → `toast.success` called exactly once
  with "Unit D added."; `onUnitCreated` called once; unit-number field empty; step 0 shown; rerender with the **same**
  state object → still exactly one toast.
- T2 Lease wizard (existing tenant "Angel Hernandez"), stub action returns `{ success: true }` →
  `toast.success("Lease created for Angel Hernandez.")`, `onOpenChange(false)`, `onOpenSection("leases")`.
  Invite-new mode → the toast uses `tenantFullName`. Failure `{ success: false, error: "X" }` → "X" shown, no toast.
- T3 Initial draft: one vacant unit at 235000 cents → `monthlyRentDollars === "2350.00"`; two units → `""`.
- T4 Lease wizard: selecting a unit at 185000 → Monthly rent field "1850.00"; type "1900", reselect → stays "1900".
- T5 Invite wizard: same pre-fill as T4; step 2 has a button named exactly "Skip — you'll add rent later"; clicking it
  submits without a `monthlyRentDollars` field.
- T6 Needs-you list with a connected bank and `joinedWithoutLease: [{ fullName: "Dana", propertyId: "p1" }]`: click
  "Dana joined. Set up their lease" → `onSelectProperty("p1")` and `onOpenLeaseWizard` once; `propertyId: null` →
  `onSelectProperty` not called; two invites → only the first row appears.
- T7 Gate green (counts verbatim).

## 9. Report format
Compact status only: test files and test names → T1–T7, counts. Do NOT include 'Claude prompt' or 'recommended next
steps for Claude' sections. Report compact status only.

## 10. Constraints
Tests only; stay inside §5. Do not commit. The user should never need to read instructions to complete this flow (no UI
change).
