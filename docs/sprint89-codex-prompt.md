# Sprint 89 — Mobile Final Pass

## 1. Objective

Audit and fix every page in the app at 375px viewport width (iPhone SE) to ensure a fully usable mobile experience. No horizontal scrolling, proper touch targets, bottom-sheet modals, drawer sidebar, and single-column card layouts throughout.

## 2. Context

- **Branch:** main
- **HEAD:** 00446c0
- **Production URL:** https://domusbase.com
- **Supabase project ID:** vawqdqkaguhdgfhdebqw

## 3. In Scope

- Mobile layout fixes for ALL pages at 375px width
- Touch target sizing (minimum 44px)
- Modal conversion to full-width bottom-sheet style on mobile
- Sidebar as drawer overlay on mobile
- Single-column card stacking
- Text truncation fixes
- Pay rent card hero treatment on tenant mobile
- Pagination arrow accessibility
- Account switcher mobile behavior
- Feedback widget mobile positioning

## 4. Out of Scope

- Desktop layout changes (all changes scoped to mobile breakpoints only)
- New features or pages
- Database migrations
- Server action changes
- Performance optimization

## 5. Exact Files Expected to Change

- `apps/web/components/sidebar/app-sidebar.tsx` (drawer overlay on mobile)
- `apps/web/components/sidebar/account-switcher.tsx` (mobile dropdown behavior)
- `apps/web/components/ui/dialog.tsx` or `apps/web/components/ui/sheet.tsx` (bottom-sheet modal)
- `apps/web/components/dashboard/home-section.tsx` (action center mobile layout)
- `apps/web/components/dashboard/financial-overview.tsx` (single column on mobile)
- `apps/web/components/dashboard/charges-section.tsx` (card stacking)
- `apps/web/components/dashboard/portfolio-section.tsx` (card stacking)
- `apps/web/components/dashboard/maintenance-section.tsx` (card stacking)
- `apps/web/components/dashboard/leases-section.tsx` (card stacking)
- `apps/web/components/dashboard/members-section.tsx` (card stacking)
- `apps/web/components/dashboard/paginated-layout.tsx` (pagination touch targets)
- `apps/web/components/tenant/pay-rent-card.tsx` (hero treatment)
- `apps/web/components/feedback-widget.tsx` (mobile positioning)
- `apps/web/app/(marketing)/page.tsx` (marketing page mobile)
- `apps/web/app/login/page.tsx` (stacked layout instead of split)
- `apps/web/components/wizards/property-wizard.tsx` (full-width steps on mobile)
- `apps/web/components/wizards/lease-wizard.tsx` (full-width steps on mobile)
- `apps/web/components/wizards/tenant-invite-wizard.tsx` (full-width steps on mobile)
- `apps/web/app/owner/settings/page.tsx` (single column on mobile)
- `apps/web/app/owner/reports/page.tsx` (single column on mobile)
- `apps/web/app/globals.css` (mobile utility classes)

## 6. Implementation Requirements

### Global Mobile Utilities

Add to `globals.css` or a mobile utilities file:

```css
@media (max-width: 640px) {
  .mobile-full-width { width: 100% !important; }
  .mobile-stack { flex-direction: column !important; }
  .mobile-hide { display: none !important; }
}
```

### Page-by-Page Requirements

**1. Marketing page (`app/(marketing)/page.tsx`)**
- Hero text: reduce font size to fit 375px without overflow
- CTA buttons: full width, stacked vertically
- Feature cards: single column
- No horizontal scroll

**2. Login page (`app/login/page.tsx`)**
- Split layout (image + form side by side) → stacked on mobile
- Form centered, full width with padding
- Social login buttons full width

**3. Owner Dashboard — Home**
- Action center cards: single column, full width
- Financial overview: KPI cards stack 2x2 or single column
- No content cut off

**4. Owner Dashboard — Section Pages (charges, portfolio, maintenance, leases, members)**
- All cards: single column, full width
- Table views: horizontal scroll container with `-webkit-overflow-scrolling: touch` if tables exist
- Filter/search bars: stack vertically on mobile
- Compact header: reduce spacing

**5. Property Wizard / Lease Wizard / Tenant Invite Wizard**
- Steps: full width
- Form fields: single column
- Step indicator: compressed or scrollable
- Buttons: full width at bottom

**6. Settings page**
- Tabs: scrollable horizontal tab bar (not wrapping)
- Form sections: single column
- Save buttons: full width

**7. Reports page**
- Charts: full width, reduce height
- Data tables: horizontal scroll wrapper

**8. Tenant Dashboard**
- Pay rent card: HERO treatment — full width, large "Pay Rent" button (min 56px height), prominent position at top
- Other cards: single column below
- Amount display: large, readable font

**9. Manager Dashboard**
- Task cards: single column, full width
- Property selector: full width dropdown

### Sidebar as Drawer

On viewports <= 640px:
- Sidebar renders as a Sheet/Drawer overlay (not pushing content)
- Hamburger menu icon in top-left corner to toggle
- Drawer slides in from left
- Backdrop overlay to close on tap outside
- Account switcher works inside the drawer

### Modals as Bottom Sheets

On viewports <= 640px:
- All Dialog components render as bottom sheets (slide up from bottom)
- Full width, max-height 90vh, rounded top corners
- Scrollable content area
- Close button visible at top-right
- Handle/drag indicator at top (optional)

### Touch Targets

Scan all interactive elements and ensure:
- Minimum 44x44px tap area
- Adequate spacing between adjacent tap targets (at least 8px gap)
- Pagination arrows: min 44x44px with clear hit area

### Feedback Widget

On mobile:
- Position: bottom-right, but ensure it doesn't overlap the pay rent button or navigation
- When open: full-width bottom sheet, not a small floating panel
- Close button clearly visible

### Account Switcher on Mobile

- Must work inside the drawer sidebar
- Dropdown opens within the drawer, not behind it
- Selected account clearly visible

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

- [ ] No horizontal scrolling on any page at 375px viewport width
- [ ] All buttons and interactive elements have minimum 44px touch targets
- [ ] Modals render as full-width bottom sheets on mobile
- [ ] Sidebar renders as a drawer overlay on mobile with hamburger toggle
- [ ] All card layouts are single-column on mobile
- [ ] Pay rent card is the hero element on tenant mobile (full width, large button)
- [ ] Pagination arrows are reachable with thumbs (44px+ tap area)
- [ ] Account switcher works on mobile (inside drawer)
- [ ] Feedback widget does not overlap content on mobile
- [ ] Login page uses stacked layout on mobile
- [ ] Marketing page has no overflow on mobile
- [ ] Wizards (property, lease, tenant invite) are full-width on mobile
- [ ] `npm run gate:web` passes (lint, typecheck, build, tests)
- [ ] No desktop layout regressions (all changes behind mobile breakpoints)

## 9. Report Format

```
pages_audited: [list of all 11 page groups]
horizontal_scroll_fixed: true/false
touch_targets_44px: true/false
modals_bottom_sheet: true/false
sidebar_drawer: true/false
cards_single_column: true/false
pay_rent_hero: true/false
pagination_accessible: true/false
account_switcher_mobile: true/false
feedback_widget_positioned: true/false
gate_passed: true/false
files_changed: [list]
```

## 10. Constraints

- Do NOT deploy to production
- Do NOT edit CLAUDE.md or AGENTS.md
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Do NOT change database schema or run migrations
- Do NOT change any server action logic
- All layout changes must be scoped to mobile breakpoints (max-width: 640px) — do not break desktop
- Report compact status only
