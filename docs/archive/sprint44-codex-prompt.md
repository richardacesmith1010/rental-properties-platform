# Sprint 44 — Codex Implementation Prompt

## 1. Objective

Transform the owner dashboard into a financial command center with enhanced KPI cards, trend indicators, a rent collection progress bar, and a consistent status color system across all list views (charges, maintenance tickets, leases).

## 2. Context

- **Branch**: `main`
- **HEAD**: `67d6b37`
- **Gate baseline**: all unit tests passing, lint clean, typecheck clean, build clean
- **Production URL**: `https://domusbase.com`

**Existing infrastructure (DO NOT rebuild — extend):**
- `components/shared/kpi-card.tsx` — base card component (31 lines)
- `components/dashboard/kpi-grid.tsx` — current 4-card grid with gradient backgrounds
- `lib/dashboard.ts` — `DashboardKpis` type with: monthlyGrossRentCents, activeLeaseCount, occupiedUnits, totalUnits, openMaintenanceCount, highPriorityMaintenanceCount, lateRentCents, lateAccountCount
- `lib/analytics.ts` — `AnalyticsDashboardData.summaryKpis` with: collectionRate, avgDaysToPayment, totalIncomeCentsYtd, totalExpenseCentsYtd, netIncomeCentsYtd
- `components/dashboard/dashboard-data-loader.tsx` — already computes `occupancy` percentage
- `components/dashboard/section-renderer.tsx` — overview section renders Snapshot + KpiGrid
- Current gradient scheme: purple→green (rent), green (occupancy), orange→red (maintenance), pink→red (late rent)

## 3. In Scope

### Part A: Enhanced KPI Grid (6 cards, 2 rows of 3)
Expand the existing 4-card grid to 6 cards with richer data:

1. **Monthly Revenue** (existing, enhanced) — gross rent amount + trend arrow vs last month
2. **Occupancy Rate** (existing, enhanced) — percentage + "X/Y units" subtitle + color shifts (green >90%, yellow 70-90%, red <70%)
3. **Rent Collection** (NEW) — collection rate % this month + progress bar showing collected vs total due
4. **Outstanding Balance** (NEW) — total unpaid (pending + late) in dollars + count of accounts
5. **Open Maintenance** (existing, enhanced) — count + high-priority badge + trend
6. **Net Cash Flow** (NEW) — YTD income minus expenses, green if positive, red if negative

### Part B: Rent Collection Progress Bar
Below the KPI grid, add a horizontal rent collection tracker:
- Full-width bar showing: Collected (green fill) | Pending (yellow fill) | Overdue (red fill)
- Dollar amounts labeled on each segment
- "Rent collection this month: X%" label above
- This replicates the progress bar shown in Domus's own marketing page mockup

### Part C: Consistent Status Color System
Create a shared status color utility and apply it across ALL list views:

**Status → Color mapping:**
- `paid` / `resolved` / `complete` / `active` → Green (`text-emerald-600`, `bg-emerald-50`, border `border-emerald-200`)
- `pending` / `in_progress` / `upcoming` → Yellow/Amber (`text-amber-600`, `bg-amber-50`, `border-amber-200`)
- `late` / `overdue` / `urgent` / `expired` → Red (`text-red-600`, `bg-red-50`, `border-red-200`)
- `cancelled` / `inactive` / `void` → Gray (`text-gray-500`, `bg-gray-50`, `border-gray-200`)

**Apply to:**
- Charges list in charges-section.tsx (paid/pending/late badges)
- Maintenance tickets in maintenance section (open/in_progress/resolved)
- Lease status indicators (active/expired/upcoming)
- Any other list view with status indicators

