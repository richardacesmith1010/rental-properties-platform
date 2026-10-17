# Sprint 238e — Phone menus: Help moves into the menus, and owners can sign out (L2) — rev 2 (adds F2 sign-out)

## 1. Objective
Phone walk finding P2 (`docs/phone-walk-2026-10-16.md`): the round **?** help button floats over page content. After 238d
the page can scroll clear of it, but at rest it still covers the last row's arrow on owner Home and Money (Simulator,
2026-10-16, light and dark). On phones, pages with a bottom tab bar should not show the floating button; the same Help
options live in the menu the user already opens.
Also fix real-iPhone finding **F2** (2026-10-16, TestFlight build 2): **owners cannot sign out on a phone.** Sign Out lives
only in `components/dashboard/user-menu-popover.tsx` (`handleSignOut` at `:94-101`: browser `supabase.auth.signOut()`, then
`window.location.href = "/login"`), which sits in the top-bar avatar (`MobileUserFooter`). The owner tab-bar layout hides
that bar; the owner More drawers have Settings, Help and Theme only; `/settings` has no sign-out.

## 2. Context
- `apps/web/components/help-menu.tsx` (118 lines): `HelpMenu` is rendered once for every page in `app/layout.tsx:122`.
  Fixed position at `:73-75` (`/owner` and `/tenant` get `bottom-[…+6rem]` to clear the tab bar). Menu items at `:96-115`:
  `Ask Domus` (only when `assistantAvailable`; opens via `OPEN_AI_ASSISTANT_EVENT`), `FeedbackButton`, `Privacy`, `Terms`,
  `Support`. Tests: `components/__tests__/help-menu.test.tsx`; `lib/__tests__/native-layout.test.tsx` mocks `HelpMenu`.
- Owner phone tab bar: `components/dashboard/owner-bottom-bar.tsx` (122 lines). Its **More** tab opens
  `StandaloneDrawer` (`:46-68`): menu groups, then `Settings`, then theme buttons.
- Tenant phone tab bar: `components/dashboard/tenant-bottom-bar.tsx`. Tenants open the top-right menu (≡) from
  `MobileTopBar` in `components/dashboard/sidebar/sidebar-nav.tsx:304` (file is **499 lines**: add at most a few lines;
  put new UI in a separate component).
- Manager phone tab bar arrives in Sprint 237c-2 (`components/dashboard/manager-bottom-bar.tsx`, with a **More** drawer).
  This sprint runs after 237c-2 ships; if that file does not exist, stop and report.
- Below `lg` the tab bars are shown (`lg:hidden`); at `lg` and up the sidebar is shown and the floating button stays.

## 3. In scope
Hide the floating help button on phones for tab-bar pages; add a `Help` group with the same options to the owner More
drawer, the manager More drawer and the tenant ≡ menu; add `Sign out` to the owner and manager More drawers and to the
bottom of `/settings` for every role; tests.

## 4. Out of scope
Desktop (`lg` and up) behavior, pages without a tab bar (they keep the floating button exactly as today), Ask Domus itself,
feedback dialog contents, any copy other than the group label `Help`.

## 5. Exact files expected to change
1. `apps/web/components/help-menu.tsx` (extract the item list into an exported `HelpMenuItems`; hide rule)
2. `apps/web/components/dashboard/owner-bottom-bar.tsx` (Help group in `StandaloneDrawer`)
3. `apps/web/components/dashboard/manager-bottom-bar.tsx` (Help group in its More drawer)
4. `apps/web/components/dashboard/sidebar/sidebar-nav.tsx` (tenant ≡ drawer renders the Help group; ≤ 5 added lines)
5. `apps/web/components/shared/sign-out-button.tsx` (new: the one sign-out implementation)
6. `apps/web/components/dashboard/user-menu-popover.tsx` (use the shared sign-out; behavior unchanged)
7. `apps/web/components/settings/settings-layout.tsx` (a `Sign out` row at the bottom, every role)
8. `apps/web/components/__tests__/help-menu.test.tsx`, plus tests next to the owner/manager bottom bars, the tenant menu,
   the popover and settings

## 6. Implementation requirements
1. **One source of items (DRY):** `HelpMenuItems` renders the same five options with the same labels, titles, links,
   `Ask Domus` availability rule and feedback action as today. `HelpMenu` and all three menus use it.
2. **Hide rule:** below `lg`, on paths that show a bottom tab bar (`/owner…`, `/manager…`, `/tenant…`), the floating
   button is not rendered (`lg:` keeps it). Everywhere else nothing changes, including `/settings`, `/login`, `/support`.
3. **Menus:** a group labelled `Help`, placed after the main items and before `Settings` (owner/manager) or at the end of
   the tenant ≡ menu. Choosing an item closes the drawer first; `Ask Domus` then opens the assistant; `Send feedback`
   opens the existing feedback dialog (it must stay open and focusable after the drawer closes).
4. Tap targets ≥ 44 px; text readable in light and dark; plain language. The user should never need to read instructions
   to complete this flow.
5. **Sign out (F2):** move `handleSignOut` from the popover into `SignOutButton` (same steps: disable while signing out,
   label `Signing out...`, browser `supabase.auth.signOut()`, then `window.location.href = "/login"` in `finally`). The
   popover renders `SignOutButton` (pin today's label `Sign Out`, title and behavior — L-014). Owner and manager More drawers
   show `Sign out` as the last item (after Settings and Help, before Theme); `/settings` shows it at the bottom for owner,
   manager and tenant. Tap target ≥ 44 px.
6. Lines ≤ 140, files ≤ 500 (sidebar-nav stays ≤ 500), no new dependencies.

## 7. Validation commands
```
cd apps/web && npx vitest run --reporter=dot
cd apps/web && npx tsc --noEmit
npm run lint:web
```
Do NOT run `npm run gate:web`. Claude walks it on the iPhone Simulator.

## 8. Acceptance criteria
1. `help-menu.test.tsx`: at a phone width on `/owner`, `/owner/money`, `/manager` and `/tenant` the floating Help button is
   not rendered; on `/settings` and `/login` it is; at `lg` it is rendered on `/owner`. Existing help-menu tests stay green.
2. Owner More drawer test: shows group `Help` with `Send feedback`, `Privacy`, `Terms`, `Support`, and `Ask Domus` only when
   the availability flag is true; `Ask Domus` closes the drawer and dispatches `OPEN_AI_ASSISTANT_EVENT` once.
3. Manager More drawer test: same as 2.
4. Tenant ≡ menu test: shows the `Help` group (no `Ask Domus` for tenants unless the flag is true, same rule as today).
5. `Send feedback` from a drawer opens the feedback dialog and it remains open after the drawer closes.
5b. Sign out: owner More drawer (both drawers: the dashboard drawer and `StandaloneDrawer`), manager More drawer and
    `/settings` (all three roles) render `Sign out`; clicking it calls `supabase.auth.signOut()` once and then sets
    `window.location.href` to `/login` (also when signOut rejects); the popover still shows `Sign Out` and behaves the same.
6. (Claude) Simulator, light and dark: owner Home and Money show no floating button and nothing covers the last row; More →
   Help → Support opens `/support`; More → Sign out lands on `/login` and a relaunch stays signed out.

## 9. Report format
Compact status only: files changed with line counts, tests per criterion, command results. Do NOT include "Claude prompt"
or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
Only the files in §5. No new dependencies. No server or database changes.
