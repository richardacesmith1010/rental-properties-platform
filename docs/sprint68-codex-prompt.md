# Sprint 68 — Codex Implementation Prompt

## 1. Objective

Major dashboard layout overhaul: remove the persistent KPI header entirely, make the Home page a clean greeting-only landing, fix visual bugs across all section pages.

## 2. Context

- **Branch**: `main`
- **HEAD**: `0ffade6`
- **Production URL**: `https://domusbase.com`

**Current problems (user-reported + audit):**
1. Home page greeting + 4 KPI outline cards + mode bar + mascot message fills the entire viewport — no useful content visible
2. KPI cards on Home are dark outlines on dark background — low contrast, hard to read
3. Compact header text ("$0 rev 0% occ 0 tickets 0 due") is too small to read
4. Overview page (2 of 8) is too dense — property card + snapshot + 6 KPI gradient cards cramped
5. "0.0d" displayed for Avg Days to Pay — should show "—" when no data
6. Property Scope dropdown text clips the address
7. "1 units" grammar bug — should be "1 unit"
8. Mascot too small in empty states
9. "Management fee: $0.00" shows when it shouldn't
10. Analytics page is mostly empty — needs placeholder state

## 3. In Scope

### Part A: Remove KPI Header — Make Home a Clean Landing

**Remove entirely:**
- The 4 KPI outline cards ($0 Revenue, 0% Occupancy, 0 Tickets, 0 Overdue) from the Home page header
- The "Daily Operations Mode" bar
- The compact header bar on section pages ("Ace's Account $0 rev 0% occ...")

**Home page (1 of 8) should be ONLY:**
```
┌─────────────────────────────────────────┐
│  Good evening, Ace                      │
│  Everything looks good - no action      │  ~80px total
│  items today                            │
├─────────────────────────────────────────┤
│  Home                            < >    │  ~50px
│  1 of 8                                 │
├─────────────────────────────────────────┤
│                                         │
│  [Mascot - larger]                      │
│                                         │
│  Use the arrows to explore your         │  REST OF VIEWPORT
│  dashboard                              │
│                                         │
│  Quick actions:                         │
│  [New Property] [New Tenant] [Reports]  │
│                                         │
└─────────────────────────────────────────┘
```

The greeting is compact (2 lines max), then the mascot and a set of quick-action buttons. No KPI data on Home — that lives on Overview (page 2).

**Section pages (2-8) should have NO header bar at all** — just go straight into:
```
┌─────────────────────────────────────────┐
│  Overview                        < >    │  ~50px (section title + nav)
│  2 of 8                                 │
├─────────────────────────────────────────┤
│                                         │
│  (FULL VIEWPORT for section content)    │  ~650px available!
│                                         │
└─────────────────────────────────────────┘
```

No compact header, no KPI summary bar, no greeting on section pages. Just the section title with page nav arrows.

### Part B: Move KPIs to Overview Page

The Overview page (2 of 8) becomes the financial dashboard:
- 6 KPI gradient cards (keep existing — they look good)
- Rent collection progress bar
- Property summary card
- Snapshot

But lay them out to NOT require scrolling on a 768px viewport:
- KPI cards: 3 columns × 2 rows, compact height
- Rent collection bar below
- Property summary as a compact inline row (not a full card)
- Remove the separate "Snapshot" card — its data (occupancy %, active leases) is already in the KPI cards

### Part C: Fix Visual Bugs

1. **"0.0d" → "—"** — Analytics "Avg Days to Pay" should show "—" or "N/A" when value is 0 or no data
2. **"1 units" → "1 unit"** — Pluralization fix everywhere unit counts are displayed
3. **Property Scope dropdown** — Truncate with ellipsis but add a title attribute so full address shows on hover. Or shorten to just property name without address.
4. **Mascot in empty states** — Increase from current size to at least 80x80px
5. **"Management fee: $0.00"** — Hide management fee line in portfolio card when fee is $0
6. **Analytics empty state** — When all analytics values are 0, show a centered empty state: mascot + "No analytics data yet" + "Analytics will populate as charges and payments are recorded."
7. **PROGRESS card** — The gamification progress card in the top right of Home takes significant space. Move it to the Settings page or make it a small inline badge. It shouldn't dominate the Home page.

### Part D: Section Page Content Density

Each section page should use the full available height. Check these specifically:

- **Charges (3 of 8)**: The "0 pending · 0 late · 0 paid this month" status bar has low contrast (colored text on dark background). Make the text white or use the status color badges with solid backgrounds.
- **Portfolio (4 of 8)**: "Tenant Invitations" panel takes half the width but shows an empty state. If no invitations, collapse it or make it a small "Invite Tenant" button instead of a full panel.
- **Maintenance (5 of 8)**: Good layout — no changes needed.
- **Leases (6 of 8)**: Good layout — no changes needed.
- **Manager Payments (7 of 8)**: Three buttons ("Generate This Month", "Set Up Recurring", "Record Payment") should be better organized — row of outlined buttons with the primary action (Record Payment) prominent.
- **Analytics (8 of 8)**: Needs empty state (see Part C item 6).

## 4. Out of Scope

- New features
- Database migrations
- Changing the paginated navigation system (keep the arrow-based page switching)
- Sidebar changes
- CLAUDE.md / AGENTS.md edits

## 5. Exact Files Expected to Change