### Part D: Trend Indicators
Add up/down/flat trend arrows to KPI cards where month-over-month data is available:
- Compare current month values to previous month
- ↑ green arrow if improving, ↓ red arrow if declining, → gray if flat
- Only show trends when historical data exists (don't show for new accounts)

## 4. Out of Scope

- Analytics section changes (leave the full analytics workflow alone)
- New database queries for historical trend data (use what's already available in analyticsData)
- Property-level drill-down (Sprint 45)
- Tenant dashboard changes
- Manager dashboard changes
- Database migrations
- CLAUDE.md / AGENTS.md edits

## 5. Exact Files Expected to Change

### New Files (2-3)
1. `apps/web/lib/status-colors.ts` — shared status→color mapping utility
2. `apps/web/components/dashboard/rent-collection-bar.tsx` — collection progress bar component
3. `apps/web/lib/__tests__/status-colors.test.ts` — tests for status color utility

### Modified Files (5-8)
1. `apps/web/components/dashboard/kpi-grid.tsx` — expand to 6 cards, 2 rows of 3, add trend indicators
2. `apps/web/components/shared/kpi-card.tsx` — add trend arrow prop, conditional color shifting
3. `apps/web/components/dashboard/section-renderer.tsx` — add rent collection bar to overview section
4. `apps/web/lib/dashboard.ts` — add computed KPIs: collectionRate, outstandingCents, netCashFlowCents (derive from existing data)
5. `apps/web/components/dashboard/charges-section.tsx` — use status-colors for charge badges
6. `apps/web/components/dashboard/ownership/account-card.tsx` — use status-colors if applicable
7. `apps/web/components/dashboard/dashboard-data-loader.tsx` — pass collection/outstanding data to section renderer (only if not already available)

## 6. Implementation Requirements

### Part A: Enhanced KPI Grid

**Modify `kpi-grid.tsx`:**

Change from 4-column grid to responsive 2-row × 3-column grid:
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
```

**6 cards with this data:**

```typescript
// Card 1: Monthly Revenue
{
  title: "Monthly Revenue",
  value: formatCurrency(kpis.monthlyGrossRentCents),
  subtitle: `${kpis.activeLeaseCount} active leases`,
  gradient: "linear-gradient(135deg, #7c3aed, #10b981)",  // keep existing
  trend: computeTrend(currentMonthRevenue, lastMonthRevenue),  // optional
}

// Card 2: Occupancy Rate
{
  title: "Occupancy",
  value: `${occupancy}%`,
  subtitle: `${kpis.occupiedUnits}/${kpis.totalUnits} units`,
  gradient: occupancy >= 90
    ? "linear-gradient(135deg, #10b981, #34d399)"   // green
    : occupancy >= 70
    ? "linear-gradient(135deg, #f59e0b, #fbbf24)"   // yellow
    : "linear-gradient(135deg, #ef4444, #f87171)",   // red
}

// Card 3: Rent Collection
{
  title: "Rent Collection",
  value: `${collectionRate}%`,
  subtitle: `${formatCurrency(collectedCents)} of ${formatCurrency(totalDueCents)}`,
  gradient: "linear-gradient(135deg, #3b82f6, #06b6d4)",  // blue→cyan
}

// Card 4: Outstanding Balance
{
  title: "Outstanding",
  value: formatCurrency(outstandingCents),
  subtitle: `${pendingCount + lateCount} accounts`,
  gradient: outstandingCents > 0
    ? "linear-gradient(135deg, #f59e0b, #ef4444)"   // orange→red
    : "linear-gradient(135deg, #10b981, #34d399)",   // green if zero
}

// Card 5: Open Maintenance
{
  title: "Open Tickets",
  value: String(kpis.openMaintenanceCount),
  subtitle: kpis.highPriorityMaintenanceCount > 0
    ? `${kpis.highPriorityMaintenanceCount} high priority`
    : "No urgent issues",
  gradient: "linear-gradient(135deg, #f59e0b, #ef4444)",  // keep existing
}

// Card 6: Net Cash Flow (YTD)
{
  title: "Net Cash Flow",
  value: formatCurrency(Math.abs(netCashFlowCents)),
  subtitle: netCashFlowCents >= 0 ? "YTD Profit" : "YTD Loss",
  gradient: netCashFlowCents >= 0
    ? "linear-gradient(135deg, #10b981, #059669)"   // green
    : "linear-gradient(135deg, #ef4444, #dc2626)",   // red
  prefix: netCashFlowCents < 0 ? "-" : "+",
}
```

**Modify `kpi-card.tsx`:**

Add optional `trend` prop:
```typescript
interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  gradient?: string;
  trend?: "up" | "down" | "flat" | null;  // NEW
  prefix?: string;  // NEW — for +/- on cash flow
}
```

Render trend indicator:
```tsx
{trend === "up" && <span className="text-emerald-300 text-sm ml-1">↑</span>}
{trend === "down" && <span className="text-red-300 text-sm ml-1">↓</span>}
{trend === "flat" && <span className="text-gray-300 text-sm ml-1">→</span>}
```

### Part B: Rent Collection Progress Bar

**New file: `rent-collection-bar.tsx`**

```tsx
interface RentCollectionBarProps {
  collectedCents: number;
  pendingCents: number;
  overdueCents: number;
}

export function RentCollectionBar({ collectedCents, pendingCents, overdueCents }: RentCollectionBarProps) {
  const totalCents = collectedCents + pendingCents + overdueCents;
  if (totalCents === 0) return null;  // Don't render if no rent due

  const collectedPct = (collectedCents / totalCents) * 100;
  const pendingPct = (pendingCents / totalCents) * 100;
  const overduePct = (overdueCents / totalCents) * 100;

  const collectionRate = Math.round(collectedPct);

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-muted-foreground">
          Rent collection this month
        </h3>
        <span className="text-lg font-bold">{collectionRate}%</span>
      </div>

      {/* Progress bar */}
      <div className="h-3 rounded-full overflow-hidden flex bg-gray-100">
        {collectedPct > 0 && (
          <div
            className="bg-emerald-500 transition-all duration-500"
            style={{ width: `${collectedPct}%` }}
          />
        )}
        {pendingPct > 0 && (
          <div
            className="bg-amber-400 transition-all duration-500"
            style={{ width: `${pendingPct}%` }}
          />
        )}
        {overduePct > 0 && (
          <div
            className="bg-red-500 transition-all duration-500"
            style={{ width: `${overduePct}%` }}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex gap-6 mt-3 text-sm">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span>Collected {formatCurrency(collectedCents)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <span>Pending {formatCurrency(pendingCents)}</span>
        </div>
        {overdueCents > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span>Overdue {formatCurrency(overdueCents)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Place in overview section** (section-renderer.tsx): Render between KpiGrid and the rest of the overview content.

### Part C: Status Color System

**New file: `lib/status-colors.ts`**

```typescript
export type StatusCategory = "success" | "warning" | "danger" | "neutral";

const STATUS_MAP: Record<string, StatusCategory> = {
  // Payment statuses
  paid: "success",
  collected: "success",
  completed: "success",
  complete: "success",

  // Active/positive states
  active: "success",
  resolved: "success",
  approved: "success",

  // Pending states
  pending: "warning",
  in_progress: "warning",
  upcoming: "warning",
  processing: "warning",
  submitted: "warning",

  // Alert states
  late: "danger",
  overdue: "danger",
  urgent: "danger",
  expired: "danger",
  rejected: "danger",
  failed: "danger",

  // Inactive states
  cancelled: "neutral",
  inactive: "neutral",
  void: "neutral",
  draft: "neutral",
};

export function getStatusCategory(status: string): StatusCategory {
  return STATUS_MAP[status.toLowerCase()] ?? "neutral";
}

export function getStatusClasses(status: string): {
  text: string;
  bg: string;
  border: string;
  dot: string;
} {
  const category = getStatusCategory(status);

  switch (category) {
    case "success":
      return {
        text: "text-emerald-700",
        bg: "bg-emerald-50",
        border: "border-emerald-200",
        dot: "bg-emerald-500",
      };
    case "warning":
      return {
        text: "text-amber-700",
        bg: "bg-amber-50",
        border: "border-amber-200",
        dot: "bg-amber-500",
      };
    case "danger":
      return {
        text: "text-red-700",
        bg: "bg-red-50",
        border: "border-red-200",
        dot: "bg-red-500",
      };
    case "neutral":
    default:
      return {
        text: "text-gray-600",
        bg: "bg-gray-50",
        border: "border-gray-200",
        dot: "bg-gray-400",
      };
  }
}

// Reusable badge component helper
export function statusBadgeClasses(status: string): string {
  const { text, bg, border } = getStatusClasses(status);
  return `inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${text} ${bg} border ${border}`;
}
```

**Apply to charges-section.tsx:**
Replace any hardcoded badge color logic with:
```tsx
import { statusBadgeClasses, getStatusClasses } from "@/lib/status-colors";

// In charge list rendering:
<span className={statusBadgeClasses(charge.status)}>
  <span className={`w-1.5 h-1.5 rounded-full ${getStatusClasses(charge.status).dot}`} />
  {charge.status}
</span>
```

Apply the same pattern to:
- Maintenance ticket status badges
- Lease status indicators
- Any other status display in dashboard sections

### Part D: Trend Computation

**In `lib/dashboard.ts` or a new helper:**

```typescript
export function computeTrend(
  current: number,
  previous: number | null
): "up" | "down" | "flat" | null {
  if (previous === null || previous === undefined) return null;
  if (current > previous) return "up";
  if (current < previous) return "down";
  return "flat";
}
```

Use analytics `summaryKpis` for YTD comparisons where available. If previous month data isn't available in the current data shape, return `null` (no trend shown). Do NOT add new database queries.

### Part E: Unit Tests

**New file: `lib/__tests__/status-colors.test.ts`**

Tests:
1. `getStatusCategory` returns correct category for each status string
2. `getStatusCategory` returns "neutral" for unknown status
3. `getStatusCategory` is case-insensitive
4. `getStatusClasses` returns correct Tailwind classes for each category
5. `statusBadgeClasses` returns combined class string
6. `computeTrend` returns correct direction
7. `computeTrend` returns null when previous is null

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] KPI grid shows 6 cards in 2×3 responsive layout (1 col mobile, 2 col tablet, 3 col desktop)
2. [ ] New cards: Rent Collection %, Outstanding Balance, Net Cash Flow (YTD)
3. [ ] Occupancy card color shifts based on rate (green >90%, yellow 70-90%, red <70%)
4. [ ] Net Cash Flow card shows green for profit, red for loss, with +/- prefix
5. [ ] Outstanding card shows orange→red when balance exists, green when zero
6. [ ] Rent collection progress bar renders below KPI grid with green/yellow/red segments
7. [ ] Progress bar shows dollar amounts in legend and collection % header
8. [ ] Progress bar hidden when no rent is due (empty state)
9. [ ] `status-colors.ts` utility exports `getStatusCategory`, `getStatusClasses`, `statusBadgeClasses`
10. [ ] Charges section uses status color system for paid/pending/late badges
11. [ ] Maintenance section uses status color system for ticket status
12. [ ] All status badges have consistent dot + label pattern
13. [ ] Trend arrows (↑↓→) appear on KPI cards when trend data available
14. [ ] No trend arrows shown for new accounts with no history
15. [ ] 7+ unit tests passing for status colors and trend computation
16. [ ] `npm run gate:web` passes — all unit tests, lint, typecheck, build clean
17. [ ] No regressions — existing dashboard functionality unchanged
18. [ ] Cards gracefully handle $0 / 0% / empty data states

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
NEW_FILES: [list]
TESTS_UNIT: xxx/xxx
LINT: clean | [errors]
TYPECHECK: clean | [errors]
BUILD: clean | [errors]
KPI_CARDS: 6/6 rendering
COLLECTION_BAR: working | broken
STATUS_COLORS_APPLIED: [list of sections]
NOTES: [any issues encountered]
```

## 10. Constraints

- Do NOT create new database migrations
- Do NOT add new database queries — use existing data from dashboard-data-loader and analyticsData
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT modify E2E test files
- Do NOT install new npm dependencies
- Do NOT change the Analytics section (separate workflow, leave as-is)
- Do NOT change tenant or manager dashboards
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Preserve existing KPI card gradient aesthetic — enhance, don't replace
- All new components must handle zero/empty data gracefully (no NaN, no division by zero)
- Use existing `formatCurrency` helper for all money formatting
