# Sprint 66 — Codex Implementation Prompt

## 1. Objective

Fix dashboard layout so section pages have maximum content space. The fixed header is too tall, property summary repeats on every page, and the page indicator is too subtle.

## 2. Context

- **Branch**: `main`
- **HEAD**: (latest after Sprint 65)
- **Production URL**: `https://domusbase.com`

**Current problem:** The fixed header zone (greeting + 4 KPI pills + mode label bar) takes ~55% of the viewport. Section pages (Overview, Charges, Portfolio, etc.) only get ~45% — not enough to show meaningful content without scrolling.

**Current layout (broken):**
```
┌─────────────────────────────────────────┐
│  Good evening, Ace          PROGRESS    │  ~60px
│  Everything looks good                  │
├─────────────────────────────────────────┤
│  [$0 REVENUE] [0% OCC] [0 TIX] [0 DUE] │  ~100px (KPI pills)
├─────────────────────────────────────────┤
│  Daily Operations Mode  |  description  │  ~40px (mode bar)
├─────────────────────────────────────────┤
│  3 OF 8  Charges           < >          │  ~50px (page header)
│  Dashboard > Charges > 1st Home         │  ~30px (breadcrumb)
│  ┌─────────────────────────────────┐    │
│  │ 1st Home - 131 Chaste Tree...  │    │  ~80px (REPEATED property card)
│  │ Occ 0% | Units 1 | Rent $0    │    │
│  └─────────────────────────────────┘    │
│                                         │  ← only ~90px left for actual content!
│  (charges content cut off)              │
└─────────────────────────────────────────┘
```

## 3. In Scope

### Part A: Collapse Header When Navigating to Sections

When the user is on **Page 1 (Home)**, show the full header:
- Greeting ("Good evening, Ace")
- Status line
- 4 KPI pills (full size)
- Progress card
- Mode label bar

When the user navigates to **any section page (2-8)**, collapse the header to a compact bar:
```
┌─────────────────────────────────────────┐
│ 🏠 Ace's Account  |  $0 rev  0% occ  0 tix  0 due  │  ← ONE compact row, ~40px
├─────────────────────────────────────────┤
│  3 OF 8  Charges                    < > │  ← page header
│                                         │
│  (FULL HEIGHT for section content)      │  ← ~600px available!
│                                         │
└─────────────────────────────────────────┘
```

**Compact header specs:**
- Single row, ~40px tall
- Left: account name or greeting (short)
- Right: KPI values as inline text (not cards): "$0 rev · 0% occ · 0 tickets · 0 due"
- No progress card, no mode label bar — those are Home-page-only
- Subtle background so it feels like a toolbar, not a hero section

**Transition:** When pressing left arrow back to Home (page 1), the full header expands again.

### Part B: Remove Property Summary Card from Section Pages

The property summary card ("1st Home — 131 Chaste Tree Circle" with Occupancy/Units/Rent/Tickets) currently appears on Overview AND Charges pages. Remove it from individual section pages.

**Where it should appear:**
- Overview page (page 2) — YES, keep it here as the portfolio summary
- All other section pages — NO, remove it

The property scope dropdown ("1st Home - 131 Chaste Tree...") can stay as a filter control, but the full summary card with stats is redundant.

### Part C: Larger Page Indicator

Current "3 OF 8" is small gray text. Make it more prominent:
- Larger font size (text-lg or text-xl)
- Section name is the primary visual: **"Charges"** in bold
- "3 of 8" as secondary text below or beside it
- Left/right arrows should be larger and more obvious (44x44px touch targets minimum)

### Part D: Mascot Size in Progress Card

The mascot in the "Portfolio Pro / Level 3" progress card (top right of header) is too small to recognize. Either:
- Increase it to `md` size (80x80)
- OR remove the mascot from the progress card entirely if it doesn't fit at a readable size

### Part E: Remove Mode Label Bar from Section Pages

The "Daily Operations Mode — Daily owner runbook: revenue risk, payments, maintenance, and alerts." bar takes ~40px on every page. It's informational on first visit but not needed on every section page.

- Show it only on the Home page (page 1)
- Hide it on section pages (2-8)
- OR collapse it into the compact header row

## 4. Out of Scope

- Changing section content
- New features
- Database migrations
- CLAUDE.md / AGENTS.md edits
- Mobile layout changes (desktop first for this sprint)

## 5. Exact Files Expected to Change

