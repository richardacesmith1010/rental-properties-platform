# Sprint 71 — Codex Implementation Prompt

## 1. Objective

Make the KPI snapshot its own page in the pagination system instead of a persistent header. Fix remaining visual issues: section content must fill the viewport, the greeting should be compact, and the mascot needs to be larger in the progress card.

## 2. Context

- **Branch**: `main`
- **HEAD**: `66125f7`
- **Production URL**: `https://domusbase.com`

**Current problem:** The greeting + 4 KPI pills + mode label bar are rendered as a persistent header on EVERY page. They consume ~55% of the viewport, leaving only ~45% for actual section content. The user wants:
1. KPIs as their own swipeable page, not a persistent header
2. A compact greeting bar on all pages (just name + one-line status)
3. Section pages get the full viewport below the compact bar
4. Mascot in progress card is too small

**Current page structure (broken):**
```
Page 1: Home → shows greeting + KPI pills + progress card + mode bar
Page 2: Overview
Page 3: Charges
...etc
```

**Target page structure:**
```
ALL PAGES: Compact top bar (one line: "Good evening, Ace · Everything looks good" + settings gear)
Page 1: Home → Full KPI cards (6 cards in grid) + Rent Collection Bar + Progress Card
Page 2: Overview → Property summary + portfolio overview (FULL HEIGHT)
Page 3: Charges → Charges content (FULL HEIGHT)
Page 4: Portfolio → Properties list (FULL HEIGHT)
...etc
```

## 3. In Scope

### Part A: Compact Greeting Bar (All Pages)
Replace the tall greeting section with a single compact bar:
```
┌─────────────────────────────────────────────────────┐
│ Good evening, Ace · Everything looks good     ⚙️ 🔔 │  ← ~40px, one line
└─────────────────────────────────────────────────────┘
```
- Left: greeting + status summary (single line)
- Right: settings gear icon + notification bell (already exists)
- Background: subtle, not the gradient hero block
- This bar is the SAME on every page — no change when paginating

### Part B: KPI Dashboard as Page 1 (Home)
Page 1 ("Home") becomes the full KPI experience:
- 6 KPI cards in 2×3 grid (Monthly Revenue, Occupancy, Rent Collection, Outstanding, Open Tickets, Net Cash Flow)
- Rent collection progress bar below the grid
- Progress/gamification card (with LARGER mascot)
- Mode label bar ("Daily Operations Mode — ...")
- This is the ONLY page that shows KPIs and mode bar

### Part C: All Other Pages Get Full Height
Pages 2-8 (Overview, Charges, Portfolio, Maintenance, etc.):
- No KPI cards
- No mode label bar
- No progress card
- Content starts immediately below the compact greeting bar
- Section title + page indicator ("3 OF 8 · Charges") at the top of the content area
- The rest is FULL HEIGHT scrollable content

### Part D: Mascot Size in Progress Card
The mascot in the progress card on Page 1 should be:
- At least 80×80px (currently too small to recognize)
- Use the new mascot images from `public/images/mascot/poses/`
- The `happy.png` pose for the default state

### Part E: Page Indicator Enhancement
On pages 2-8, the page indicator should be:
- Section name in large bold text as the primary element
- "X of Y" as secondary muted text
- Left/right arrows at 44×44px minimum for touch targets
- Clean horizontal layout: `← Charges (3 of 8) →`

## 4. Out of Scope

- Changing KPI calculations or data
- Adding new sections/pages
- Mobile-specific layout changes
- Database migrations
- CLAUDE.md / AGENTS.md edits

## 5. Exact Files Expected to Change

### New Files (1)
1. `apps/web/components/dashboard/compact-greeting-bar.tsx` — compact top bar component

### Modified Files (4-6)
1. `apps/web/components/dashboard/index.tsx` — restructure: compact bar persistent + conditional page content
2. `apps/web/components/dashboard/owner-daily-ops-home.tsx` — Page 1 becomes KPI-focused (full grid + collection bar + progress)
3. `apps/web/components/dashboard/section-renderer.tsx` or `section-renderer-support.tsx` — section pages render without KPIs/greeting hero
4. `apps/web/components/dashboard/kpi-grid.tsx` — ensure it only renders on Page 1
5. `apps/web/components/gamification/gamification-summary.tsx` — increase mascot size
6. `apps/web/components/dashboard/owner-daily-ops-pagination.ts` — page indicator styling

## 6. Implementation Requirements

### Part A: Compact Greeting Bar

**New file: `compact-greeting-bar.tsx`**

```tsx
"use client";

interface CompactGreetingBarProps {
  userName: string;
  statusSummary: string;  // "Everything looks good" or "2 overdue charges"
}

export function CompactGreetingBar({ userName, statusSummary }: CompactGreetingBarProps) {
  const greeting = getTimeOfDayGreeting();  // "Good morning" / "Good afternoon" / "Good evening"

  return (
    <div className="flex items-center justify-between px-6 py-2.5 border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-10">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-semibold text-foreground">{greeting}, {userName}</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">{statusSummary}</span>
      </div>
      {/* Settings/notification icons are handled by the existing header — just ensure they're visible */}
    </div>
  );
}

function getTimeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
```