### Modified Files (8-12)
1. `apps/web/components/dashboard/index.tsx` — remove KPI header, remove compact header, simplify Home page
2. `apps/web/components/dashboard/compact-header.tsx` — DELETE this file (no longer needed)
3. `apps/web/components/dashboard/kpi-grid.tsx` — ensure it only renders on Overview page
4. `apps/web/components/dashboard/section-renderer.tsx` — move KPIs to Overview, fix section content density
5. `apps/web/components/dashboard/section-renderer-support.tsx` — adjust Overview layout
6. `apps/web/components/dashboard/owner-daily-ops-home.tsx` — simplify to greeting + mascot + quick actions only
7. `apps/web/components/dashboard/charges-section.tsx` — fix status bar contrast
8. `apps/web/components/dashboard/portfolio-section.tsx` — collapse empty invitations panel, fix "1 units", hide $0 fee
9. `apps/web/components/dashboard/analytics-section.tsx` or equivalent — add empty state
10. `apps/web/components/shared/empty-state.tsx` — increase mascot size
11. `apps/web/components/gamification/gamification-summary.tsx` — move progress card or shrink to badge
12. `apps/web/lib/analytics.ts` or display component — fix "0.0d" display

### Deleted Files (1)
1. `apps/web/components/dashboard/compact-header.tsx`

## 6. Implementation Requirements

### Part A: Home Page Simplification

```tsx
// Home page (page index 0) content:
<div className="flex flex-col items-center justify-center h-full text-center gap-6">
  {/* Greeting - compact */}
  <div>
    <h1 className="text-2xl font-bold">{greeting}, {userName}</h1>
    <p className="text-muted-foreground">{statusMessage}</p>
  </div>

  {/* Mascot - prominent */}
  <div className="w-32 h-32">
    <MascotImage pose="happy" size="lg" />
  </div>

  {/* Quick actions */}
  <div className="flex gap-3">
    <Button variant="outline" onClick={() => openPropertyWizard()}>
      <Plus className="w-4 h-4 mr-2" /> New Property
    </Button>
    <Button variant="outline" onClick={() => openTenantWizard()}>
      <UserPlus className="w-4 h-4 mr-2" /> New Tenant
    </Button>
    <Button variant="outline" onClick={() => navigateTo("reports")}>
      <BarChart className="w-4 h-4 mr-2" /> Reports
    </Button>
  </div>

  <p className="text-sm text-muted-foreground">
    Use the arrows to explore your dashboard →
  </p>
</div>
```

### Part B: Section Pages — No Header

Remove the compact header component entirely. Section pages render:
```tsx
<div className="flex flex-col h-full">
  {/* Page title + navigation */}
  <div className="flex items-center justify-between px-4 py-3 border-b border-border">
    <div>
      <h2 className="text-2xl font-bold">{sectionTitle}</h2>
      <span className="text-sm text-muted-foreground">{pageIndex} of {totalPages}</span>
    </div>
    <div className="flex gap-2">
      <ArrowButton direction="left" />
      <ArrowButton direction="right" />
    </div>
  </div>

  {/* Section content — fills remaining space */}
  <div className="flex-1 overflow-auto p-4">
    {sectionContent}
  </div>
</div>
```

### Part C: Pluralization Fix

Create or use a helper:
```typescript
function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? `1 ${singular}` : `${count} ${plural || singular + "s"}`;
}
// Usage: pluralize(1, "unit") → "1 unit"
//        pluralize(3, "unit") → "3 units"
```

Apply everywhere: portfolio cards, KPI subtitles, property summary, breadcrumbs.

### Part D: Analytics Empty State

```tsx
if (allValuesZero) {
  return (
    <EmptyState
      icon="analytics"
      title="No analytics data yet"
      description="Analytics will populate as charges and payments are recorded."
    />
  );
}
```

### Part E: Charges Status Bar Contrast

Change from colored text on dark background to solid badge pills:
```tsx
// BEFORE: <span className="text-emerald-400">0 pending</span>
// AFTER:  <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30">0 pending</Badge>
```

Use semi-transparent backgrounds so they're readable on dark theme.

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] Home page shows ONLY greeting + mascot + quick action buttons — NO KPI cards, NO mode bar
2. [ ] Section pages (2-8) have NO header bar — just section title with page nav
3. [ ] Overview page (2 of 8) contains all 6 KPI gradient cards + rent collection bar
4. [ ] Overview content fits in viewport without scrolling on 768px height
5. [ ] compact-header.tsx deleted
6. [ ] "0.0d" replaced with "—" for zero/no-data analytics values
7. [ ] "1 units" → "1 unit" (pluralization fixed)
8. [ ] Property Scope dropdown shows property name only (no address clipping)
9. [ ] Mascot in empty states is at least 80x80px
10. [ ] Management fee hidden when $0
11. [ ] Analytics page shows empty state when all values are zero
12. [ ] Charges status bar has readable contrast on dark background
13. [ ] Portfolio page collapses empty invitations panel
14. [ ] Progress/gamification card moved out of Home header or reduced to inline badge
15. [ ] `npm run gate:web` passes
16. [ ] No regressions

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
DELETED_FILES: [list]
TESTS_UNIT: xxx/xxx
HOME_PAGE: clean | still cluttered
SECTION_HEADERS: removed | still present
VISUAL_BUGS_FIXED: x/7
NOTES: [any issues]
```

## 10. Constraints

- Do NOT create database migrations
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT modify E2E test files
- Do NOT install new npm dependencies
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Do NOT change the paginated navigation system — keep the arrow-based page switching
- Do NOT change sidebar nav items
- The Overview page must still contain the KPI data — it's just moved from Home to Overview
- Quick action buttons on Home should trigger existing wizards/navigation (property wizard, tenant wizard, reports page)
