# Sprint 51 — Codex Implementation Prompt

## 1. Objective

Mobile responsiveness polish: fix the 3 partially responsive components, add touch-friendly affordances, and ensure the entire owner dashboard works well on 375px–768px screens.

## 2. Context

- **Branch**: `main`
- **HEAD**: (use latest after Sprint 50)
- **Gate baseline**: all unit tests passing, lint clean, typecheck clean, build clean
- **Mobile audit findings**: 8/11 components fully responsive, 3 need minor fixes

## 3. In Scope

### Fix 1: Account Switcher Text Clipping
**File**: `apps/web/components/dashboard/account-switcher.tsx` (line ~176)
- Current: `max-w-[170px] sm:max-w-[184px]` — clips long account names
- Fix: Use `truncate` with `max-w-full` on mobile, let the container width control truncation naturally
- Also ensure the "(Individual)" type label doesn't clip — consider hiding it on mobile or abbreviating

### Fix 2: Batch Toolbar Mobile Layout
**File**: `apps/web/components/dashboard/batch-toolbar.tsx`
- Current: `flex flex-wrap` — buttons may crowd on very narrow screens
- Fix: Stack buttons vertically on mobile: `flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3`
- Move the selection count text above the action buttons on mobile

### Fix 3: Command Palette Keyboard Shortcut Hint
**File**: `apps/web/components/dashboard/sidebar/sidebar-nav.tsx` (line ~55)
- Current: Shows "⌘K" keyboard shortcut hint on mobile where it's not usable
- Fix: Hide with `hidden sm:inline` or similar
- Consider adding a visible search icon/button in the mobile top bar that opens the palette

### Additional Mobile Polish:

**4. Mobile Top Bar Search Access**
- Ensure the mobile hamburger menu or top bar has a search icon that opens the command palette
- Mobile users need a way to access search without ⌘K

**5. KPI Card Touch Targets**
- Verify KPI cards have adequate touch targets (min 44px height)
- Add `min-h-[44px]` to any interactive elements if needed

**6. Property Summary Card Mobile**
- Already responsive (`flex-col` on mobile) — verify it looks good with long property names
- Ensure metric grid doesn't overflow on 375px width

**7. Rent Collection Bar Mobile**
- Bar is fine, but if all 3 legend items are long dollar amounts, verify wrapping
- Consider stacking legend vertically on very small screens: `flex flex-col gap-1 sm:flex-row sm:gap-4`

## 4. Out of Scope

- Dark mode changes (Sprint 50)
- New features
- Database migrations
- Tenant/manager dashboard mobile (only owner dashboard in scope)
- CLAUDE.md / AGENTS.md edits

## 5. Exact Files Expected to Change

1. `apps/web/components/dashboard/account-switcher.tsx`
2. `apps/web/components/dashboard/batch-toolbar.tsx`
3. `apps/web/components/dashboard/sidebar/sidebar-nav.tsx`
4. `apps/web/components/dashboard/rent-collection-bar.tsx` (legend stacking)
5. `apps/web/components/dashboard/dashboard-header.tsx` or `dashboard-layout.tsx` (mobile search access)

## 6. Implementation Requirements

### Account Switcher
```tsx
// Replace rigid max-width with flexible truncation
// BEFORE:
<span className="truncate max-w-[170px] sm:max-w-[184px]">

// AFTER:
<span className="truncate">
```
Let the parent container's width handle truncation. Remove the hardcoded max-width.

For the account type label:
```tsx
// Hide "(Individual)" on mobile, show on sm+
<span className="hidden sm:inline text-xs opacity-70">({account.accountType})</span>
```

### Batch Toolbar
```tsx
// Stack on mobile
<div className="flex flex-col gap-2 rounded-lg bg-primary/10 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
  <span className="text-sm font-medium">{selectedCount} selected</span>
  <div className="flex flex-wrap gap-2">
    {/* action buttons */}
  </div>
</div>
```

### Command Palette Access
```tsx
// In sidebar-nav.tsx, hide keyboard shortcut on mobile:
<kbd className="hidden sm:inline ...">⌘K</kbd>

// In mobile top bar, add a search button:
<button onClick={() => setCommandPaletteOpen(true)} className="p-2">
  <Search className="h-5 w-5" />
</button>
```

### Rent Collection Bar Legend
```tsx
// Stack legend on xs, row on sm+
<div className="flex flex-col gap-1 sm:flex-row sm:gap-4 mt-3 text-sm">
```

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] Account switcher shows full name without clipping on 375px width
2. [ ] Account type label hidden on mobile, visible on sm+
3. [ ] Batch toolbar stacks vertically on mobile, horizontal on sm+
4. [ ] ⌘K hint hidden on mobile
5. [ ] Search accessible from mobile top bar (icon button opens command palette)
6. [ ] Rent collection bar legend stacks vertically on narrow screens
7. [ ] All KPI cards have min 44px touch targets
8. [ ] `npm run gate:web` passes
9. [ ] No regressions on desktop layout

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
TESTS_UNIT: xxx/xxx
LINT: clean | [errors]
TYPECHECK: clean | [errors]
BUILD: clean | [errors]
NOTES: [any issues]
```

## 10. Constraints

- Do NOT create database migrations
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT modify E2E test files
- Do NOT install new npm dependencies
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Do NOT change dark mode colors (Sprint 50 handles that)
- Test mental model: would this work on an iPhone SE (375px) and iPad (768px)?
