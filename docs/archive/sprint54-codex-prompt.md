# Sprint 54 — Codex Implementation Prompt

## 1. Objective

Accessibility audit and fixes: ensure WCAG 2.1 AA compliance across the owner dashboard. Fix focus management, ARIA labels, color contrast, keyboard navigation, and screen reader support for all Sprint 44-52 components.

## 2. Context

- **Branch**: `main`
- **HEAD**: (use latest after Sprint 53)
- **Gate baseline**: all unit tests passing, lint clean, typecheck clean, build clean
- **Existing a11y**: `apps/web/tests/e2e/accessibility.spec.ts` has basic form label, keyboard nav, and alt text tests

## 3. In Scope

### Part A: Focus Management
1. **Command palette**: Trap focus inside modal when open, return focus to trigger on close
2. **Inline edit**: Focus input on edit mode enter, return focus on save/cancel
3. **Batch toolbar**: Focus first action button when toolbar appears
4. **Account rename inline edit**: Same focus management as inline-edit

### Part B: ARIA Labels & Roles
1. **KPI cards**: Add `role="status"` and `aria-label` describing the metric (e.g., "Monthly Revenue: $2,400")
2. **Rent collection bar**: Add `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`
3. **Command palette**: Add `role="dialog"`, `aria-modal="true"`, `aria-label="Search commands"`
4. **Command palette results**: Add `role="listbox"` for results, `role="option"` for each item, `aria-selected` for active item
5. **Status badges**: Add `aria-label` with full status text (e.g., "Status: paid")
6. **Breadcrumbs**: Add `aria-label="Breadcrumb"` to nav element, `aria-current="page"` to last item
7. **Property selector**: Ensure dropdown has proper `aria-expanded`, `aria-haspopup`

### Part C: Color Contrast
1. Verify all `text-muted-foreground` meets 4.5:1 contrast ratio against `bg-card` in all themes
2. Check KPI card text against gradient backgrounds — ensure white text has sufficient contrast
3. Check status badge text against badge backgrounds (emerald on emerald-50, amber on amber-50, red on red-50)
4. If any fail, bump to darker shade (e.g., `text-emerald-800` instead of `text-emerald-700`)

### Part D: Keyboard Navigation
1. **Command palette**: Arrow keys navigate results, Enter selects, Escape closes
2. **KPI grid**: Tab through cards, each card focusable if interactive
3. **Batch toolbar**: Tab through action buttons
4. **Property selector dropdown**: Arrow keys navigate options, Enter selects, Escape closes
5. **Inline edit**: Enter saves, Escape cancels (verify this already works)

### Part E: Screen Reader Announcements
1. **KPI value changes**: Use `aria-live="polite"` on KPI card values so screen readers announce updates
2. **Batch selection count**: Announce "X items selected" when count changes
3. **Command palette results**: Announce result count "X results found"
4. **Onboarding progress**: Announce "Step X of 6 complete" on completion

## 4. Out of Scope

- Full WCAG AAA compliance
- Tenant/manager dashboard a11y (owner only for now)
- Color blindness simulation testing
- Automated a11y testing tools (axe, lighthouse)
- Database migrations
- CLAUDE.md / AGENTS.md edits

## 5. Exact Files Expected to Change

1. `apps/web/components/dashboard/command-palette.tsx` — focus trap, ARIA roles, keyboard nav
2. `apps/web/components/dashboard/kpi-grid.tsx` — aria-labels on cards
3. `apps/web/components/shared/kpi-card.tsx` — role="status", aria-label, aria-live
4. `apps/web/components/dashboard/rent-collection-bar.tsx` — role="progressbar", aria-value*
5. `apps/web/components/dashboard/inline-edit.tsx` — focus management, aria-label
6. `apps/web/components/dashboard/batch-toolbar.tsx` — focus, aria-live for count
7. `apps/web/components/dashboard/breadcrumbs.tsx` — aria-label, aria-current
8. `apps/web/components/dashboard/property-selector.tsx` — aria-expanded, aria-haspopup
9. `apps/web/lib/status-colors.ts` — add aria-label helper function
10. `apps/web/components/dashboard/section-renderer.tsx` — onboarding progress aria-live

## 6. Implementation Requirements

### Focus Trap Pattern (Command Palette)
```tsx
// On open, focus the search input
useEffect(() => {
  if (open) {
    inputRef.current?.focus();
  }
}, [open]);

// On close, return focus to trigger
const handleClose = () => {
  setOpen(false);
  triggerRef.current?.focus();
};

// Trap focus: Tab on last element → first, Shift+Tab on first → last
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === "Tab") {
    const focusable = dialogRef.current?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable?.length) return;
    const first = focusable[0] as HTMLElement;
    const last = focusable[focusable.length - 1] as HTMLElement;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
};
```

### KPI Card ARIA
```tsx
<div
  role="status"
  aria-label={`${title}: ${prefix ?? ""}${value}`}
  className="..."
>
  <p aria-hidden="true" className="...">{title}</p>
  <p aria-live="polite" className="...">{prefix}{value}</p>
</div>
```

### Progress Bar ARIA
```tsx
<div
  role="progressbar"
  aria-valuenow={collectionRate}
  aria-valuemin={0}
  aria-valuemax={100}
  aria-label={`Rent collection: ${collectionRate}% collected`}
  className="h-3 rounded-full overflow-hidden flex bg-muted"
>
```

### Status Badge ARIA Helper
Add to `status-colors.ts`:
```typescript
export function statusAriaLabel(status: string, context?: string): string {
  const label = status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
  return context ? `${context}: ${label}` : `Status: ${label}`;
}
```

### Breadcrumb ARIA
```tsx
<nav aria-label="Breadcrumb">
  <ol className="flex flex-wrap gap-1.5">
    {items.map((item, i) => (
      <li key={item.href} aria-current={i === items.length - 1 ? "page" : undefined}>
        ...
      </li>
    ))}
  </ol>
</nav>
```

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] Command palette has focus trap, role="dialog", aria-modal, keyboard nav (↑↓ Enter Esc)
2. [ ] KPI cards have role="status" and descriptive aria-labels
3. [ ] Rent collection bar has role="progressbar" with aria-value attributes
4. [ ] All status badges have aria-labels via statusAriaLabel helper
5. [ ] Breadcrumbs have nav aria-label and aria-current on last item
6. [ ] Inline edit manages focus correctly (focus input on edit, return on save/cancel)
7. [ ] Batch toolbar announces selection count changes (aria-live)
8. [ ] Property selector has aria-expanded and aria-haspopup
9. [ ] Tab order is logical through all new components
10. [ ] `npm run gate:web` passes
11. [ ] No visual regressions

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
TESTS_UNIT: xxx/xxx
LINT: clean | [errors]
TYPECHECK: clean | [errors]
BUILD: clean | [errors]
ARIA_LABELS_ADDED: [count]
FOCUS_TRAPS: [count]
KEYBOARD_NAV_FIXED: [count]
NOTES: [any issues]
```

## 10. Constraints

- Do NOT create database migrations
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT modify E2E test files
- Do NOT install new npm dependencies
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Do NOT change visual appearance — a11y changes should be invisible to sighted users
- Use semantic HTML elements where possible (nav, main, section, h1-h6) over divs with ARIA roles
