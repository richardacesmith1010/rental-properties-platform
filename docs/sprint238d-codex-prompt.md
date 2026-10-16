# Sprint 238d — Phone UI polish from the iPhone walk (L2) — rev 1

## 1. Objective
Fix the small iPhone-walk findings (`docs/phone-walk-2026-10-16.md`) so the app looks finished on a phone:
P3 headers under the status bar, P2 help button covering content, P7 tenant "Problem" → "Repair" (owner decision
2026-10-16), P4 "Inbox" vs "Messages", P5 clipped count pill, P8 repeated "Next rent", P10 "Back to Workspace".

## 2. Context
- HEAD after 238c packet. iPhone app = Capacitor web view with `contentInset: "never"` and the status bar overlaying the
  web view, so pages must add `env(safe-area-inset-top)` themselves.
- **P3:** on the iPhone, the owner **Money** page (Wallet look) and **/settings** draw their title under the status bar
  (Home, Homes, Messages are fine). Existing safe-area patterns: `app/globals.css:525`
  (`padding-top: env(safe-area-inset-top)`), `components/dashboard/sidebar/sidebar-nav.tsx:445-448`,
  `components/ui/mobile-drawer.tsx:29`. Settings page: `app/settings/page.tsx` (header at ~:110-120). Find the Money
  page/header component (owner `section=money` / `app/owner/money/page.tsx`) and the Settings header.
- **P2:** `components/help-menu.tsx:73-74` fixed "?" button (bottom-right, above the owner tab bar) covers "See all"
  (owner Home), "Start conversation" (Messages), and the rent progress bar (manager Home).
- **P7:** tenant wording still "Problem": `app/tenant/tenant-page-helpers.ts:6`, `app/tenant/page.tsx:212`,
  `components/dashboard/sidebar/nav-items.ts:162,166`, `components/dashboard/tenant-bottom-bar.tsx:11`,
  `components/dashboard/tenant-overview.tsx:82-83,92,101`, `components/dashboard/maintenance-section.tsx:142`.
- **P4:** owner tab label `Inbox` (`components/dashboard/owner-bottom-bar.tsx:20,28,40`,
  `components/dashboard/dashboard-config.ts:128`, `sections/render-section-cases.tsx:156`) opens a page titled
  "Messages"; the drawer uses a bell icon for Messages while the tab uses a chat bubble.
- **P5:** `components/dashboard/inbox-section.tsx:391` `<Badge>{thread.messageCount} msg</Badge>` wraps/clips at 375 px.
- **P8:** `components/dashboard/tenant-rent-card.tsx:133,148` (and `pay-rent-card.tsx:120`) show a "Next rent" label
  followed by "Next rent: $1,200 on Nov 15."
- **P10:** "Back to Workspace" at `app/settings/page.tsx:117` and `app/owner/reports/page.tsx:107`.

## 3. In scope
P3, P2, P7, P4, P5, P8, P10 only.

## 4. Out of scope
Manager navigation/tab bar and Manager Home redesign (Sprint 237c); Wallet redesign of Messages/Settings; any logic.

## 5. Exact files expected to change
The files named in §2 for each finding (and the Money header file Codex locates for P3), plus their tests and the
plain-language guard's list if a word changes. Name every file in the report.

## 6. Implementation requirements
1. **P3:** Money and Settings headers start below the status bar on iPhone (use the existing safe-area pattern; no change
   on desktop). Check every other top-level page reached from the owner/tenant tab bars and the drawer; fix any other page
   with the same problem the same way and list it.
2. **P2:** the help button never covers interactive content: on phone widths add bottom padding to the main scroll
   container equal to the button's height + gap (so the last item can scroll clear), and keep the button above the tab
   bar. Do not hide the button.
3. **P7 (owner decision: "Repair"):** tenant UI says `Repairs` (nav, tab, section title), `Report a repair`,
   `Your repairs`, `No open repairs.`, `{n} open repairs.` (singular `1 open repair.`), click hint `open repairs`. Update
   tests. Values/ids (`maintenance`) unchanged.
4. **P4:** the owner tab label becomes `Messages` (matches the page title); the drawer's Messages icon matches the tab
   (chat bubble). Section id `inbox` unchanged.
5. **P5:** the count pill never wraps (`whitespace-nowrap`, shrink-0); text `1 message` / `{n} messages` (no "msg").
6. **P8:** keep the "Next rent" label; the value line reads `$1,200 on Nov 15.` (no repeated words) in both cards.
7. **P10:** `Back to Workspace` → `Back to Home`, linking to the role's home.
8. Plain language (6th grade, ≤ 12 words per sentence), lines ≤ 140, files ≤ 500. The user should never need to read
   instructions to complete this flow.

## 7. Validation commands
```
cd apps/web && npx vitest run --reporter=dot
cd apps/web && npx tsc --noEmit
npm run lint:web
```
Do NOT run `npm run gate:web`. Claude verifies on the iPhone Simulator.

## 8. Acceptance criteria
1. Tests: tenant labels exactly as in §6.3 (nav, bottom bar, overview, section title, singular/plural); owner tab label
   `Messages` with section id `inbox`; pill text `1 message`/`3 messages` with no-wrap classes; rent card value text has
   no "Next rent:" prefix; Settings/Reports link text `Back to Home` with the role home href; main container has the
   phone bottom padding class; Money/Settings headers include the safe-area top class.
2. (Claude, Simulator) Money and Settings titles fully below the status bar; "See all", "Start conversation" and the
   manager rent bar reachable without the "?" covering them; light and dark.
3. Full suite + plain-language guard green.

## 9. Report format
Compact status only: files changed with line counts, tests per criterion, command results. Do NOT include "Claude
prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
Only the findings in §1. No new dependencies. No logic or data changes.
