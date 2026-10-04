# Sprint 155 — Owner clarity 2/3: one bank card, simpler Home, simpler Rent page

**Severity: L2** (owner UI and display logic only; reads existing Stripe/ownership status, changes no payment, payout, webhook, auth, or schema behaviour). Model: Sol.

## 1. Objective
Implement the owner-approved design (canvas https://claude.ai/artifact/NtynVroGDr3NoyrWcWWMPx, boards "Owner Home (desktop)", "Rent (desktop)", "Owner Home (phone)"):
1. Replace the three stacked bank asks with **one** bank card, shown only on Home.
2. Home shows: greeting + one summary line, the bank card (if needed), **"Needs you today"**, and three tiles (Rent this month, Homes, Next rent due).
3. Rent page: filters **Late / Due soon / Paid / All**, row actions **Remind · Mark paid · ⋯**, one small inline line about online payments when the bank isn't ready, and **no** "Generate This Month Charges" button.

## 2. Context
- Branch `main`, HEAD `be4e886` or later docs-only. All paths under `apps/web/`. Sprint 154 shipped the grouped menu and page headers.
- Three bank asks today (from a code map — verify):
  - `components/dashboard/connect-banner.tsx` ("Set up rent payments… Set up now"), mounted `components/dashboard/index.tsx` (main + empty-owner welcome); owner condition `rentCollectionConnected !== true`; link `rentCollectionConnectHref` (`lib/stripe-connect.ts` `getRentCollectionConnectHref`) else `/connect/onboard`.
  - `components/dashboard/stripe-health-banner.tsx` ("Your bank connection needs attention… Reconnect bank"), mounted in `index.tsx`; shows when the worst `ownership_accounts.stripe_status` (set by `app/api/cron/verify-stripe-accounts/route.ts`, mapped in `lib/ownership.ts`) is `restricted` or `missing`; link hardcoded `/connect/onboard`.
  - Checklist "Connect Bank Account": `components/dashboard/welcome-card.tsx` + `onboarding-checklist.tsx`, step done when `(rentCollectionConnected ?? stripeConnected) === true` (`dashboard-home-loader.ts`).
  - Values come from `app/owner/page.tsx` (`stripeConnected` = profile, `rentCollectionConnected` = `rentCollectionStatus.connected`, connect href) and `getRentCollectionConnectStatus` (`lib/stripe-connect.ts`).
- Owner Home today: `components/dashboard/owner-daily-ops-home.tsx` (`ActionItems`, `FinancialOverviewPanel`, `LlcSetupPrompt`), greeting summary built in `index.tsx`.
- Rent today: `components/dashboard/charges-section.tsx` ("Upcoming / Late Charges", "Add Charge", "Generate This Month Charges" → `/owner/generate`, filters All/Pending/Late/Paid/Waived, summary pills) and `components/dashboard/charge-row.tsx` ("Record", "Message", more-menu Edit/Waive/Delete). Rent is created automatically by the daily cron `/api/cron/generate-charges` (08:00 UTC). The manager dashboard also renders `charges-section.tsx` with `onGenerateChargesHref` — **manager behaviour must not change**.

## 3. In scope
1. **One bank status, one card.** Add a single pure helper (e.g. `lib/owner-bank-status.ts` → `getOwnerBankCardState(...)`) that combines the existing inputs into exactly one of: `connected` | `needs_info` | `not_started`, plus the one link to use:
   - `connected`: rent collection connected AND no ownership account with `stripe_status` `restricted`/`missing` → **no card anywhere**.
   - `needs_info`: a Stripe account exists but onboarding is incomplete, or any account is `restricted`/`missing` → card title "Stripe needs one more thing", body "Your bank is almost ready. Answer a few questions so rent can reach you.", button "Finish setup" → the existing `rentCollectionConnectHref` (or the account-specific `/connect/onboard?accountId=…` the existing helpers already produce — reuse, do not invent URLs).
   - `not_started`: no Stripe account → title "Connect your bank to get paid", body "Rent can’t reach you until this is done. It takes about 5 minutes.", button "Connect bank" → same existing href.
   - Render the card **only on Home**, in the design's place (below the page header, above "Needs you today"). Remove `ConnectBanner` and `StripeHealthBanner` from owner screens (keep the components if the manager dashboard still uses them — check). Remove the bank step and the "Connect Bank Account" button from the owner welcome checklist (the card owns that job); the checklist's other steps stay as they are.
2. **Home layout:** header "Good morning/afternoon/evening, <name>" + one plain summary line (reuse the Sprint 147 tenants-behind wording; "Everything looks good." when nothing is due); then the bank card; then **"Needs you today"**: one row per late/overdue tenant ("<Tenant> owes $X" · home · unit · due date) with buttons **Send reminder** (existing reminder action) and **Mark as paid** (opens the existing manual-payment form for that rent); then a single quiet line "No open repairs. No new messages." when those are zero, otherwise rows for open repairs/new messages linking to Repairs/Messages. Then three tiles: **Rent this month** ("$collected of $due" + thin progress bar), **Homes** ("N" + "X of N rented"), **Next rent due** (date + "$amount from N tenant(s)"). Use existing data already loaded for Home (dashboard/portfolio/action items) — no new queries unless one is unavoidable (say why). Keep `LlcSetupPrompt` behaviour. The existing `FinancialOverviewPanel` moves off Home (it remains reachable on Charts/Payments as today — if it is only on Home, keep it below the tiles under a "More numbers" heading rather than delete it).
3. **Rent page (owner only):**
   - Heading area per design: page title "Rent" (from Sprint 154 header) + help "Rent is added each month from your leases." Main buttons: **Mark rent as paid** (primary — opens the existing manual-payment flow with a rent picker if the existing form supports choosing; otherwise scrolls/filters to unpaid rows) and **Add a one-time fee** (existing "Add Charge" form).
   - Remove the owner "Generate This Month Charges" button (leave the `/owner/generate` route and the manager button untouched).
   - Filters: **Late (n)**, **Due soon (n)**, **Paid**, **All** (default **Late** when n>0, else **Due soon**). "Due soon" = existing pending/upcoming; "Paid" = paid; "All" includes waived. Remove the coloured summary-pill strip (counts live on the filters).
   - Row actions: **Remind** (existing reminder), **Mark paid** (existing "Record" manual-payment form), **⋯** (existing more-menu: Edit, Waive, Delete — labels unchanged this sprint). Keep "Message" inside the ⋯ menu rather than as its own button.
   - When the bank card state is not `connected`, show one muted inline line above the filters: "Tenants can’t pay online until your bank is connected." + link "Connect bank" → Home (`/owner`).
4. Pays-outside-Domus leases (Sprint 146b) keep their existing exclusions from late counts.

## 4. Out of scope
- Word swaps beyond the strings above (Sprint 156), phone bottom bar (156), "Property Scope" relabel (156).
- Manager and tenant dashboards; any payment, payout, Stripe API, webhook, cron, auth, or schema change; deleting `/owner/generate`.
- No DB writes, deploy, env/secret changes, commit, or push.

## 5. Exact files expected to change
`lib/owner-bank-status.ts` (new), `components/dashboard/index.tsx`, `components/dashboard/owner-daily-ops-home.tsx`, `components/dashboard/dashboard-home-loader.ts`, `components/dashboard/welcome-card.tsx`, `components/dashboard/onboarding-checklist.tsx`, `components/dashboard/charges-section.tsx`, `components/dashboard/charge-row.tsx`, `app/owner/page.tsx` (pass the card state/href), one new component for the bank card and one for "Needs you today" if cleaner (name them), plus tests. ≤ 12 non-test files. Any other file: stop and justify.

## 6. Implementation requirements
- Unit tests: `getOwnerBankCardState` for every combination (no account; account not onboarded; onboarded + `restricted`; onboarded + `missing`; fully connected; mixed accounts) → correct state and href; owner Home renders at most **one** bank card and none when connected; `ConnectBanner`/`StripeHealthBanner` never render for owners; checklist has no bank step; "Needs you today" rows + buttons call the existing actions; tiles show correct numbers for fixtures (incl. zero homes, pays-outside-Domus lease excluded from late); Rent filters/counts/default tab; no owner Generate button while the manager view still has it; Remind/Mark paid/⋯ wired to existing handlers; inline bank line only when not connected.
- Update affected tests: `components/__tests__/connect-banner.test.tsx`, `stripe-health-banner.test.tsx`, `dashboard-home-loader.test.tsx`, `charges-section.test.tsx`, `charge-row.test.tsx`, `lib/__tests__/action-items.test.ts`, e2e `tests/e2e/owner-setup.spec.ts` (welcome card "N of 6 complete" count changes), `owner-flows.spec.ts`. Retarget, don't weaken.
- Plain words (CLAUDE.md §18), ≤12 words per sentence; touch targets ≥44px; works at 390px and 1280px; tokens only (no raw hex); light + dark.
- The user should never need to read instructions to complete this flow; every step must be self-explanatory.
- No PII in logs. Do not invent URLs or emails — reuse existing connect hrefs.

## 7. Validation commands
```bash
npm run gate:web
git diff --stat
```

## 8. Acceptance criteria (binary)
- Full `gate:web` passes (network enabled).
- Owners see at most one bank card, only on Home; none when connected; copy and links per §3.1 (tests).
- Home matches §3.2; Rent matches §3.3; owner Generate button gone, manager unchanged.
- No payment/Stripe/auth/schema behaviour changed (diff limited to display + the new pure helper).
- ≤ 12 non-test files.

## 9. Report format
Conform to `docs/codex-report-schema.json`. `self_verification.findings`: the bank-state truth table with hrefs, which old components were removed from owner screens (and whether managers still use them), Home data sources (no new queries, or why), Rent filter mapping, and tests updated.
No "Claude prompt" sections and no recommended next steps for Claude.

## 10. Constraints
No DB apply. No deploy. No env/secret changes. No commit/push — leave the working tree for Claude.
