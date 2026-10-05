# Sprint 156 — Owner clarity 3/3: plain words, phone bottom bar, Home/Rent polish, dead code

**Severity: L2** (copy, layout and display logic only; no auth, money movement, schema, or server-rule changes). Model: Sol.

## 1. Objective
Finish the owner-approved clarity design (canvas https://claude.ai/artifact/NtynVroGDr3NoyrWcWWMPx, boards "Word swaps" and "Owner Home (phone)") and fix the issues Claude found verifying Sprint 155 in production.

## 2. Context
- Branch `main`, HEAD `32ad3d7` or later docs-only. All paths under `apps/web/`. Sprints 154 (grouped menu) and 155 (bank card, Home, Rent) are live.
- Verified-in-prod findings to fix (smoke owner, 2026-10-04):
  1. Home tile "Next rent due" shows "No rent due · $0 from 0 tenants" while Rent shows "Due soon (1)" — wrong.
  2. "Needs you today" lists the same tenant twice ($1 + $1) while the header says "1 tenant is behind on rent ($2)".
  3. Rent page shows the title "Rent" twice (page header + the card heading `components/dashboard/charge-section-controls.tsx`), plus a leftover section description "Charges are automatically created each month…" (`components/dashboard/section-renderer-support.tsx`); and both "Mark rent as paid" and "Add a one-time fee" are filled primary buttons (design: one primary).
  4. Rent menu badge shows a bare "3"; design shows "2 late" (late count only).
  5. Phone drawer logs Radix "`DialogContent` requires a `DialogTitle`" (`components/ui/mobile-drawer.tsx`, vaul) — pre-existing.
  6. Active menu item must keep its active (blue) style while hovered (check `components/dashboard/sidebar/sidebar-nav.tsx`).
- Dead code with zero runtime importers (verify): `components/dashboard/compact-greeting-bar.tsx`, `components/dashboard/stripe-health-banner.tsx`, the optional `isOwnerDailyOpsCarousel` field in `components/dashboard/section-map.ts`.
- Jargon locations (from grep; verify): "Property Scope" `property-selector.tsx`, `section-renderer-support.tsx`, `automation-templates-section.tsx`; "Command Center"/"Financial overview" `financial-overview-panel.tsx`; "Financial Snapshot" `domus-financials-card.tsx`; "Upcoming / Late Charges" `charge-section-controls.tsx`; "Maintenance Tickets" `maintenance-section.tsx`, `property-detail-detail-panels.tsx`; "Open Receivables"/"Tenant Ledger" `components/reports/drilldown-panel.tsx`, `components/reports/tenant-ledger-report.tsx`, `app/owner/reports/page.tsx`; "P&L" `components/reports/monthly-pnl-report.tsx`, `app/owner/reports/page.tsx`, `expenses-section.tsx`, `expenses/expense-list.tsx`; "Portfolio Summary"/"Your Portfolio" `section-renderer-support.tsx`, `owner-daily-ops-home.tsx`, `portfolio-section.tsx`; "Leasing Hub" `leasing-hub-section.tsx`.

## 3. In scope
1. **Fixes:**
   - *Next rent due tile:* show the earliest unpaid, not-late rent due date among the owner's active leases (pending charges first; if none exist yet, the next due date implied by active leases' `due_day_of_month`, excluding pays-outside-Domus leases). Sub-line "$X from N tenant(s)". If the owner has no active leases: title "No rent due" and **no** sub-line.
   - *Needs you today:* one row per tenant + lease: "<Tenant> owes $<total>" and, when more than one month, "· <n> months late"; the meta line shows the oldest due date. "Send reminder" reminds for that tenant's late rent (existing action, all of that lease's late rent); "Mark as paid" opens the existing manual-payment flow for the oldest late rent.
   - *Rent page:* remove the duplicate card heading and the old "Charges are automatically created…" description for owners; keep one help sentence "Rent is added each month from your leases."; "Mark rent as paid" stays primary, "Add a one-time fee" becomes the secondary (outline) style.
   - *Rent badge:* show "<n> late" using the late count (hidden when 0).
   - *Phone drawer:* add a visually hidden title ("Menu") so the Radix warning is gone.
   - *Active menu item:* keeps active styling on hover/focus.
2. **Phone bottom bar (owner, < 1024 px only):** fixed bottom bar with Home, Rent (with the late badge), Repairs, More — "More" opens the existing drawer. 44 px+ targets, safe-area padding, content padded so the bar never covers controls (the Help button must sit above it). Desktop unchanged.
3. **Word swaps (owner screens; shared components get the same plain words for managers too):**
   - "Upcoming / Late Charges" → remove (the page title is "Rent"); "Charges" (as a page/section label) → "Rent"; "Record payment"/"Record" → "Mark as paid"/"Mark paid" (Sprint 155 covered rows; sweep remaining owner labels)
   - "Portfolio" (labels/headings) → "Homes"; "Portfolio Summary" → "Your homes"; "Your Portfolio" → "Your homes"
   - "Maintenance Tickets" → "Repairs"
   - "Open Receivables" → "Money owed to you"; "Tenant Ledger" → "Payment history"; "P&L" / "Monthly P&L" → "Money in and out"
   - "Property Scope" → "Show" with the select's default option "All homes"
   - "Command Center" → remove; "Financial overview" → "Money overview"; "Financial Snapshot" → "Your numbers"
   - "Leasing Hub" → "Find a tenant"; "Manager Payments" (any remaining owner label) → "Manager pay"
   - Keep data/route/ids/DB column names unchanged — copy only. Do not rename anything in PDFs or emails this sprint.
