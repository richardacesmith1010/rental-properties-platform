# Sprint 27 — Premium Sidebar Polish

## Objective

Remove clutter, tighten hierarchy, and make the sidebar feel like a premium product (Stripe/Linear quality). Six user-reported issues to fix across 4 files. Zero new features — pure UI polish.

## Context

- Branch: `main`
- HEAD: `4dea59f` (Sprint 26 — a11y improvements)
- Gate baseline: 503/503 tests, lint clean, typecheck clean, build clean
- Production: `https://domusbase.com`

## In Scope

1. Shorten search placeholder
2. Remove "Coming Soon" disabled items from user menu popover
3. Remove email from sidebar footer (keep it in popover panel)
4. Add green/red Stripe status dot next to user display name
5. Remove Settings button from sidebar (already in user menu popover)
6. Remove standalone Reports button from sidebar controls zone
7. Add Reports as a nav list item (not standalone button)
8. Move notification bell to sidebar header (right of Domus logo)
9. Pass `stripeConnected` prop through sidebar components
10. Hide ConnectBanner when Stripe is connected (keep amber CTA when not connected)
11. Mirror all changes in MobileTopBar

## Out of Scope

- No new features or pages
- No test file modifications
- No new npm dependencies
- No DB/migration changes
- No deploy
- No changes to CLAUDE.md or AGENTS.md

## Exact Files Expected to Change

1. `apps/web/components/dashboard/global-search.tsx`
2. `apps/web/components/dashboard/user-menu-popover.tsx`
3. `apps/web/components/dashboard/sidebar-nav.tsx`
4. `apps/web/components/dashboard/index.tsx`

## Implementation Requirements

### Part A: Search Placeholder (`global-search.tsx`)

Change default `placeholder` prop value from `"Search properties, units, tenants..."` to `"Search..."`. One-line change on line 22.

### Part B: User Menu Popover (`user-menu-popover.tsx`)

1. **Remove "Coming Soon" items** — Delete the disabled "Language (Coming Soon)" button and "Upgrade Plan" button from the popover menu. Remove unused `Globe` and `ArrowUpCircle` imports from lucide-react.

2. **Remove email from sidebar footer** — Change the trigger button's secondary text from `{compact ? role : \`${role} · ${userEmail}\`}` to just `{role}`. The email remains visible inside the popover panel header when clicked.

3. **Add green/red Stripe status dot** — Add `stripeConnected?: boolean` optional prop to the interface. Destructure it. Render a small inline dot after the display name text:
   - Wrap display name in a flex container with `items-center gap-1.5`
   - The display name text in a `<span className="truncate">`
   - Conditionally render a `<span>` dot (`h-2 w-2 shrink-0 rounded-full`) with:
     - `bg-emerald-400` when `stripeConnected === true`
     - `bg-rose-400` when `stripeConnected === false`
     - Hidden (no dot rendered) when prop is `undefined` (tenant pages)
   - Guard: `typeof stripeConnected === "boolean"` before rendering the dot
   - Add `title` attribute: "Bank connected" / "Bank not connected"

### Part C: Sidebar Restructure (`sidebar-nav.tsx`)

1. **Add `stripeConnected?: boolean` to `SidebarNavProps`** — Destructure it in `SidebarNav`. Also add it to the `MobileTopBar` Pick type.

2. **Remove Settings button** — Delete the `<Link href="/settings">` block from the controls zone (the `<div className="space-y-2 px-3 pb-3">` section). Settings is already accessible via UserMenuPopover.

3. **Remove standalone Reports button** — Delete the `{reportsHref ? (<Link href={reportsHref}>...Reports</Link>) : null}` block from the controls zone.

4. **Add Reports as a nav item** — Create a helper function `injectReportsNavItem(navItems: NavItem[], reportsHref: string | null): NavItem[]` that:
   - Returns `navItems` unchanged if `reportsHref` is falsy
   - Returns `[...navItems, { id: "reports", label: "Reports", icon: BarChart3, href: reportsHref, description: "Financial reports and analytics.", clickHint: "open financial reports" }]` if truthy
   - Use this function in both `SidebarNav` and `MobileTopBar` to inject Reports into the NavList. Apply it to the resolved `navItems` before passing to `<NavList>`.