### Modified Files (4-6)
1. `apps/web/components/dashboard/index.tsx` — conditional header rendering based on current page
2. `apps/web/components/dashboard/owner-daily-ops-home.tsx` — full header for Home page
3. `apps/web/components/dashboard/owner-daily-ops-pagination.ts` — page indicator styling
4. `apps/web/components/dashboard/section-renderer.tsx` or `section-renderer-support.tsx` — remove property summary from non-overview pages
5. `apps/web/components/dashboard/dashboard-layout.tsx` — compact header component
6. `apps/web/components/gamification/gamification-summary.tsx` — mascot size in progress card

### New Files (0-1)
1. `apps/web/components/dashboard/compact-header.tsx` — compact header bar for section pages (optional, could be inline)

## 6. Implementation Requirements

### Part A: Conditional Header

```tsx
// In dashboard index.tsx or wherever the layout is orchestrated:

{currentPage === 0 ? (
  // FULL HEADER — greeting, KPI pills, progress card, mode bar
  <FullDashboardHeader ... />
) : (
  // COMPACT HEADER — single row with inline KPI values
  <CompactDashboardHeader
    accountName="Ace's Account"
    monthlyRevenue={kpis.monthlyGrossRentCents}
    occupancy={occupancy}
    openTickets={kpis.openMaintenanceCount}
    overdueCharges={kpis.lateAccountCount}
  />
)}
```

**CompactDashboardHeader component:**
```tsx
function CompactDashboardHeader({ accountName, monthlyRevenue, occupancy, openTickets, overdueCharges }) {
  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/50">
      <span className="text-sm font-medium text-foreground">{accountName}</span>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>{formatCurrency(monthlyRevenue)} rev</span>
        <span>{occupancy}% occ</span>
        <span>{openTickets} tickets</span>
        <span>{overdueCharges} due</span>
      </div>
    </div>
  );
}
```

### Part B: Property Summary Removal

In the section renderer, the property summary card is likely rendered as part of every section. Find where it's injected and conditionally hide it:
```tsx
// Only show property summary on Overview section
{sectionId === "overview" && <PropertySummaryCard ... />}
```

Keep the property scope dropdown filter — just remove the big card with stats.

### Part C: Page Indicator Enhancement

```tsx
<div className="flex items-center justify-between px-4 py-3">
  <div>
    <h2 className="text-2xl font-bold text-foreground">{sectionTitle}</h2>
    <span className="text-sm text-muted-foreground">{currentPage} of {totalPages}</span>
  </div>
  <div className="flex items-center gap-2">
    <button className="h-11 w-11 rounded-full border border-border flex items-center justify-center hover:bg-muted transition">
      <ChevronLeft className="h-5 w-5" />
    </button>
    <button className="h-11 w-11 rounded-full border border-border flex items-center justify-center hover:bg-muted transition">
      <ChevronRight className="h-5 w-5" />
    </button>
  </div>
</div>
```

### Part D: Mascot in Progress Card

Check `gamification-summary.tsx` — if the mascot is rendered there, bump it from `sm` to `md`. If it still doesn't look good at `md`, remove it from the progress card and only show it on the Home page hero.

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] Home page (page 1) shows full greeting, KPI pills, progress card, and mode bar
2. [ ] Section pages (pages 2-8) show compact single-row header (~40px) with inline KPI values
3. [ ] Property summary card only appears on Overview page, not on Charges/Maintenance/etc.
4. [ ] Property scope dropdown filter still works on all section pages
5. [ ] Page indicator shows section name in large bold text with "X of Y" secondary
6. [ ] Arrow buttons are 44x44px minimum (touch-friendly)
7. [ ] Mode label bar hidden on section pages
8. [ ] Section content gets ~80%+ of viewport height on section pages
9. [ ] Mascot in progress card is visible or removed if too small
10. [ ] Transitioning back to Home (page 1) restores full header
11. [ ] `npm run gate:web` passes
12. [ ] No regressions

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
HEADER_COMPACT: working | broken
PROPERTY_CARD_REMOVED: yes | no
PAGE_INDICATOR: enhanced | unchanged
MASCOT_PROGRESS: sized up | removed | unchanged
CONTENT_VIEWPORT_PCT: estimated %
NOTES: [any issues]
```

## 10. Constraints

- Do NOT create database migrations
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT modify E2E test files
- Do NOT install new npm dependencies
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Do NOT modify modal-overlay.tsx
- The compact header must still show KPI data — don't hide it completely, just condense it
- Section content should get at least 500px of vertical space on a 768px viewport
