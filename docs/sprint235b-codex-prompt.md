# Sprint 235b — Onboarding fixes from the live walk (L2) — rev 2 (adds R1 from the 235a live walk)

## 1. Objective
Fix the onboarding findings from the 2026-10-15 live walk (`docs/onboarding-walk-2026-10-15.md`) that are not money
logic: F15, K5, F5, K6, F8, F10, F13. Goal: a brand-new owner and tenant never meet a wrong message, a guessed name,
or a dead end between sign-up and first rent.

## 2. Context
- HEAD `9d8433b` (main, 235a shipped). Shares `charges-implementation.tsx` and `charge-more-menu.tsx` with 235a; **do not touch any file listed in 235a** (tenant rent card,
  pay card, charges.ts, charge-more-menu, charges-implementation lines 68/95/366/388-405).
- **F15 (owner Rent page).**
  - Empty state `components/dashboard/charges/charges-implementation.tsx:347-356`: owner text
    "Rent will appear here after you create a lease." even when a lease exists. `availableLeases` (active leases) is
    already a prop (`render-section-cases.tsx:81-87`).
  - Simple view line `:275-276` "Rent is added each month from your leases."
  - Generate link hidden for owners/managers: `components/dashboard/charge-section-controls.tsx:46`
    `onGenerateChargesHref && !simpleRentView` (label "Generate this month's rent"); `simpleRentView` is true for
    owners and managers (`render-section-cases.tsx:78`). Route `app/owner/generate/route.ts` → `?generated=<msg>`
    shown by `components/dashboard/index.tsx:353-356`.
  - Messages `lib/charge-generation.ts:487-489` "Generated N new charge(s)." / "No new charges generated (already up
    to date)." contain the banned word "charge".
- **K5 (tenant name guessed from email).** `app/actions/unified-setup.ts:23-30` `getTenantDisplayName`, used at `:91`;
  flows to `invitations.full_name`, auth metadata `full_name`, the invite email greeting, and `profiles.full_name`.
  Wizard step `components/dashboard/property-wizard-steps.tsx:338` (`LeaseStep`, tenant email at 406-418); draft
  `components/dashboard/property-wizard-drafts.tsx:31-39,63-72,133-135`; payload
  `components/dashboard/unified-property-wizard.tsx:236` (file is at 500 lines); schema
  `lib/validations-lease.ts:52-126` (`unifiedSetupLeaseSchema`).
- **F5 (owner first name = email prefix).** DB trigger `handle_new_user` falls back to the email local part. UI:
  `app/onboarding/page.tsx:24-28,67`, `components/onboarding/onboarding-form.tsx:23-33,64-66`. Fix in the UI only.
