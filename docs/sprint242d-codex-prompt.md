# Sprint 242d — Redesign: owner screens and shared chrome (L2, web, look only)

## 1. Objective
Finish the "Registry in graphite" look on everything an owner sees after signing in: Home, Money, Homes, Bank, Reports,
Settings, setup/onboarding, the tab bar, sidebar/drawer, header menus, help and Ask Domus, and the shared error pages.
Spec: `docs/design/domus-design-system.md`. 242a (tokens, fonts, primitives) and 242c (front door, `DomusMark`) are in.
**Look only:** no copy, layout, spacing, order, behavior or data change.

## 2. Context
- HEAD: latest `main`. Paths under `apps/web/`.
- Owner Home "pass card": `components/dashboard/owner-home/home-pass-card.tsx:5`
  `passCardColors = ["#14532D", "#1E3A8A", "#111214", "#7C2D12"]` (a color per home).
- Files that fill with `bg-[var(--accent)]` (primary actions, selected states) in this sprint's scope:
  `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`, `app/connect/return/page.tsx`,
  `app/owner/bank/oauth-app/page.tsx`, `app/owner/reports/page.tsx`, `app/owner/setup/page.tsx`,
  `components/bank-feed/{bank-balances-card,bank-connections-card,oauth-return,review-card,upload-card}.tsx`,
  `components/dashboard/{ai-assistant,owner-bank-card,owner-daily-ops-home,user-menu-popover}.tsx`,
  `components/dashboard/owner-homes/homes-wallet.tsx`, `components/dashboard/sidebar/sidebar-nav.tsx`,
  `components/help-menu.tsx`, `components/home-money/*.tsx` (7 files), `components/onboarding/onboarding-wizard.tsx`,
  `components/settings/ask-domus-settings.tsx`, `components/ui/animated-tabs.tsx`.
- `app/layout.tsx` also matches `bg-[var(--accent)]` (skip-link or similar) — check it; change only if it is a primary fill.
- Tokens available: `--action*`, `--hero*`, `--line-2`, `font-display`, `.domus-section-label`, `Badge` (square tags).

## 3. In scope (directories and files)
`app/owner/**`, `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`, `app/connect/**`, `app/settings/**`,
`app/layout.tsx` (only if §2 applies), `components/dashboard/owner-home/**`, `components/dashboard/owner-homes/**`,
`components/dashboard/owner-bottom-bar.tsx`, `components/dashboard/sidebar/**`, `components/dashboard/dashboard-header.tsx`,
`components/dashboard/dashboard-layout.tsx`, `components/dashboard/{ai-assistant,owner-bank-card,owner-daily-ops-home,
user-menu-popover,notification-bell-menu}.tsx`, `components/home-money/**`, `components/bank-feed/**`,
`components/reports/**`, `components/settings/**`, `components/onboarding/**`, `components/help-menu.tsx`,
`components/ui/animated-tabs.tsx`, and tests/snapshots that pin the old look.

## 4. Out of scope
Tenant and manager screens, dashboard sections shared with tenants/managers (charges, maintenance, inbox, leases,
tenants, units, documents, vendors, clients), receipts/PDF, join pages (all 242e); `globals.css`, `components/ui/*`
except `animated-tabs.tsx`; copy; layout.

## 5. Exact files expected to change
Only files inside §3. List every changed file with line counts in the report. New test file:
`apps/web/components/__tests__/owner-look.test.tsx`.

## 6. Implementation requirements (apply each rule wherever it matches in §3)
1. **Primary actions** — `bg-[var(--accent)]` (+ `text-white` / `text-[var(--accent-contrast)]`) on buttons, CTAs and the
   Add (+) button → `bg-[var(--action)] text-[var(--action-contrast)] hover:bg-[var(--action-strong)]`.
2. **Selected states** — segmented controls / period switch / animated tabs: track `bg-[var(--surface-3)]`, selected
   segment `bg-[var(--surface)] text-[var(--ink)] shadow-[var(--shadow-sm)]` (no accent fill). Active nav items in the
   sidebar/drawer: `bg-[var(--surface-2)] text-[var(--ink)] font-semibold`. Owner tab bar: active tab `text-[var(--ink)]`
   (not accent), inactive `text-[var(--faint)]`; tab bar top border `border-t border-[var(--ink)]`.
