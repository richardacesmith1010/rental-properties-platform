# Sprint 45 — Codex Implementation Prompt

## 1. Objective

Add property-level drill-down with a property selector, breadcrumb navigation for section depth, and a property summary card that appears when a property is selected — giving owners a property-scoped view of their data.

## 2. Context

- **Branch**: `main`
- **HEAD**: `aff7eb0`
- **Gate baseline**: all unit tests passing, lint clean, typecheck clean, build clean
- **Production URL**: `https://domusbase.com`

**Current navigation:**
- Sidebar nav with `activeSection` state, no property-level filtering
- URL: `/owner?section=<id>&account=<id>` — no property param
- Properties listed in Portfolio section (flat list, no drill-down)
- No breadcrumb component exists
- `dashboard-data-loader.tsx` manages `activeSection`, `goToSection`, `goToPreviousSection`

**Key files:**
- `components/dashboard/sidebar/nav-items.ts` — nav item definitions
- `components/dashboard/sidebar/sidebar-nav.tsx` — sidebar renderer
- `components/dashboard/section-renderer.tsx` — section switch
- `components/dashboard/dashboard-data-loader.tsx` — state management
- `components/dashboard/portfolio-section.tsx` — property list
- `app/owner/page.tsx` — URL param parsing

## 3. In Scope

### Part A: Property Selector
- Add a property dropdown/selector to the top of the main content area (below page header, above KPI grid)
- Options: "All Properties" (default) + each property by name/address
- When a property is selected, KPI cards and charges/maintenance/leases filter to that property
- Selection persists in URL: `&property=<id>` query param
- "All Properties" clears the filter

### Part B: Breadcrumb Navigation
- Add a breadcrumb trail at the top of the content area showing navigation depth
- Pattern: `Dashboard > [Section Name]` or `Dashboard > Portfolio > [Property Name]`
- Clicking breadcrumb segments navigates back to that level
- Breadcrumbs appear on all section views (not just overview)

### Part C: Property Summary Card
- When a property is selected via the selector, show a property summary card below breadcrumbs:
  - Property name and address
  - Unit count and occupancy for this property
  - Monthly rent total for this property
  - Open maintenance tickets for this property
- Card has a "View Details" link that navigates to the portfolio section filtered to that property

### Part D: Property Drill-Down from Portfolio
- In portfolio-section.tsx, make each property card clickable
- Clicking a property card sets the property filter and navigates to overview (filtered to that property)
- This creates a natural drill-down: Portfolio → click property → see property-scoped dashboard

## 4. Out of Scope

- Tenant or manager dashboard changes
- New database queries or migrations
- Property editing/creation UI changes
- Mobile-specific navigation (responsive is fine, but no bottom nav)
- CLAUDE.md / AGENTS.md edits

## 5. Exact Files Expected to Change

### New Files (2-3)
1. `apps/web/components/dashboard/breadcrumbs.tsx` — breadcrumb trail component
2. `apps/web/components/dashboard/property-selector.tsx` — property dropdown
3. `apps/web/components/dashboard/property-summary-card.tsx` — property-scoped summary

### Modified Files (5-7)
1. `apps/web/components/dashboard/dashboard-data-loader.tsx` — add `selectedPropertyId` state, filter data, pass to children
2. `apps/web/components/dashboard/section-renderer.tsx` — render breadcrumbs + property selector + summary card in layout
3. `apps/web/components/dashboard/portfolio-section.tsx` — make property cards clickable for drill-down
4. `apps/web/components/dashboard/kpi-grid.tsx` — accept filtered KPIs (or the data-loader pre-filters)
5. `apps/web/app/owner/page.tsx` — parse `property` query param, pass to dashboard
6. `apps/web/components/dashboard/charges-section.tsx` — filter charges by selected property (if not handled by data-loader)
7. `apps/web/components/dashboard/maintenance-section.tsx` — filter tickets by selected property (if not handled by data-loader)

## 6. Implementation Requirements

### Part A: Property Selector

**New file: `property-selector.tsx`**

```tsx
interface PropertySelectorProps {
  properties: Array<{ id: string; name: string; address?: string }>;
  selectedPropertyId: string | null;
  onSelect: (propertyId: string | null) => void;
}
```

- Render as a clean dropdown/select with search capability (use existing Select/Combobox from UI library, or a simple `<select>` if no combobox exists)
- First option: "All Properties" (value: null)
- Each property shows name and optional address line
- Styled to match the existing dashboard aesthetic (rounded, border, same font)
- Place above the KPI grid area, right-aligned or inline with the section heading

**State management in `dashboard-data-loader.tsx`:**

```typescript
const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(
  initialPropertyId ?? null  // from URL param
);

// Update URL when property changes
const selectProperty = useCallback((propertyId: string | null) => {
  setSelectedPropertyId(propertyId);
  const params = new URLSearchParams(window.location.search);
  if (propertyId) {
    params.set("property", propertyId);
  } else {
    params.delete("property");
  }
  window.history.replaceState(null, "", `?${params.toString()}`);
}, []);
```

**Data filtering:** When a property is selected, filter the following data BEFORE passing to section components:
- `charges` → filter by `charge.propertyId === selectedPropertyId` (check actual field name)
- `tickets` → filter by `ticket.propertyId === selectedPropertyId`
- `portfolio.properties` → filter to just the selected property
- KPI recomputation → recalculate from filtered data