- **K6 (pays outside Domus / due day).** Reuse `components/dashboard/lease-collection-setting.tsx` ("Tenant pays outside
  Domus"). Due day field pattern `components/dashboard/forms/lease-form-step.tsx:230-240` (1–28). Server:
  `unified-setup.ts:17-21` (`clampDueDay`) and `:185`; `createLeaseSchema` already accepts `collectsOutsideDomus`
  (`validations-lease.ts:27`), written at `lease-mutations.ts:98`.
- **F8 (success screen).** `components/dashboard/property-wizard-drafts.tsx:173-217`; "Go to Dashboard" calls
  `onComplete` → `components/dashboard/index.tsx:276-282` opens "portfolio" (Homes). Tests
  `components/__tests__/unified-property-wizard.test.tsx:31,35,50`.
- **F10 (no "invite sent" state).** `lib/owner-wallet-home.ts:20,165-167` gives each active lease only
  `tenantNames, rentCents, nextDueDate`; rendered in `components/dashboard/owner-home/home-pass-card.tsx:18` and
  `components/dashboard/owner-homes/homes-wallet.tsx:24,36`. `invitations` has `email, property_id, role, status`.
- **F13.** `components/dashboard/tenant-rent-card.tsx:154` "You can pay once it's posted." — **owned by 235a**; 235b
  does not change it (235a's "Next rent … on <date>" line replaces this case).
- Plain-language guard `lib/plain-language/scan.ts`: banned words include charge(s), onboarding, transaction(s),
  submit; sentences ≤ 12 words.

## 3. In scope
F15, K5, F5, K6, F8, F10 and R1 as specified in §6.

## 4. Out of scope
Money calculations, rent generation timing (keep current + next month), tenant rent/pay cards, the DB trigger, emails
other than the invite greeting name, LLC flows, manager wizard differences beyond what shared code needs.

## 5. Exact files expected to change
1. `apps/web/components/dashboard/charges/charges-implementation.tsx` (empty state + simple-view line only)
2. `apps/web/components/dashboard/charge-section-controls.tsx`
3. `apps/web/lib/charge-generation.ts` (two message strings only)
4. `apps/web/components/dashboard/property-wizard-steps.tsx`
5. `apps/web/components/dashboard/property-wizard-drafts.tsx`
6. `apps/web/components/dashboard/unified-property-wizard.tsx` (must stay ≤ 500 lines)
7. `apps/web/lib/validations-lease.ts`
8. `apps/web/app/actions/unified-setup.ts`
9. `apps/web/components/onboarding/onboarding-form.tsx`
10. `apps/web/lib/owner-wallet-home.ts`
11. `apps/web/components/dashboard/owner-home/home-pass-card.tsx`
12. `apps/web/components/dashboard/owner-homes/homes-wallet.tsx`
13. `apps/web/components/dashboard/index.tsx` (onComplete target only)
13b. `apps/web/components/dashboard/charge-more-menu.tsx` (R1 only)
14. Tests: `components/__tests__/unified-property-wizard.test.tsx`, `app/actions/__tests__/unified-setup.test.ts`
    (create if missing), `components/__tests__/onboarding-form.test.tsx` (create if missing),
    `components/__tests__/charges-section.test.tsx` (empty-state cases only), `lib/__tests__/owner-wallet-home.test.ts`
    or `owner-wallet-home-perf.test.ts`, `components/__tests__/wallet-home.test.tsx`, `lib/__tests__/charge-generation.test.ts`
    (message strings only).

## 6. Implementation requirements
1. **F15 empty state.** Owner/manager, no rent rows, `availableLeases.length > 0`:
   title `No rent yet`, text `This month's rent shows up by tomorrow morning.` plus a button
   `Add this month's rent now` linking to the generate route. With no active lease keep the current text.
   Show the same `Add this month's rent now` link in simple view whenever an active lease has no rent row for the
   current month (replace the hidden-in-simple-view rule; full view keeps its existing link).
   Simple-view line becomes `Rent is added each month for every lease.`
2. **Generate messages.** Replace both strings with exactly: N > 0 → `Rent added for this month.`;
   none → `Rent is already up to date.`
3. **K5 tenant name.** LeaseStep gets `Tenant first name` and `Tenant last name` (required when a tenant is added),
   above `Tenant email`. Client check copy: `Enter the tenant's first and last name.` Schema adds
   `tenantFirstName`, `tenantLastName` (trimmed, 1–60 chars). `unified-setup.ts` sends `${first} ${last}` as `fullName`;
   delete `getTenantDisplayName`. Review step shows the name above the email.
4. **F5.** In `onboarding-form.tsx`, if the stored name has no space and equals the email's local part (case-insensitive),
   or contains `@` or `+`, prefill empty first and last names instead. Real names prefill as today.
5. **K6.** LeaseStep adds `Rent due day` (number 1–28, default = start date's day, capped at 28) and the existing
   `LeaseCollectionSetting` checkbox ("Tenant pays outside Domus"), default unchecked. Schema accepts `dueDayOfMonth`
   and `collectsOutsideDomus`; `unified-setup.ts` uses the submitted due day (still clamped) and passes
   `collectsOutsideDomus`. Review step shows `Due on day N` and, when checked, `Pays outside Domus`.
6. **F8 success screen.** Heading `Your home is added.` once. Body, by case:
   tenant invited → `We emailed {tenant first name} an invite.`; no tenant → `Add a tenant when you are ready.`.
   Bank line only when online pay is possible and not connected and the tenant does not pay outside Domus:
   `Connect your bank so tenants can pay online.` with link `Connect your bank`. Button `Go to Home`; it opens the
   owner Home section (`index.tsx:276-282`: owners → "home"; managers unchanged).
7. **F10 invite state.** `loadOwnerWalletHome` adds one query, run inside the existing `Promise.all` (no new serial
   step), wrapped in `measurePerf("owner", "home.wallet.invites", …)`: pending tenant `invitations` for the
   administered property ids. Each active lease entry gets `invitePending: boolean` = a pending tenant invitation exists
   for that lease's property and the tenant's email (case-insensitive). Home pass card and Homes card show
   `Invite sent` next to the tenant name when true. Query errors are checked: on error, log and treat as false
   (never fail the page).
7b. **R1 (from the 235a live walk).** After a successful "Undo payment", `charge-more-menu.tsx:181` calls
   `toast.success(...)` and then `window.location.reload()`, so the message vanishes and the Rent filter resets. Replace
   the reload with `router.refresh()` (`next/navigation`) so the toast stays visible and the current filter stays.
   Errors unchanged.
8. Plain language: no banned words, sentences ≤ 12 words. Lines ≤ 140 chars. Every touched file ≤ 500 lines.
9. **The user should never need to read instructions to complete this flow.**

## 7. Validation commands
```
cd apps/web && npx vitest run components/__tests__/unified-property-wizard.test.tsx app/actions/__tests__/unified-setup.test.ts \
  components/__tests__/onboarding-form.test.tsx components/__tests__/charges-section.test.tsx components/__tests__/wallet-home.test.tsx \
  lib/__tests__/owner-wallet-home-perf.test.ts lib/__tests__/charge-generation.test.ts lib/__tests__/plain-language.test.ts
cd apps/web && npx vitest run --reporter=dot
cd apps/web && npx tsc --noEmit
npm run lint:web
```
Do NOT run `npm run gate:web`. Claude runs it.

## 8. Acceptance criteria (named tests calling real code)
1. Rent empty state, owner, active lease, no rent → exact title/text and an `Add this month's rent now` link to the
   generate href. No active lease → old text, no link.
2. Simple view shows the add-now link only when an active lease lacks a current-month rent row.
3. Generate messages exact for N=2 and N=0.
4. Wizard: tenant on, missing first or last name → exact error, no submit. With names → payload carries both.
5. `createPropertyWithSetup` sends `fullName` "Maya Lopez" (not from email); `getTenantDisplayName` no longer exists.
6. Onboarding form: stored name `richard.ace.smith+walkowner` with that email → empty first/last; `Ana Ruiz` → Ana / Ruiz.
7. Wizard due day defaults to the start date's day (31 → 28), user value 3 is saved; outside-Domus checkbox value
   reaches `createLeaseSchema` input; review shows `Due on day 3` and `Pays outside Domus`.
8. Success screen: the three cases (invited / no tenant / outside Domus) show exact copy; heading appears once;
   `Go to Home` opens "home" for owners.
9. Wallet: pending invite for the lease's tenant email on that property → `invitePending: true`; accepted → false;
   query error → false and the page still loads; `home.wallet.invites` is measured; home card and Homes card show
   `Invite sent` only when true.
10. Plain-language test passes with no new exceptions.
11. R1: after a successful undo the success toast is shown and `router.refresh` is called; `window.location.reload`
    is not called (spy).

## 9. Report format
Compact status only: files changed with line counts, tests per criterion, command results. Do NOT include
"Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
Only the files in §5. No new dependencies. No migrations. No change to money math. Keep `unified-property-wizard.tsx`
≤ 500 lines (move new UI into `property-wizard-steps.tsx` / `property-wizard-drafts.tsx`).