5. **Move notification bell to header** — Move `notificationButton` rendering into the header `<div>` (the one containing the Domus logo). Make the header `flex items-center justify-between`. Shrink the bell slightly for the header context: change `px-3 py-2` to `px-2 py-1.5` and icon from `h-4 w-4` to `h-3.5 w-3.5`. Remove the `<div className="flex justify-end">{notificationButton}</div>` from the controls zone.

6. **Pass `stripeConnected` to UserMenuPopover** — In both `SidebarNav` footer and `MobileTopBar`, add `stripeConnected={stripeConnected}` to the `<UserMenuPopover>` instances.

7. **Mirror all changes in MobileTopBar**:
   - Remove Settings link from the mobile drawer grid (`<Drawer.Close asChild><Link href="/settings">Settings</Link></Drawer.Close>`)
   - Remove Reports link from the mobile drawer grid
   - Reports appears in the mobile NavList via `injectReportsNavItem` (same helper function)
   - Bell stays in mobile top bar (already well-positioned, no move needed)
   - Pass `stripeConnected` to mobile `UserMenuPopover`

**Result after Part C:** The desktop controls zone contains only GlobalSearch + conditional Workspace button. The sidebar header has logo on left, bell on right. Reports is a regular nav item at the end of the list.

### Part D: Dashboard ConnectBanner (`index.tsx`)

1. **Pass `stripeConnected` to SidebarNav and MobileTopBar** — Add `stripeConnected={stripeConnected}` prop to all 4 `<SidebarNav>` / `<MobileTopBar>` instances (2 in the empty-state branch, 2 in the main branch).

2. **Hide ConnectBanner when connected** — Change the main-branch ConnectBanner condition from:
   ```tsx
   {(isOwnerRole || isManagerRole) && typeof stripeConnected === "boolean" ? (
   ```
   to:
   ```tsx
   {(isOwnerRole || isManagerRole) && stripeConnected === false ? (
   ```
   This hides the green "Bank Connected" banner (replaced by the small dot in sidebar footer). The amber "Connect Now" CTA still shows when not connected.

   The empty-state branch `<ConnectBanner>` also needs updating — change it to only render when `stripeConnected === false`:
   ```tsx
   {stripeConnected === false ? <ConnectBanner connected={false} role="owner" /> : null}
   ```

## Validation Commands to Run

```bash
npm run gate:web
```

This runs: 503+ tests (36 suites), ESLint, TypeScript strict check, Next.js production build.

## Acceptance Criteria

1. [ ] Settings button gone from sidebar controls zone and mobile drawer
2. [ ] Search placeholder reads "Search..." (not "Search properties, units, tenants...")
3. [ ] Reports is a nav list item (not a standalone button in controls zone)
4. [ ] Notification bell in sidebar header, right of Domus logo
5. [ ] User footer shows role only (no truncated email)
6. [ ] Green dot (bg-emerald-400) next to name when `stripeConnected === true`
7. [ ] Red dot (bg-rose-400) next to name when `stripeConnected === false`
8. [ ] No dot for tenant pages (when `stripeConnected` is undefined)
9. [ ] "Language (Coming Soon)" and "Upgrade Plan" removed from user menu popover
10. [ ] ConnectBanner hidden when `stripeConnected === true` (amber CTA still shows when false)
11. [ ] Mobile layout mirrors all desktop changes (no broken mobile drawer)
12. [ ] `npm run gate:web` passes (503+ tests, lint, typecheck, build)

## Report Format

```
gate_passed: true/false
test_count: <number>
lint_clean: true/false
typecheck_clean: true/false
build_clean: true/false
files_changed: <list>
```

## Constraints

- Do NOT modify test files
- Do NOT add new npm dependencies
- Do NOT modify DB or deploy
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Report compact status only