**IMPORTANT:** Check the actual data shapes in dashboard-data-loader to find the correct property ID field names. Don't assume field names — read the actual types.

### Part B: Breadcrumbs

**New file: `breadcrumbs.tsx`**

```tsx
interface BreadcrumbItem {
  label: string;
  onClick?: () => void;  // undefined = current page (not clickable)
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
      {items.map((item, i) => (
        <Fragment key={i}>
          {i > 0 && <ChevronRight className="h-3.5 w-3.5" />}
          {item.onClick ? (
            <button
              onClick={item.onClick}
              className="hover:text-foreground transition-colors"
            >
              {item.label}
            </button>
          ) : (
            <span className="text-foreground font-medium">{item.label}</span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
```

**Breadcrumb logic in section-renderer:**

```typescript
function buildBreadcrumbs(activeSection: string, selectedProperty: Property | null, goToSection: Function): BreadcrumbItem[] {
  const items: BreadcrumbItem[] = [
    { label: "Dashboard", onClick: () => goToSection("overview") }
  ];

  if (activeSection !== "overview") {
    // Get section display name from nav-items or a label map
    const sectionLabel = getSectionLabel(activeSection);

    if (selectedProperty) {
      items.push({ label: sectionLabel, onClick: () => goToSection(activeSection) });
      items.push({ label: selectedProperty.name });
    } else {
      items.push({ label: sectionLabel });
    }
  } else if (selectedProperty) {
    items.push({ label: selectedProperty.name });
  }

  return items;
}
```

### Part C: Property Summary Card

**New file: `property-summary-card.tsx`**

Only renders when a property is selected. Shows a compact horizontal card:

```tsx
interface PropertySummaryCardProps {
  property: {
    id: string;
    name: string;
    address?: string;
  };
  unitCount: number;
  occupiedUnits: number;
  monthlyRentCents: number;
  openTickets: number;
  onViewDetails: () => void;
}

export function PropertySummaryCard(props: PropertySummaryCardProps) {
  const occupancy = props.unitCount > 0
    ? Math.round((props.occupiedUnits / props.unitCount) * 100)
    : 0;

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm mb-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg">{props.property.name}</h3>
          {props.property.address && (
            <p className="text-sm text-muted-foreground">{props.property.address}</p>
          )}
        </div>

        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className="text-lg font-bold">{occupancy}%</div>
            <div className="text-xs text-muted-foreground">Occupancy</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold">{props.unitCount}</div>
            <div className="text-xs text-muted-foreground">Units</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold">{formatCurrency(props.monthlyRentCents)}</div>
            <div className="text-xs text-muted-foreground">Monthly Rent</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold">{props.openTickets}</div>
            <div className="text-xs text-muted-foreground">Open Tickets</div>
          </div>

          <button
            onClick={props.onViewDetails}
            className="text-sm text-primary hover:underline ml-4"
          >
            View Details →
          </button>
        </div>
      </div>
    </div>
  );
}
```

### Part D: Portfolio Drill-Down

**In `portfolio-section.tsx`:**

Each property card should be wrapped with an onClick handler:

```tsx
<div
  onClick={() => onSelectProperty(property.id)}
  className="cursor-pointer hover:shadow-md transition-shadow"
  role="button"
  tabIndex={0}
  onKeyDown={(e) => e.key === "Enter" && onSelectProperty(property.id)}
>
  {/* existing property card content */}
</div>
```

The `onSelectProperty` callback should:
1. Set the property filter via `selectProperty(propertyId)`
2. Navigate to overview: `goToSection("overview")`

This creates the drill-down: Portfolio list → click property → property-scoped overview with summary card + filtered KPIs.

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] Property selector dropdown renders above KPI grid with "All Properties" default
2. [ ] Selecting a property filters KPI cards, charges, maintenance, and collection bar to that property
3. [ ] Property selection persists in URL as `&property=<id>` query param
4. [ ] "All Properties" clears filter and shows full portfolio data
5. [ ] Breadcrumbs render on all sections: `Dashboard > Section Name`
6. [ ] Breadcrumbs show property name when property selected: `Dashboard > Property Name`
7. [ ] Clicking breadcrumb segments navigates to that level
8. [ ] Property summary card appears when property is selected (name, address, occupancy, units, rent, tickets)
9. [ ] Summary card hidden when "All Properties" selected
10. [ ] Property cards in portfolio section are clickable and drill down to property-scoped overview
11. [ ] Keyboard accessible (Enter key on property cards works)
12. [ ] Empty state handled (no properties, property with no units/charges)
13. [ ] `npm run gate:web` passes — all unit tests, lint, typecheck, build clean
14. [ ] No regressions to existing dashboard functionality

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
NEW_FILES: [list]
TESTS_UNIT: xxx/xxx
LINT: clean | [errors]
TYPECHECK: clean | [errors]
BUILD: clean | [errors]
PROPERTY_SELECTOR: working | broken
BREADCRUMBS: working | broken
SUMMARY_CARD: working | broken
DRILL_DOWN: working | broken
NOTES: [any issues encountered]
```

## 10. Constraints

- Do NOT create new database migrations or queries — filter existing loaded data client-side
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT modify E2E test files
- Do NOT install new npm dependencies
- Do NOT change tenant or manager dashboards
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Use `window.history.replaceState` for URL updates (not router.push to avoid full reload)
- Property filtering must be client-side from already-loaded data (no new fetch calls)
- All new components must handle zero/empty states gracefully
