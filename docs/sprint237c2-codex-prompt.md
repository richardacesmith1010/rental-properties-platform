# Sprint 237c-2 — Manager menu (~6 + More), phone tab bar, Wallet Manager Home, switch style, Install card (L2) — rev 1

## 1. Objective
Make the manager experience match the owner's: owner decision 2026-10-16 — **about 6 everyday menu items, the rest under
"More"**; a bottom tab bar on phones (P9); Manager Home in the Wallet look (M4); fix the reminder switch style and the
"Install Domus" card that covers the Rent list at 375 px.

## 2. Context
- HEAD after 237c-1 packet. Findings: `docs/manager-walk-plan-2026-10-16.md` (M9 22 nav items, M4 old layout),
  `docs/phone-walk-2026-10-16.md` (P9 no manager tab bar).
- Nav: `apps/web/components/dashboard/sidebar/nav-items.ts` (`defaultNavItems` :35, `tenantNavItems` :143,
  `resolveNavItems` :225, groups e.g. "More"); managers currently get the long default list.
- Owner tab bar: `apps/web/components/dashboard/owner-bottom-bar.tsx` (122 lines; tabs Home, Money, Homes, Inbox→Messages
  after 238d, More); tenant: `tenant-bottom-bar.tsx`. Manager page `apps/web/app/manager/page.tsx` (363 lines) renders
  no bottom bar.
- Owner Wallet Home components (Sprint 216–218) — find the owner Home section and reuse its building blocks (cards,
  "Needs you", totals) for the manager.
- Reminder switch: `components/settings/notification-preferences.tsx:361-362` renders a round "Off/On" button with
  `role="switch"`; other settings use the shared toggle component in the same file — reuse it.
- `components/pwa/install-prompt.tsx` — the "Install Domus" card overlaps the Rent list at 375 px.

## 3. In scope
Manager nav grouping, manager bottom tab bar (phones only), Manager Home Wallet layout (same data as today), switch
style, install card placement.

## 4. Out of scope
Owner/tenant navigation changes (except shared components reused unchanged in behavior), data/logic changes, the
invite/clients work (237c-1).

## 5. Exact files expected to change
1. `apps/web/components/dashboard/sidebar/nav-items.ts` (a `managerNavItems` list or a manager grouping)
2. `apps/web/components/dashboard/manager-bottom-bar.tsx` (new, modeled on `owner-bottom-bar.tsx`; share code if it keeps
   files ≤ 500 and DRY)
3. `apps/web/app/manager/page.tsx` (render the bar; Wallet Home section)
4. the Manager Home section component(s) (name them) reusing the owner Wallet building blocks
5. `apps/web/components/settings/notification-preferences.tsx` (switch style only)
6. `apps/web/components/pwa/install-prompt.tsx` (placement)
7. Tests for each

## 6. Implementation requirements
1. **Menu:** visible everyday items for managers: `Home`, `Rent`, `Repairs`, `Messages`, `Homes`, `Money` (Money =
   the manager's payments/fees). Everything else the manager has today stays reachable under a `More` group, in the
   current order, with no item removed. Owners' and tenants' menus unchanged.
2. **Phone tab bar (below `lg`):** `Home`, `Rent`, `Repairs`, `Messages`, `More` (More opens the drawer), same look and
   safe-area handling as the owner bar; the active tab follows the section; hidden on desktop and print.
3. **Manager Home (Wallet look):** reuse the owner Wallet building blocks: greeting + title `Home`; a card per managed
   home (name, city, status, rent this month); `Needs you` list (open repairs, conversations, bank setup for fees);
   `Rent this month` total. Same data sources as today's manager Home (no new queries unless needed; batch with `.in()`).
4. **Switch:** the reminder setting uses the same toggle component/style as the other notification toggles (label,
   helper, `role="switch"`, `aria-checked`); behavior unchanged.
5. **Install card:** never overlaps page content: render it in normal flow at the end of the page content (or as a
   dismissible bottom sheet above the tab bar that pads the content) — choose one and keep "Not now" working.
6. Plain language (6th grade, ≤ 12 words per sentence), lines ≤ 140, files ≤ 500. The user should never need to read
   instructions to complete this flow.

## 7. Validation commands
```
cd apps/web && npx vitest run --reporter=dot
cd apps/web && npx tsc --noEmit
npm run lint:web
```
Do NOT run `npm run gate:web`. Claude verifies on desktop, 375 px, and the iPhone Simulator, light and dark.

## 8. Acceptance criteria
1. Manager nav: the six everyday items in order, every other current manager item under `More` (snapshot of ids: none
   missing, none added); owner and tenant nav unchanged (existing tests green).
2. Manager bottom bar renders on phone widths with the 5 tabs, correct active state, `More` opens the drawer; not
   rendered for owners/tenants.
3. Manager Home shows a card per managed home, `Needs you` items and the rent total from the same data as before.
4. Reminder switch uses the shared toggle (test by role/aria and class).
5. Install card is not absolutely positioned over content (test the classes/placement); "Not now" still hides it.
6. Full suite + plain-language guard green.

## 9. Report format
Compact status only: files changed with line counts, tests per criterion, command results. Do NOT include "Claude
prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
Only the files in §5. No new dependencies. No data or permission changes.
