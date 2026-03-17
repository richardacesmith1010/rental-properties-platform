# Sprint 46 — Codex Implementation Prompt

## 1. Objective

Polish the visual presentation: contextual empty states for every section, upgrade card styling from flat borders to subtle shadows, improve typography hierarchy, and fix sidebar density/balance issues.

## 2. Context

- **Branch**: `main`
- **HEAD**: `52e7f43`
- **Gate baseline**: all unit tests passing, lint clean, typecheck clean, build clean
- **Production URL**: `https://domusbase.com`

**Current state:**
- Empty sections show generic "No data" or nothing at all
- Cards use `border` styling — no shadow depth
- Section headings lack consistent size hierarchy
- Sidebar has account switcher that clips text (e.g., "Ace's Account (Individua" is truncated)
- The account type badge "(Individual)" is unnecessary visual noise for most users

## 3. In Scope

### Part A: Contextual Empty States
For every major section that can be empty, add an illustrated empty state with:
- A relevant icon (from lucide-react)
- A descriptive heading explaining what will appear here
- A subtitle with a call-to-action or explanation
- An action button where applicable (e.g., "Add Your First Property", "Create a Lease")

**Sections needing empty states:**
1. Overview (no properties) — already has onboarding welcome, enhance it
2. Charges — "No charges yet. Charges will appear here once you create a lease with rent terms."
3. Maintenance — "No maintenance tickets. Tickets submitted by tenants will appear here."
4. Portfolio — "No properties yet. Add your first property to start managing your portfolio." + "Add Property" button
5. Units — "No units yet. Add a property first, then create units within it."
6. Leases — "No leases yet. Create a lease to start tracking rent and tenant information."
7. Documents — "No documents yet. Upload lease agreements, receipts, and other documents here."
8. Expenses — "No expenses recorded. Track property expenses for tax reporting and P&L."
9. Vendors — "No vendors yet. Add maintenance vendors and contractors for easy assignment."
10. Notifications — "No notifications. You're all caught up!"
11. Inbox — "No messages. Your inbox is empty."

### Part B: Card Shadow Upgrade
Replace flat `border` card styling with subtle shadow treatment across all dashboard cards:
- Main cards: `shadow-sm` with `border border-border/50` (softer border)
- Hover state on interactive cards: `hover:shadow-md transition-shadow`
- KPI cards already have gradients — add a subtle `shadow-md` to give them depth
- Report cards on the reports page: add `shadow-sm hover:shadow-md`

### Part C: Typography Hierarchy
Establish consistent heading sizes across all sections:
- Page title (e.g., "Financial Reports"): `text-2xl font-bold`
- Section heading (e.g., "Rent Roll", "Maintenance Tickets"): `text-xl font-semibold`
- Card title (e.g., individual charge or ticket): `text-base font-medium`
- Metadata/labels: `text-sm text-muted-foreground`
- Stat values in KPI cards: already good, leave as-is

Audit section headings in section-renderer.tsx and individual section components to ensure consistency.

### Part D: Sidebar Polish
1. **Remove account type badge** — hide "(Individual)" and "(LLC)" from the account switcher dropdown text. The account type is visible in the account management section, doesn't need to be in the switcher.
2. **Fix text truncation** — ensure account names in the switcher don't get clipped. Use `truncate` with appropriate `max-w` or allow the dropdown to be wider.
3. **Sidebar section spacing** — ensure consistent vertical spacing between nav groups (account area, nav items, user footer)

## 4. Out of Scope

- New features or functionality
- Tenant/manager dashboard changes (owner only for now)
- Database migrations
- Color scheme changes (keep existing purple/green/teal palette)
- Dark mode changes
- CLAUDE.md / AGENTS.md edits

## 5. Exact Files Expected to Change

### New Files (1-2)
1. `apps/web/components/dashboard/empty-state.tsx` — reusable empty state component
2. `apps/web/lib/__tests__/empty-state.test.ts` — optional, test that empty state renders

### Modified Files (10-15)
1. `apps/web/components/dashboard/section-renderer.tsx` — wrap sections with empty state checks
2. `apps/web/components/dashboard/charges-section.tsx` — add empty state
3. `apps/web/components/dashboard/maintenance-section.tsx` — add empty state
4. `apps/web/components/dashboard/portfolio-section.tsx` — add empty state
5. `apps/web/components/dashboard/leases-section.tsx` — add empty state
6. `apps/web/components/dashboard/vendors-section.tsx` — add empty state
7. `apps/web/components/dashboard/kpi-grid.tsx` — add shadow to cards
8. `apps/web/components/shared/kpi-card.tsx` — add shadow-md
9. `apps/web/components/dashboard/account-switcher.tsx` — remove type badge, fix truncation
10. `apps/web/components/dashboard/sidebar/sidebar-nav.tsx` — spacing improvements
11. `apps/web/app/owner/reports/page.tsx` or report components — shadow + heading consistency
12. Various section components — heading size consistency audit

## 6. Implementation Requirements

