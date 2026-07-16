# Sprint 64 — Codex Implementation Prompt

## 1. Objective

Fix three critical UX issues: (1) dashboard pagination so the greeting is its own page and sections don't stack, (2) mascot is too small everywhere, (3) any remaining property wizard focus/navigation bugs.

## 2. Context

- **Branch**: `main`
- **HEAD**: (latest)
- **Production URL**: `https://domusbase.com`

**Issue 1 — Dashboard pagination broken:**
The "Good afternoon, Ace" greeting + KPI pills and the "Overview" section are stacked vertically, requiring scrolling. The user expects:
- The greeting + KPIs fill the screen as "Page 0" (home)
- Pressing the right arrow shows "Overview" as "Page 1"
- Each subsequent arrow press shows a different section
- NO scrolling ever — each page fits the viewport

**Issue 2 — Mascot too small:**
The mascot poses are large images (512px+) but the `DomMascot` component renders them tiny:
- `sm`: 48x32
- `md`: 72x48
- `lg`: 120x80
- `xl`: 180x120

These sizes were designed for the old "Dom the Key" image which was wider than tall. The new mascot is roughly square. The sizes need to be increased and the aspect ratio adjusted.

**Issue 3 — Property wizard focus:**
The modal overlay was rewritten to fix focus-stealing (useRef for onClose, effect only runs on `open` change). However, the wizard may still have issues if the parent component re-renders and remounts the wizard. Test thoroughly.

## 3. In Scope

### Part A: Dashboard Paginated Layout (No-Scroll)

**Redesign `components/dashboard/index.tsx` and `section-renderer.tsx`:**

The main content area must be a full-viewport paginated view:

**Layout structure:**
```
┌──────────────────────────────────────────┐
│ Sidebar │  Fixed Header (greeting + KPIs) │  ← always visible
│         │                                  │
│         │  ┌──────────────────────────┐   │
│         │  │   PAGE CONTENT           │   │  ← fills remaining viewport
│         │  │   (one section at a time) │   │     height, no scroll
│         │  │                          │   │
│         │  │          < 1 of 8 >      │   │  ← nav arrows + position
│         │  └──────────────────────────┘   │
└──────────────────────────────────────────┘
```

**Page 0 — Home (default on load):**
- Just the greeting + KPI pills + mode label
- NO section content below
- The content area shows a centered message like the mascot waving + "Use the arrows to explore your dashboard" or similar
- OR: just show empty space with the arrows visible

**Pages 1-7 — Sections:**
1. Overview (snapshot + KPI grid + collection bar)
2. Charges
3. Portfolio
4. Maintenance
5. Leases
6. Manager Payments
7. Analytics

**Implementation:**

1. **Split the layout into two zones:**
   - **Header zone**: `position: sticky` or fixed height, contains greeting, KPI pills, mode label. This NEVER scrolls or changes.
   - **Content zone**: `height: calc(100vh - headerHeight)`, `overflow: hidden`. Shows exactly one page.

2. **Page state**: Track `currentPage` as a number (0 = home, 1-7 = sections). The `<` and `>` arrows change `currentPage`.

3. **Arrow buttons**: Prominent, always visible in the content zone. Show current position: "1 of 8" or section name.

4. **Keyboard navigation**: Left/right arrow keys change pages (but NOT when an input is focused).

5. **Sidebar clicks**: Clicking "Records", "Analytics", "Manager Payments", "Reports" in the sidebar should jump to the corresponding page number.

6. **Content overflow**: If a section's content is taller than the viewport, truncate and show "View all (N items)" link. Lists should show max 5-6 items with a "Show more" expansion. The key principle: **no page should require scrolling**.

7. **Transition**: Optional — a subtle slide-left/slide-right CSS transition when changing pages.

### Part B: Increase Mascot Size

**Modify `components/gamification/dom-mascot.tsx`:**

The new mascot images are roughly square. Update the size map:

```typescript
const sizeMap = {
  sm: { width: 48, height: 48 },
  md: { width: 80, height: 80 },
  lg: { width: 140, height: 140 },
  xl: { width: 220, height: 220 }
} as const;
```

Also check every place DomMascot is used and consider if it should be bumped up a size:
- Progress card in dashboard header — currently likely `sm`, should be `md`
- Welcome card — currently `xl`, keep but it'll be bigger with new sizes
- Onboarding checklist — currently `md`, keep
- Empty states — check and adjust
- Error pages — check and adjust