4. **Dead code:** delete `compact-greeting-bar.tsx`, `stripe-health-banner.tsx` (and their now-orphan tests), and the `isOwnerDailyOpsCarousel` field — only after a whole-tree grep proves zero importers (L-006).

## 4. Out of scope
- Tenant screens, emails, PDFs, marketing pages; any server action, query semantics beyond the Next-rent-due/Needs-you-today display computations; payments; schema; auth.
- No DB writes, deploy, env/secret changes, commit, or push.

## 5. Exact files expected to change
Fixes/bar: `components/dashboard/owner-daily-ops-home.tsx`, `components/dashboard/dashboard-home-loader.ts`, `components/dashboard/charge-section-controls.tsx`, `components/dashboard/charges-section.tsx`, `components/dashboard/section-renderer-support.tsx`, `components/dashboard/sidebar/sidebar-nav.tsx`, `components/dashboard/sidebar/nav-items.ts`, `components/dashboard/dashboard-config.ts`, `components/ui/mobile-drawer.tsx`, `components/dashboard/dashboard-layout.tsx`, one new `components/dashboard/owner-bottom-bar.tsx`.
Words: `components/dashboard/property-selector.tsx`, `components/dashboard/automation-templates-section.tsx`, `components/dashboard/financial-overview-panel.tsx`, `components/dashboard/domus-financials-card.tsx`, `components/dashboard/maintenance-section.tsx`, `components/dashboard/property-detail-detail-panels.tsx`, `components/dashboard/portfolio-section.tsx`, `components/dashboard/leasing-hub-section.tsx`, `components/dashboard/expenses-section.tsx`, `components/dashboard/expenses/expense-list.tsx`, `components/reports/drilldown-panel.tsx`, `components/reports/tenant-ledger-report.tsx`, `components/reports/monthly-pnl-report.tsx`, `app/owner/reports/page.tsx`.
Deleted: `components/dashboard/compact-greeting-bar.tsx`, `components/dashboard/stripe-health-banner.tsx`; edited `components/dashboard/section-map.ts`.
Plus tests. ≤ 30 non-test files (mostly one-line copy edits). Any other file: stop and justify. Do NOT touch `app/login/page.tsx` or `lib/pdf/*` even though they contain "Command Center".

## 6. Implementation requirements
- Unit tests: Next-rent-due tile for (pending charge exists; no charges yet but active lease → next due day; only pays-outside-Domus leases; no leases → no sub-line); Needs-you-today groups multi-month late rent into one row with correct total/months and actions; Rent page has one "Rent" title, no old description, one primary button; badge shows "<n> late"/hidden at 0; bottom bar renders only for owners below 1024 px, "More" opens the drawer, Help button not covered; drawer has an accessible title; active item keeps active class on hover; each swapped string appears and the old string does not on the owner surfaces touched.
- Update affected tests/e2e (retarget, don't weaken): any asserting "Property Scope", "Upcoming / Late Charges", "Maintenance Tickets", "Tenant Ledger", "P&L", "Portfolio", "Command Center", e.g. `section-renderer-support.test.tsx`, `charges-section.test.tsx`, `property-navigation.spec.ts`, reports tests, `smoke-theme.spec.ts`.
- Plain words, ≤12 words per sentence (CLAUDE.md §18); tokens only; light + dark; 390 px and 1280 px. The user should never need to read instructions to complete this flow; every step must be self-explanatory.
- No PII in logs. Do not invent URLs or emails.

## 7. Validation commands
```bash
npm run gate:web
git diff --stat
```

## 8. Acceptance criteria (binary)
- Full `gate:web` passes (network enabled).
- All six §2 findings fixed (tests).
- Owner phone bottom bar per §3.2; desktop unchanged.
- Every §3.3 swap applied on the listed files; ids/routes/DB names unchanged; login/PDF/email untouched.
- Dead files deleted with zero-importer proof.
- ≤ 30 non-test files, all from §5.

## 9. Report format
Conform to `docs/codex-report-schema.json`. `self_verification.findings`: next-rent-due rule, grouping rule, list of strings changed per file, deleted files with zero-importer proof, bottom-bar breakpoint/safe-area handling, tests updated.
No "Claude prompt" sections and no recommended next steps for Claude.

## 10. Constraints
No DB apply. No deploy. No env/secret changes. No commit/push — leave the working tree for Claude.