3. **Accent stays only for** links, focus rings, small "check"/info markers and unread dots.
4. **Pass card** — every home uses `bg-[var(--hero)] text-[var(--hero-ink)]`; secondary text `text-[var(--hero-muted)]`;
   internal dividers `border-[var(--hero-line)]`; add `border border-[var(--line)]` (visible in dark mode); radius
   `rounded-[var(--radius-pass)]`. Remove `passCardColors` and any per-home color choice (keep its export only if other
   code imports it — then return the hero token for every index). Home name in `font-display`; the main amount in
   `font-display`. The "Rent late"-type tag on the card → `Badge` styled for dark ground (1 px `--warn-line` border,
   `text-[#F3C97A]` allowed here only).
5. **Type** — screen titles (the large title on Home, Money, Homes, Bank, Reports, Settings, setup) and big money figures
   (YTD tiles, Money "left after bills", bank balances, report totals) → `font-display font-semibold`; drop extra
   `font-bold`/negative tracking on them. Section headings like "Needs you", "Recent activity", "Heads up" →
   `font-display text-[18px] font-semibold`. Small all-caps or eyebrow labels → `domus-section-label`.
6. **Screen header rule** — under each owner screen title block add `border-b-2 border-[var(--ink)] pb-3` (no other
   spacing change).
7. **Shape** — in §3 files: `rounded-3xl`, `rounded-[Npx]` (N ≥ 6) and `rounded-full` on cards, panels, sheets, buttons,
   inputs, chips → `rounded-2xl` (cards/panels/sheets) or `rounded-xl` (controls). `rounded-full` stays ONLY on avatars,
   unread/status dots, toggle switches, the floating help button, and progress bars (bars → `rounded-[1px]`).
8. **Chips** — hand-built status chips → the `Badge` component with the matching variant.
9. **Hard-coded colors** — no hex colors in §3 files except the one allowed in rule 4 and colors in chart data files
   that already map to tokens; replace others with tokens.
10. Lines ≤ 140 characters. No new dependencies. No copy changes.

## 7. Validation commands
```
(cd apps/web && npx vitest run components/__tests__/owner-look.test.tsx)
(cd apps/web && npx vitest run --reporter=dot)
(cd apps/web && npx tsc --noEmit)
npm run lint:web
/usr/bin/grep -rn "bg-\[var(--accent)\]" <every §3 path>
/usr/bin/grep -rnE "rounded-3xl|rounded-\[(6|7|8|9|1[0-9]|2[0-9])px\]" <every §3 path>
/usr/bin/grep -rn "passCardColors\|#14532D\|#1E3A8A\|#7C2D12" apps/web/components apps/web/app
```
The three greps print nothing (except a `passCardColors` export kept per rule 4 that returns tokens). Do NOT run
`npm run gate:web`.

## 8. Acceptance criteria
1. `owner-look.test.tsx` "pass card": rendering `HomePassCard` (existing props/fixtures from its tests) for two different
   homes gives both roots `bg-[var(--hero)]` and `rounded-[var(--radius-pass)]`, no inline background color, the home name
   and amount elements have `font-display`, and the visible text is unchanged from before (assert the same strings the
   existing pass-card test asserts).
2. Same file, "tab bar": `OwnerBottomBar` on `/owner` has `border-[var(--ink)]` on the nav, the active tab has
   `text-[var(--ink)]` and not `text-[var(--accent)]`.
3. Same file, "period switch": the selected segment has `bg-[var(--surface)]` and no `bg-[var(--accent)]`; labels unchanged.
4. Same file, "money title": the Money page title and the "left after bills" figure have `font-display`.
5. Same file, "primary buttons": the bank review "Yes, that's right" button (`review-card.tsx`) has `bg-[var(--action)]`.
6. Every existing test passes; each updated old-look assertion/snapshot is named in the report.

## 9. Report format
Compact status only: files changed with line counts, test names, command results, grep outputs, updated assertions.
Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
- Only §3 files (plus tests). No copy, layout or behavior changes. No new dependencies.
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory. If the
  user needs to think about what to do, the UI needs to be clearer.
