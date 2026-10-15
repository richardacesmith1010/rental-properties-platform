# Sprint 235c — Onboarding re-walk leftovers R2–R6 (L2) — rev 1

## 1. Objective
Fix the five small issues found in the 2026-10-15 onboarding re-walk (`docs/onboarding-walk-2026-10-15.md`, "Re-walk"
section) so a new owner lands on Home after setup, sees the bank step when it matters, and never meets a misleading
empty Rent page or a cut-off "Invite sent".

## 2. Context
- HEAD `f4f8d68` (main). 235a/235b are live.
- **R2.** After the add-home wizard, "Go to Home" lands on Homes. `components/dashboard/index.tsx:276-281`:
  `closePropertyWizard(); if (propertyId) sectionRendererProps.onSelectProperty(propertyId);
  sectionRendererProps.openSection(isOwnerRole ? "home" : "overview");`. Live: URL becomes
  `?section=portfolio&property=<id>` and Homes is shown. Selecting a property appears to switch the owner to Homes after
  `openSection("home")`. `finishSetup` in `components/dashboard/unified-property-wizard.tsx:258-266` also calls
  `router.refresh()` before `onComplete`.
- **R3.** The success-screen bank line (`components/dashboard/property-wizard-drafts.tsx:207-216`) shows only when
  `bankConnected === false`, but the owner wizard (`index.tsx:265-283`) never passes `bankConnected`. The owner's status
  is already in `props.stripeConnected` (`app/owner/page.tsx:218`, used at `index.tsx:121,256`).
- **R4.** `RentEmptyState` (`components/dashboard/charge-section-controls.tsx:113-133`) shows "No matching rent /
  No rent matches this filter right now." whenever the owner has any rent row at all, even when the selected home has an
  active lease and no rent yet (live: home filter = "Walk Test Home 2").
- **R5.** The simple-view link "Add this month's rent now" (`charge-section-controls.tsx:50-60`) has
  `title="Generate rent payments for the current billing period."` — hover/accessible text differs from the visible
  label and uses jargon.
- **R6.** Owner Home pass card (`components/dashboard/owner-home/home-pass-card.tsx:19,41`) joins names and
  " · Invite sent" into one `truncate` span; live at 1440 px it shows "Sam Tester · Invite s…".

## 3. In scope
R2–R6 exactly as in §6.

## 4. Out of scope
Money logic, the 235a undo flow, wizard fields, manager flows (manager keeps `"overview"`), emails.

## 5. Exact files expected to change
1. `apps/web/components/dashboard/index.tsx`
2. `apps/web/components/dashboard/charge-section-controls.tsx`
3. `apps/web/components/dashboard/charges/charges-implementation.tsx` (only to pass what `RentEmptyState` needs)
4. `apps/web/components/dashboard/owner-home/home-pass-card.tsx`
5. Tests: `apps/web/components/__tests__/unified-property-wizard.test.tsx` or a dashboard index test,
   `apps/web/components/__tests__/charges-section.test.tsx`, `apps/web/components/__tests__/wallet-home.test.tsx`
   (and a new small test file if no existing one fits — name it in the report).

## 6. Implementation requirements
1. **R2.** After the owner finishes the wizard, the dashboard shows the owner **Home** section and the URL has
   `section=home` (no `section=portfolio`). Find why `onSelectProperty` wins (order, a later effect, or the refresh) and
   fix it at the cause; keep the new property selected only if that does not change the section. Managers unchanged.
2. **R3.** Pass `bankConnected={props.stripeConnected === true}` to the owner wizard so not-connected owners see
   "Connect your bank so tenants can pay online." (existing copy and rules: tenant invited and not outside Domus).
3. **R4.** `RentEmptyState` gets the active-lease count **for the current home filter** (all homes when unfiltered).
   When the filtered home has an active lease and no rent row for the current month: title `No rent yet`, text
   `This month's rent shows up by tomorrow morning.` and the `Add this month's rent now` link — even if other homes
   have rent. Otherwise keep today's copy.
4. **R5.** That link's `title` becomes `Add this month's rent now.` (simple view) and `Generate this month's rent.`
   (full view) — matching the visible text.
5. **R6.** Render "Invite sent" as its own `shrink-0` element after the (still truncating) names, so it is never cut.
6. Plain language (`docs/plain-language.md`): no banned words; sentences ≤ 12 words. Lines ≤ 140 chars; files ≤ 500 lines.
7. The user should never need to read instructions to complete this flow.

## 7. Validation commands
```
cd apps/web && npx vitest run components/__tests__/charges-section.test.tsx components/__tests__/wallet-home.test.tsx \
  components/__tests__/unified-property-wizard.test.tsx lib/__tests__/plain-language.test.ts
cd apps/web && npx vitest run --reporter=dot
cd apps/web && npx tsc --noEmit
npm run lint:web
```
Do NOT run `npm run gate:web`. Claude runs it.

## 8. Acceptance criteria (tests that call real code)
1. R2: owner `onComplete(propertyId)` results in the Home section being the active section (and no later switch to
   portfolio); manager still opens overview.
2. R3: owner with `stripeConnected` false, tenant invited, not outside Domus → success screen shows the bank line and
   link; `stripeConnected` true → no bank line.
3. R4: owner has rent on home A; filter = home B with an active lease and no rent → title `No rent yet`, timing text,
   and the add-now link. Filter = home B with no lease → "Rent will appear here after you create a lease."
4. R5: link `title` equals the visible text plus a period, in both views.
5. R6: with `invitePending`, "Invite sent" is in its own element without the `truncate` class.
6. Full suite green; plain-language test green with no new exceptions.

## 9. Report format
Compact status only: files changed with line counts, tests per criterion, command results, and one line on the R2
root cause. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
Only the files in §5. No new dependencies. No migrations.