### Part A: Reusable Empty State Component

**New file: `empty-state.tsx`**

```tsx
import { type LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  heading: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, heading, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">{heading}</h3>
      <p className="text-sm text-muted-foreground max-w-md mb-6">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
```

**Usage in each section:**

```tsx
// In charges-section.tsx:
if (charges.length === 0) {
  return (
    <EmptyState
      icon={CreditCard}  // from lucide-react
      heading="No charges yet"
      description="Charges will appear here once you create a lease with rent terms."
    />
  );
}

// In portfolio-section.tsx:
if (properties.length === 0) {
  return (
    <EmptyState
      icon={Building2}
      heading="No properties yet"
      description="Add your first property to start managing your portfolio."
      actionLabel="Add Property"
      onAction={() => goToSection("portfolio")}  // or trigger add property flow
    />
  );
}
```

**Icon mapping per section:**
- Charges: `CreditCard`
- Maintenance: `Wrench`
- Portfolio: `Building2`
- Units: `DoorOpen` or `LayoutGrid`
- Leases: `FileText`
- Documents: `FolderOpen`
- Expenses: `Receipt`
- Vendors: `Users`
- Notifications: `Bell`
- Inbox: `Mail`

### Part B: Card Shadow Upgrade

**Global pattern — find cards using `border rounded` and upgrade:**

```tsx
// BEFORE:
<div className="rounded-lg border bg-card p-4">

// AFTER:
<div className="rounded-xl border border-border/50 bg-card p-4 shadow-sm">

// For interactive cards, add hover:
<div className="rounded-xl border border-border/50 bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
```

**KPI cards (`kpi-card.tsx`):**
Add `shadow-md` to the card wrapper that already has gradient backgrounds.

**Report cards** (reports page):
Add `shadow-sm hover:shadow-md transition-shadow cursor-pointer` to each report card.

**DO NOT** change the rent collection bar or breadcrumbs — those are navigation elements, not cards.

### Part C: Typography Consistency

Audit and standardize:

```tsx
// Page-level title (top of reports, settings, etc.):
<h1 className="text-2xl font-bold tracking-tight">Financial Reports</h1>

// Section heading (within dashboard sections):
<h2 className="text-xl font-semibold">Maintenance Tickets</h2>

// Card/item title:
<h3 className="text-base font-medium">Ticket #1234</h3>

// Label/metadata:
<span className="text-sm text-muted-foreground">Due March 15</span>
```

Check that sections in section-renderer.tsx use consistent heading levels. Some sections may use `h2` where they should use `h3`, or have inconsistent font sizes.

### Part D: Sidebar Polish

**In `account-switcher.tsx`:**

1. Remove account type from display text:
```tsx
// BEFORE:
`${account.displayName} (${account.accountType})`

// AFTER:
account.displayName
```

2. Fix truncation — ensure the dropdown trigger shows the full name or truncates gracefully:
```tsx
<span className="truncate block max-w-[180px]">{account.displayName}</span>
```

3. In the dropdown menu items, you can show the type as a subtle badge if needed for disambiguation (only when user has both individual and LLC accounts), but it should NOT be in the selected display.

**In `sidebar-nav.tsx`:**
- Ensure consistent `gap-` spacing between the account area, navigation list, and user footer
- The three zones should be: account selector (top), scrollable nav list (middle, flex-1), user footer (pinned bottom)

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] `EmptyState` component exists and renders icon, heading, description, optional action button
2. [ ] 8+ sections show contextual empty states when no data exists
3. [ ] Empty states have relevant icons and descriptive copy
4. [ ] Portfolio empty state has "Add Property" action button
5. [ ] All dashboard cards use `shadow-sm` with soft borders
6. [ ] Interactive cards have `hover:shadow-md` effect
7. [ ] KPI cards have `shadow-md` for depth
8. [ ] Section headings follow consistent size hierarchy (h1 2xl bold, h2 xl semibold, h3 base medium)
9. [ ] Account switcher no longer shows "(Individual)" or "(LLC)" in the selected display
10. [ ] Account names don't clip/truncate in the switcher
11. [ ] Sidebar has balanced spacing between account area, nav, and footer
12. [ ] `npm run gate:web` passes — all unit tests, lint, typecheck, build clean
13. [ ] No regressions — all existing functionality works

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
NEW_FILES: [list]
TESTS_UNIT: xxx/xxx
LINT: clean | [errors]
TYPECHECK: clean | [errors]
BUILD: clean | [errors]
EMPTY_STATES_ADDED: x sections
SHADOW_CARDS_UPDATED: x components
SIDEBAR_FIXES: [details]
NOTES: [any issues encountered]
```

## 10. Constraints

- Do NOT create new database migrations
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT modify E2E test files
- Do NOT install new npm dependencies
- Do NOT change the color palette or theme
- Do NOT change tenant or manager dashboards
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Preserve all existing functionality — this is visual polish only
- Use existing lucide-react icons (already installed)
- All empty states must be graceful — never show broken/error UI for zero data
