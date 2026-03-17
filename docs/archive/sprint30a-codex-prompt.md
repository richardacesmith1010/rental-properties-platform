# Sprint 30A — Polish Sweep

## Objective

Sweep remaining visual polish debt: replace 5 straggler inline alerts in `app/` pages with the shared `<Alert>` component, add default font-weight to `.domus-heading`, and standardize `.domus-card` transition duration. Zero new features — CSS/markup cleanup only.

## Context

- Branch: `main`
- HEAD: `ec80953` (Sprint 29 + KPI hero fix)
- Gate baseline: 503/503 tests, lint clean, typecheck clean, build clean
- Production: `https://domusbase.com`
- Sprint 28 created `apps/web/components/ui/alert.tsx` with 4 variants (error, success, warning, info)

## In Scope

1. Replace 5 inline alert patterns in 3 `app/` page files with `<Alert>`
2. Add `font-weight: 600` to `.domus-heading` in globals.css
3. Change `.domus-card` transition from `duration-200` to `150ms`

## Out of Scope

- No new features or pages
- No test file modifications
- No new npm dependencies
- No DB/migration changes
- No deploy
- No changes to CLAUDE.md or AGENTS.md
- No component logic changes — CSS/markup only

## Exact Files Expected to Change

1. `apps/web/app/login/page.tsx`
2. `apps/web/app/settings/page.tsx`
3. `apps/web/app/payments/receipt/[chargeId]/page.tsx`
4. `apps/web/app/globals.css`

## Implementation Requirements

### Part A: Replace 5 Straggler Alerts

For each file, add `import { Alert } from "@/components/ui/alert"` and replace inline alert markup with `<Alert>`.

**`app/login/page.tsx`** (3 instances):

1. Line ~48 — success alert:
```tsx
// Before:
<div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
// After:
<Alert variant="success" className="px-4 py-3">
```

2. Line ~55 — warning alert:
```tsx
// Before:
<div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
// After:
<Alert variant="warning" className="px-4 py-3">
```

3. Line ~64 — error alert:
```tsx
// Before:
<div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
// After:
<Alert variant="error" className="px-4 py-3">
```

**`app/settings/page.tsx`** (1 instance):

Line ~77 — success alert:
```tsx
// Before:
<div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
// After:
<Alert variant="success" className="rounded-xl px-4 py-3">
```

**`app/payments/receipt/[chargeId]/page.tsx`** (1 instance):

Line ~139 — success alert:
```tsx
// Before:
<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
// After:
<Alert variant="success" className="rounded-xl p-4">
```

Note: Ensure the closing tag changes from `</div>` to `</Alert>` for each replacement.

### Part B: Typography Weight Normalization (`globals.css`)

Find the `.domus-heading` class rule in globals.css and add `font-weight: 600`:

```css
/* Before: */
.domus-heading {
  color: var(--domus-heading);
}

/* After: */
.domus-heading {
  color: var(--domus-heading);
  font-weight: 600;
}
```

This normalizes ~85 elements using `.domus-heading` to semibold weight. Elements that explicitly set `font-bold` inline (like h1 in dashboard-header.tsx) will override this default via CSS specificity — no breakage.

### Part C: Transition Duration Standardization (`globals.css`)

Find the `.domus-card` class rule and change its transition duration from 200ms to 150ms:

```css
/* Before: */
.domus-card {
  /* ... existing properties ... */
  transition: all 200ms ease;  /* or transition-all duration-200 */
}

/* After: */
.domus-card {
  /* ... existing properties ... */
  transition: all 150ms ease;
}
```

This aligns card transitions with the dominant `duration-150` pattern used by inputs, buttons, and data-row hover.

## Validation Commands to Run

```bash
npm run gate:web
```

This runs: 503+ tests (36 suites), ESLint, TypeScript strict check, Next.js production build.

## Acceptance Criteria

1. [ ] Zero inline alert `bg-red-50`/`bg-emerald-50`/`bg-amber-50` patterns remain in `app/` directory
2. [ ] `.domus-heading` in globals.css has `font-weight: 600`
3. [ ] `.domus-card` transition uses 150ms
4. [ ] No visual regressions (build passes)
5. [ ] `npm run gate:web` passes (503+ tests, lint, typecheck, build)

## Report Format

```
gate_passed: true/false
test_count: <number>
lint_clean: true/false
typecheck_clean: true/false
build_clean: true/false
files_changed: <list>
```

## Constraints

- Do NOT modify test files
- Do NOT add new npm dependencies
- Do NOT modify DB or deploy
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Report compact status only
