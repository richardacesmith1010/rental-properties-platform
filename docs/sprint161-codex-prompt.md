# Sprint 161 — Tenant clarity 1/2: Home, menu, Rent page, problem form (approved mockup)

**Severity: L2** (tenant UI + display logic; payment server rules unchanged; no auth, schema, or money-movement changes). Model: gpt-reserve, medium. One run.

## 1. Objective
Build the owner-approved tenant design (canvas https://claude.ai/artifact/GKgJPNk7dLiLYdXUCchLpV, boards "Tenant Home (phone)", "Pay rent (phone)", "Message + report a problem (phone)", "Tenant Home (desktop)") so a tenant instantly sees what they owe, when, and how to pay or get help. Tenant messaging (starting a thread) is NOT in this sprint.

## 2. Context
- Branch `main`, HEAD `378bb8e` or later docs-only. Paths under `apps/web/`.
- `app/tenant/page.tsx` (517 lines): section ids `overview | charges | maintenance | documents | notifications` (labels Rent / Payment History / Problems / Lease / Messages, L56-72); data loaders in one `Promise.all` (L140-171); `ownerConnectedMap = arePropertyOwnersConnected(...)` at L206 (passed only to `ChargesSection`); page `h1` L296-305, section `h2` L311-313, "‹ ›" arrows L314-337; `overview` renders `TenantOverview` + a 3-card KPI grid (L344-380); `charges` renders `TenantLeaseDetails` + `ChargesSection isTenantView` + an inline "Payment History" card (L382-447, title L397); `maintenance` renders `TicketForm viewerRole="tenant"` + `MaintenanceSection` (L449-471).
- Nav: `components/dashboard/sidebar/nav-items.ts:143-178` `tenantNavItems` (overview "Rent", maintenance "Problems", documents "Lease", notifications "Messages" — no item for `charges`); mobile `MobileTopBar` in `sidebar/sidebar-nav.tsx`; owner-only bottom bar `components/dashboard/owner-bottom-bar.tsx`.
- `components/dashboard/tenant-overview.tsx` (PayRentCard, greeting, 4 quick-action cards, "Your Lease" card). `components/dashboard/pay-rent-card.tsx` never checks owner Stripe readiness or `MIN_ONLINE_PAYMENT_CENTS` (both are enforced only server-side in `app/actions/charges.ts:153-216`), so its pay buttons are always live. `lib/payment-fees.ts` (`MIN_ONLINE_PAYMENT_CENTS = 500`, `calculateCardFee`). `lib/lease-collection.ts` `isCollectedOutsideDomus`.
- `ChargesSection` tenant empty state "No charges yet. Charges are generated automatically…" (L472-478); `paymentsAvailable` rule L486-487; card heading "Rent Payments" (`charge-section-controls.tsx:31`).
- `components/dashboard/ticket-form.tsx` tenant branch L157-226 (description only; priority stays "medium"; photos via `PhotoUpload`; allowed priorities low|medium|high|urgent).
- Hard-coded tenant links that must keep working: `lib/delinquency.ts:22` and `lib/notification-actions.ts:68` (`/tenant?section=charges`), `app/actions/autopay.ts:131` (`/tenant?section=charges&autopay=cancelled`), `app/actions/inbox.ts:311` (`/tenant?section=notifications`), sidebar bell href.

## 3. In scope
1. **Online-pay readiness (one helper):** add a pure helper (e.g. `lib/tenant-pay-state.ts`) that, for the tenant's next rent, returns `can_pay | not_ready | outside | paid | not_posted` from: open charge (amount, due date, status), `ownerConnectedMap.get(propertyId)`, Stripe publishable key present, `amountCents >= MIN_ONLINE_PAYMENT_CENTS`, `isCollectedOutsideDomus`, last payment, and the active lease's rent + due day. Use it on Home and on the Rent page so pay buttons are shown only when `can_pay`. Server-side payment checks stay exactly as they are.
2. **Tenant Home (`overview`, label "Home"):** greeting "Hi, <first name>" + "<Property> · <Unit>"; one big rent card:
   - `can_pay`: "Rent due" · "$X" · "due <Mon D> · in N days" (or "N days late" in the warning colour) · **Pay rent** (primary, opens the existing PayRentCard pay flow — inline expand or its own view, reuse code) · "Bank transfer is free. Cards have a small fee."
   - `not_ready` (landlord can't collect online, or below the $5 minimum): show amount + due date and a muted box: "Online pay isn't on yet" / "Your landlord is still setting it up. Pay them the way you usually do for now." No pay buttons.
   - `outside` (lease collects outside Domus): amount + due date + "You pay your landlord outside Domus." No pay buttons.
   - `paid`: "<Month> rent" · "Paid <Mon D>. Thank you!" (success colour).
   - `not_posted` (active lease, no charge yet): "Next rent" · "$X" · "due <Mon D>" · "You can pay once it's posted."
   Then two tiles **Report a problem** (→ Problems) and **Message landlord** (→ Messages); a "Your problems" list (open tickets with a status pill, max 3, "See all"); a small "Your lease" row (dates + "See details" → Your lease). Remove the old 3-card KPI grid and the duplicate quick-action cards. Keep the existing "Already paid? Mark as paid manually" and autopay controls, but place them on the Rent page (not Home).
3. **Menu:** tenant nav = Home (`overview`), Rent (`charges`), Problems (`maintenance`), Messages (`notifications`), Your lease (`documents`). Keep the section ids. Phone (< 1024 px): a bottom bar Home / Rent / Problems / Messages (generalise the owner bottom bar or add a tenant one; portal to body like the owner bar; Help button stays above it); "Your lease" and Settings stay in the drawer.
4. **Remove for tenants:** the "‹ ›" arrows and `tenantSectionOrder` paging; the duplicate "Payment History" (the section heading is now "Rent"; the history card is titled "Past payments"); the page `h1` showing the property name above every section (use the simple header: page title + one plain sentence, like owners).
5. **Rent page (`charges`):** header "Rent" + "Pay rent and see what you've paid."; the same rent card as Home at the top (no duplicate pay blocks below); "Your rent" list without the Pending/Late/Paid/Waived filter row for tenants (show open rent first, then the last 12 paid in "Past payments" with View receipt links); empty text "No rent posted yet. Your first rent is due <date>." (fall back to "No rent posted yet." if no lease); autopay + "Already paid?" controls below. Words: never "charges"/"Waived"/"Pending" for tenants — use "Rent", "Due", "Late", "Paid".
6. **Report a problem (Problems):** keep the description and photo; add **"How bad is it?"** with two options "It can wait" (→ priority `medium`) and "Fix it soon" (→ priority `high`), default "It can wait"; add the note "Emergency like fire, gas, or flooding? Call 911 first."; button "Send to landlord"; success "Sent. You'll see updates on Home." Owner/manager ticket form unchanged.
7. **Messages:** UI copy only this sprint — empty state "No messages yet. Your landlord can message you here." (tenant thread creation comes in Sprint 162).

## 4. Out of scope / invariants (L-014)
- Tenant thread creation, any server action or auth change, payment server rules, schema, emails/PDFs.
- Owner and manager dashboards unchanged (shared components: `ChargesSection`, `ChargeRow`, `TicketForm`, nav, bottom bar — owner/manager output identical; their tests pass unmodified).
- All hard-coded tenant links in §2 keep working (section ids unchanged).
- Do NOT modify or revert any file not listed in §5 — including `.claude/launch.json` or anything you did not create in this sprint.
- No DB writes, deploy, env/secret changes, commit, or push.

## 5. Exact files expected to change
`app/tenant/page.tsx`, `components/dashboard/tenant-overview.tsx`, `components/dashboard/pay-rent-card.tsx`, `components/dashboard/charges-section.tsx`, `components/dashboard/charge-section-controls.tsx`, `components/dashboard/ticket-form.tsx`, `components/dashboard/inbox-section.tsx` (empty-state copy only), `components/dashboard/sidebar/nav-items.ts`, `components/dashboard/sidebar/sidebar-nav.tsx`, `components/dashboard/owner-bottom-bar.tsx` (if generalised; else a new `components/dashboard/tenant-bottom-bar.tsx`), `components/dashboard/tenant-lease-details.tsx` (only if needed), new `lib/tenant-pay-state.ts`, plus tests and the tenant e2e specs (`tests/e2e/tenant-flows.spec.ts`, `tenant-dashboard.spec.ts`, `tenant-portal.spec.ts`). ≤ 14 non-test files.

## 6. Implementation requirements
- Unit tests: `tenant-pay-state` for every state incl. owner not connected, amount < $5, pays-outside, paid, not posted, late; Home renders each state's copy and shows Pay rent only for `can_pay`; tenant nav = 5 items in order and bottom bar 4 items (owner bar unchanged); no arrows / no duplicate "Payment History" / "Past payments" title; Rent page has no filter row for tenants and no "charges"/"Waived"/"Pending" words; problem form sends `medium` vs `high`; owner/manager `ChargesSection`/`TicketForm` output unchanged (existing tests untouched).
- Update tenant e2e assertions to the new headings (retarget, don't weaken).
- Targeted validation (Claude runs the full gate): lint, typecheck, the vitest files you touched/added, AND every existing test file that imports any component/module you changed (find them with grep before finishing; Sprint 160 missed one this way).
- Plain words, ≤12 words per sentence; tokens only; light + dark; 390 px + 1280 px; 44 px targets. The user should never need to read instructions to complete this flow; every step must be self-explanatory.
- No PII in logs. Do not invent URLs or emails.

## 7. Validation commands
```bash
npm run lint:web
npx tsc -p apps/web/tsconfig.json --noEmit
cd apps/web && npx vitest run <the test files you touched or added> components/__tests__/charges-section.test.tsx components/__tests__/tenant-overview.test.tsx components/__tests__/maintenance-section.test.tsx
git diff --stat
```

## 8. Acceptance criteria (binary)
- Lint, typecheck and targeted tests pass.
- Tenant Home/Rent/menu/problem form per §3; pay buttons only when `can_pay`.
- Owner/manager unchanged; hard-coded tenant links still resolve to the right sections.
- Only §5 files changed; nothing else modified or reverted.

## 9. Report format
Conform to `docs/codex-report-schema.json` (set `gate_passed` from the targeted checks and say so). `self_verification.findings`: the pay-state truth table, where Pay rent opens, how the bottom bar was done, words removed, tests updated (incl. e2e).
No "Claude prompt" sections and no recommended next steps for Claude.

## 10. Constraints
No DB apply. No deploy. No env/secret changes. No commit/push — leave the working tree for Claude.