### Part C: Property Wizard Stability

The modal overlay has been rewritten to prevent focus-stealing. Verify:

1. Open the wizard → type in "Property name" → focus stays
2. Tab to "Street address" → type → focus stays
3. Click "Next" → Step 2 appears and stays (doesn't reset to Step 1)
4. Add unit details → click "Next" → Step 3 appears and stays
5. Complete the wizard → dashboard refreshes with new property

If any of these still fail, the root cause is likely:
- The wizard component being remounted by the parent on state change
- Fix: ensure the wizard is rendered in a stable position in the component tree (not inside a conditional that re-evaluates)
- Fix: use a React portal (`createPortal`) to render the wizard outside the dashboard component tree entirely

**If the wizard still resets on Step transitions**, wrap it in a portal:
```tsx
import { createPortal } from "react-dom";

// In the parent component:
{wizardOpen && createPortal(
  <PropertyWizard ... />,
  document.body
)}
```

This ensures dashboard re-renders (from revalidatePath) cannot affect the wizard.

## 4. Out of Scope

- New features
- Database migrations
- CLAUDE.md / AGENTS.md edits
- Marketing page changes
- Tenant/manager dashboard changes

## 5. Exact Files Expected to Change

### Modified Files (5-8)
1. `apps/web/components/dashboard/index.tsx` — paginated layout, page state management
2. `apps/web/components/dashboard/section-renderer.tsx` — render one section at a time, fit viewport
3. `apps/web/components/gamification/dom-mascot.tsx` — increase size map
4. `apps/web/components/dashboard/sidebar/nav-items.ts` — wire sidebar clicks to page numbers
5. `apps/web/components/dashboard/property-wizard.tsx` — portal rendering if needed
6. `apps/web/components/dashboard/charges-section.tsx` — truncate long lists for no-scroll
7. `apps/web/components/dashboard/portfolio-section.tsx` — truncate for no-scroll
8. `apps/web/components/dashboard/maintenance-section.tsx` — truncate for no-scroll

## 6. Implementation Requirements

See Part A, B, C above for detailed specs.

**Key principle for pagination:** Each section rendered in the content zone must fit within `calc(100vh - headerZoneHeight)` pixels. If content overflows, truncate — never scroll.

**CSS approach for content zone:**
```css
.content-zone {
  height: calc(100vh - var(--header-height, 320px));
  overflow: hidden;
  position: relative;
}
```

**Transition between pages (optional but nice):**
```css
.page-enter { transform: translateX(100%); opacity: 0; }
.page-enter-active { transform: translateX(0); opacity: 1; transition: all 0.2s ease-out; }
.page-exit { transform: translateX(-100%); opacity: 0; transition: all 0.2s ease-out; }
```

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] Dashboard loads with greeting + KPIs visible, NO section content below
2. [ ] Right arrow navigates to "Overview" page
3. [ ] Continued right arrows cycle through all sections (Charges, Portfolio, etc.)
4. [ ] Left arrow goes back, wraps from first to last
5. [ ] Position indicator shows "1 of 8" or section name
6. [ ] Keyboard left/right arrows navigate (when no input focused)
7. [ ] Sidebar nav items jump to the correct page
8. [ ] NO scrolling on any page — content fits viewport
9. [ ] Long lists truncated with "View all" link
10. [ ] Mascot sizes increased: sm=48x48, md=80x80, lg=140x140, xl=220x220
11. [ ] Mascot appears at appropriate size in all locations
12. [ ] Property wizard opens, allows typing without focus loss
13. [ ] Property wizard survives step transitions without resetting
14. [ ] `npm run gate:web` passes
15. [ ] No regressions

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
PAGINATION: working | broken
MASCOT_SIZES: updated | unchanged
WIZARD_STABLE: yes | no
NOTES: [any issues]
```

## 10. Constraints

- Do NOT create database migrations
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT modify E2E test files
- Do NOT install new npm dependencies
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Do NOT change the modal-overlay.tsx — it was just rewritten and is correct
- The greeting/KPI header must ALWAYS be visible — it doesn't paginate, only the content below it does
- No section should ever require scrolling — truncate content that doesn't fit
