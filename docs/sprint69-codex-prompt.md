# Sprint 69 — Codex Implementation Prompt

## 1. Objective

Fix all paginated dashboard section pages so their content is scrollable within the section area. Currently, content that overflows the viewport is cut off with no way to scroll to it.

## 2. Context

- **Branch**: `main`
- **HEAD**: `563bb11`
- **Production URL**: `https://domusbase.com`

**Current problem:** Dashboard sections (Charges, Portfolio, Maintenance, Leases, Analytics, Manager Payments, Reports) have content that gets cut off at the bottom of the viewport. Users cannot scroll down to see the rest of the content. This affects every section page — any page with more content than fits in the viewport is broken.

**Root cause:** The paginated dashboard layout likely uses `overflow-hidden` or a fixed-height container that prevents scrolling within sections. Each section page needs its own scroll context.

## 3. In Scope

### Part A: Make Section Content Scrollable
- Each section page (pages 2-8 in the paginated dashboard) must have its content area scrollable
- The page header (section title, page indicator, arrows) should remain fixed/sticky at the top
- The sidebar should remain fixed
- Only the section content below the header should scroll

### Part B: Fix All Section Pages
Verify scrolling works on ALL section pages:
1. Overview (page 2)
2. Charges (page 3)
3. Portfolio (page 4)
4. Maintenance (page 5)
5. Leases (page 6)
6. Analytics (page 7)
7. Manager Payments (page 8)
8. Reports (page 9, if exists)

### Part C: Fix Manager Payments Form Visibility
The "Save Recurring Terms" button on the Manager Payments recurring setup form was not visible without scrolling. Ensure all forms within section pages are fully visible or scrollable.

### Part D: Fix Property Wizard Scrollability
The property creation wizard modal should be scrollable if its content exceeds the viewport height. Currently users cannot scroll within it.

## 4. Out of Scope

- Changing section content
- New features
- Database migrations
- CLAUDE.md / AGENTS.md edits
- Home page (page 1) changes — only section pages

## 5. Exact Files Expected to Change

### Modified Files (3-6)
1. `apps/web/components/dashboard/index.tsx` — fix section content container to allow scrolling
2. `apps/web/components/dashboard/section-renderer.tsx` — ensure section wrapper allows overflow scroll
3. `apps/web/components/dashboard/section-renderer-support.tsx` — fix any overflow-hidden constraints
4. `apps/web/components/dashboard/owner-daily-ops-home.tsx` — ensure Home page content scrolls if needed
5. `apps/web/components/dashboard/property-wizard.tsx` — make wizard modal scrollable
6. `apps/web/components/dashboard/modal-overlay.tsx` — ensure modal content can scroll

## 6. Implementation Requirements

### Part A: Section Content Scroll Container

The key fix is making the section content area a scrollable container. The layout should be:

```
┌──────────────────────────────────────────┐
│  Section Title    X of Y        < >      │ ← FIXED (sticky top)
├──────────────────────────────────────────┤
│                                          │
│  ┌────────────────────────────────────┐  │
│  │                                    │  │
│  │  Section content                   │  │ ← SCROLLABLE
│  │  (can be any height)               │  │
│  │                                    │  │
│  │  More content below fold...        │  │
│  │                                    │  │
│  └────────────────────────────────────┘  │
│                                          │
└──────────────────────────────────────────┘
```

**CSS pattern:**
```tsx
// The section content wrapper needs:
<div className="flex-1 overflow-y-auto">
  {/* Section content renders here */}
</div>
```

**The parent container needs:**
```tsx
// The dashboard main area (right of sidebar) needs:
<div className="flex flex-col h-screen">  {/* or h-full */}
  {/* Fixed header area */}
  <div className="flex-shrink-0">
    {/* Section title, page indicator, arrows */}
  </div>

  {/* Scrollable content area */}
  <div className="flex-1 overflow-y-auto min-h-0">
    {/* Section content */}
  </div>
</div>
```

**CRITICAL**: The `min-h-0` on the scrollable container is essential. Without it, flexbox will not allow the container to shrink below its content height, preventing `overflow-y-auto` from working.

### Part B: Check Every Section

After making the fix, verify that each section page can scroll:
- Charges with many charge cards
- Portfolio with multiple properties
- Manager Payments with the recurring setup form (the "Save Recurring Terms" button must be reachable)
- Analytics with charts
- Leases with multiple lease cards

### Part C: Modal Scrollability

For the property wizard and any other modals:
```tsx
// Modal content wrapper:
<div className="max-h-[85vh] overflow-y-auto">
  {/* Modal content */}
</div>
```

This ensures modals never exceed 85% of viewport height and scroll internally when they do.

### Part D: Smooth Scroll Behavior

Add smooth scrolling to the content area:
```css
.scroll-container {
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch; /* iOS momentum scrolling */
}
```

Or in Tailwind: `scroll-smooth`

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] All section pages (2-8) have scrollable content areas
2. [ ] Section header (title, page indicator, arrows) stays fixed while content scrolls
3. [ ] Sidebar stays fixed while content scrolls
4. [ ] Manager Payments form "Save Recurring Terms" button is reachable by scrolling
5. [ ] Property wizard modal is scrollable when content exceeds viewport
6. [ ] Scroll works on all viewport sizes (desktop and mobile)
7. [ ] iOS momentum scrolling works (touch devices)
8. [ ] No horizontal scroll introduced
9. [ ] Home page (page 1) still works correctly
10. [ ] `npm run gate:web` passes
11. [ ] No regressions

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
SECTIONS_SCROLLABLE: [list which ones work]
MODAL_SCROLLABLE: yes | no
NOTES: [any issues]
```

## 10. Constraints

- Do NOT create database migrations
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT modify E2E test files
- Do NOT install new npm dependencies
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Do NOT change section content — only fix the scroll container
- The fix must work on BOTH desktop and mobile viewports
- Do NOT use `position: fixed` for the section header — use `sticky` or flexbox layout
