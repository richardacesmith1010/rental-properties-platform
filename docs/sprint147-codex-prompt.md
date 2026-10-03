# Sprint 147 — Walk-through bugs: overdue count, floating buttons, mobile account menu, owner "Pay now"

**Severity: L2** (UI correctness; no money logic, auth, or schema). Source: `docs/walkthrough-2026-10-03.md` findings #1, #2, #3, #8.

## 1. Objective
Fix four user-visible bugs found in the owner walk-through on production.

## 2. Context
- Branch `main`, HEAD `f50902a` or later docs-only.
- **#1 Overdue count disagrees:** `components/dashboard/index.tsx:170-203` counts late CHARGES (`overdueCharges.length`, e.g. 2) for the greeting ("You have 2 overdue charges totaling $2", `components/dashboard/contextual-greeting.tsx:22-23`) and the "· 2 overdue charges" header summary, while the KPI card labeled **"Overdue charges"** (`components/dashboard/dashboard-header.tsx` ~:128 and ~:151) shows `kpis.lateAccountCount` = number of distinct LEASES with late rent (e.g. 1), from `lib/dashboard.ts:491`.
- **#2 Floating buttons cover controls:** the global "Feedback" button (`components/feedback/feedback-button.tsx`, rendered from `app/layout.tsx`) and "Ask Domus" (`components/dashboard/ai-assistant.tsx`) are fixed bottom-right pills. At 1280px Feedback covers the first rent row's "More" button in Charges; at 390px Ask Domus covers the "Connect Bank Account" button and Feedback covers the section "next" arrow.
- **#3 Mobile account menu open on load (verify):** at 390px the owner page renders with the account popover ("Signed in as … / Sign out") visible over the header without any click. Likely in `components/dashboard/user-menu-popover.tsx` or the mobile header/sidebar wrapper (e.g. CSS that shows the popover panel at small widths, or a default-open state).
- **#8 Owner sees "Pay now":** `components/dashboard/charge-row.tsx` ~:390-417 renders "Pay now" / "Pay $X" buttons; on the owner Charges list they appear on tenant rent rows. Owners and managers do not pay tenant rent.

## 3. In scope
1. **Overdue count:** make the greeting, the header summary, and the KPI card describe the SAME thing in plain words. Use **tenants behind on rent** (distinct leases with late rent, i.e. `lateAccountCount`) everywhere on owner/manager home:
   - KPI label: **"Tenants behind"** (value = lateAccountCount).
   - Greeting: **"1 tenant is behind on rent ($2)."** / **"2 tenants are behind on rent ($5)."** (amount = total late rent).
   - Header summary: **"1 tenant behind"** / **"N tenants behind"**.
   - When zero: keep the existing all-clear text.
   Compute once (single source) and pass down; no new queries. Apply the same wording on the manager dashboard if it shows the same pair.
2. **Floating buttons:** replace the two separate pills with ONE compact help button (44×44 icon button, bottom-right, `aria-label="Help"`) that opens a small menu with **"Ask Domus"** and **"Send feedback"** — each opening exactly what the old buttons opened (no behavior change inside them). Add bottom padding to the main content area (≥ 88px) so the last controls on any page can scroll clear of it. Keep `print:hidden`. Tenant pages included.
3. **Mobile account menu:** reproduce from code; the account popover must be closed on load at every width and open only when the user taps the avatar; closes on outside tap and Escape.
4. **Owner "Pay now":** owner and manager views never render "Pay now" / "Pay $X" on charge rows. Tenant view unchanged (tenants still see and use Pay buttons exactly as today).
5. Plain-language rules (CLAUDE.md §18) for all new text.

## 4. Out of scope
- Section navigation/carousel, banners consolidation, jargon sweep, load speed (separate sprints).
- Any data/query logic beyond reusing values already computed; payments, Stripe, auth.
- No DB, deploy, env/secret changes, commit, or push.

## 5. Exact files expected to change
`components/dashboard/index.tsx`, `components/dashboard/contextual-greeting.tsx`, `components/dashboard/dashboard-header.tsx`, manager dashboard header/greeting file(s) only if they show the same count, `components/feedback/feedback-button.tsx`, `components/dashboard/ai-assistant.tsx`, a new small help-menu component (if needed), `app/layout.tsx` (only if needed to mount the merged button), the main content wrapper that gets bottom padding, the file(s) causing the mobile popover bug, `components/dashboard/charge-row.tsx` (and its parent only if the role flag must be passed), and tests. List any other file and why in `deviations`; ≤ 12 non-test files.

## 6. Implementation requirements
- v2 tokens only; components/ui primitives. Accessible: real `<button>`s, focus visible, menu reachable by keyboard, Escape closes.
- Tests (Vitest/RTL): greeting/header/KPI show the same tenant count and amount for a fixture with 2 late charges on 1 lease ("1 tenant is behind on rent ($2)."); help button renders one trigger and both menu items open their existing targets; account popover is closed on initial render; owner charge row renders no Pay button while tenant row still does.
- No new data queries. Do not invent URLs or emails.

## 7. Validation commands
```bash
npm run gate:web
git diff --stat
```

## 8. Acceptance criteria (binary)
- Full `gate:web` passes (network enabled).
- One consistent "tenants behind" metric across greeting, summary, and KPI.
- Single help button; both features still reachable; content padded so nothing is permanently covered.
- Account menu closed on load at all widths.
- No Pay buttons for owners/managers; tenant Pay flow untouched.
- ≤ 12 non-test files changed.

## 9. Report format
Conform to `docs/codex-report-schema.json`. `copy_changes`: every changed string. `self_verification.findings`: root cause of the mobile popover bug and the exact condition now hiding Pay buttons. `self_verification.attempted=false` is fine (no browser) — Claude verifies on production at 1280 and 390px.
No "Claude prompt" sections and no recommended next steps for Claude.

## 10. Constraints
No DB apply. No deploy. No env/secret changes. No commit/push — leave the working tree for Claude.