**Key: This component renders ONCE at the top level, outside the pagination system.** It does NOT change when the user navigates between pages.

### Part B: Dashboard Layout Restructure

In `index.tsx` (or wherever the main dashboard layout is orchestrated):

```tsx
<div className="flex flex-col h-full">
  {/* PERSISTENT: Compact greeting bar — always visible */}
  <CompactGreetingBar userName={userName} statusSummary={statusSummary} />

  {/* PAGINATED: Content changes based on current page */}
  <div className="flex-1 min-h-0 overflow-y-auto">
    {currentPage === 0 ? (
      {/* PAGE 1: HOME — Full KPI dashboard */}
      <div className="p-6 space-y-6">
        <KpiGrid kpis={kpis} occupancy={occupancy} analytics={analytics} />
        <RentCollectionBar collected={...} pending={...} overdue={...} />
        <GamificationSummary mascotSize="lg" />
        <ModeLabel mode="daily-ops" />
      </div>
    ) : (
      {/* PAGES 2-8: Section content with full height */}
      <div className="flex flex-col h-full">
        <SectionPageHeader
          title={currentSectionTitle}
          pageNumber={currentPage + 1}
          totalPages={totalPages}
          onPrev={goToPrevPage}
          onNext={goToNextPage}
        />
        <div className="flex-1 min-h-0 overflow-y-auto p-6">
          <SectionRenderer section={currentSection} {...sectionProps} />
        </div>
      </div>
    )}
  </div>

  {/* Navigation arrows — visible on all pages */}
  <PageNavigationArrows ... />
</div>
```

### Part C: Remove Greeting Hero from Section Pages

Find where the tall greeting block ("Good evening, Ace" with gradient background, KPI pills, etc.) is rendered. It likely lives in `owner-daily-ops-home.tsx` or the main dashboard index.

**Rules:**
- The tall greeting hero MUST NOT render on pages 2-8
- Only `CompactGreetingBar` renders on pages 2-8
- The tall hero content (KPIs, progress, mode bar) renders ONLY on Page 1

### Part D: Mascot Size

In `gamification-summary.tsx` or wherever the progress card renders:
```tsx
// Change mascot from sm/md to lg
<Image
  src="/images/mascot/poses/happy.png"
  alt="Domus mascot"
  width={80}
  height={80}
  className="rounded-lg"
/>
```

If the progress card layout doesn't accommodate 80×80, adjust the card layout to give the mascot more space (flex row with mascot on left, stats on right).

### Part E: Section Page Header

```tsx
function SectionPageHeader({ title, pageNumber, totalPages, onPrev, onNext }) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-border">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        <span className="text-sm text-muted-foreground">{pageNumber} of {totalPages}</span>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={onPrev}
          className="h-11 w-11 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors"
          aria-label="Previous section"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          onClick={onNext}
          className="h-11 w-11 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors"
          aria-label="Next section"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
```

### Part F: Status Summary Logic

The `statusSummary` string for the compact bar should be computed from KPI data:
```typescript
function computeStatusSummary(kpis: DashboardKpis): string {
  const issues: string[] = [];
  if (kpis.lateAccountCount > 0) {
    issues.push(`${kpis.lateAccountCount} overdue charge${kpis.lateAccountCount > 1 ? 's' : ''}`);
  }
  if (kpis.highPriorityMaintenanceCount > 0) {
    issues.push(`${kpis.highPriorityMaintenanceCount} urgent ticket${kpis.highPriorityMaintenanceCount > 1 ? 's' : ''}`);
  }
  if (issues.length === 0) return "Everything looks good";
  return issues.join(" · ");
}
```

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] Compact greeting bar (~40px) renders on ALL pages with name + status summary
2. [ ] Compact bar does NOT change when navigating between pages
3. [ ] Page 1 (Home) shows full KPI grid, rent collection bar, progress card, and mode label
4. [ ] Pages 2-8 show ONLY the section page header + section content (no KPIs, no mode bar, no progress card)
5. [ ] Section content gets 80%+ of viewport height on pages 2-8
6. [ ] Page indicator shows section title in large bold + "X of Y" secondary text
7. [ ] Arrow buttons are 44×44px minimum
8. [ ] Mascot in progress card is 80×80px using `happy.png`
9. [ ] Status summary shows contextual message ("2 overdue charges" or "Everything looks good")
10. [ ] Section pages scroll independently (overflow-y-auto on content area)
11. [ ] `npm run gate:web` passes
12. [ ] No regressions to KPI data, section content, or navigation

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
NEW_FILES: [list]
TESTS_UNIT: xxx/xxx
COMPACT_BAR: working | broken
KPI_HOME_ONLY: yes | no
SECTION_VIEWPORT_PCT: estimated %
MASCOT_SIZE: 80px | unchanged
PAGE_INDICATOR: enhanced | unchanged
NOTES: [any issues]
```

## 10. Constraints

- Do NOT create database migrations
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT modify E2E test files
- Do NOT install new npm dependencies
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Do NOT remove the KPI grid component — just move it to Page 1 only
- Do NOT change KPI calculations or data sources
- The compact greeting bar must be sticky (stays visible when scrolling)
- Section content must have `overflow-y-auto` with `min-h-0` for proper flex scrolling
