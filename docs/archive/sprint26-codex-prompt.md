# Sprint 26 — Accessibility & Performance

## Objective

Fix accessibility gaps and optimize performance so the app meets WCAG AA standards and loads faster. Zero new features — pure quality improvements.

## Context

- Branch: `main`
- HEAD: `40e9694`
- Remote: `origin/main`
- Deploy URL: `https://domusbase.com`
- Gate: 503/503 tests (36 suites), lint clean, typecheck clean, build clean
- Build output shows `/owner` and `/manager` at 244 kB first load JS — largest routes

## In Scope

1. Chart code splitting (recharts behind next/dynamic)
2. WCAG color contrast fixes on landing page
3. ARIA improvements (aria-current on nav, search list semantics)
4. Avatar image optimization
5. Skip-to-content link for keyboard users
6. Focus visible styles for all interactive elements

## Out of Scope

- New features, UI redesigns, or layout changes
- Backend/DB changes
- New npm dependencies
- Changes to test files (Sprint 25 just shipped those)

## Exact Files Expected to Change

### Part A: Chart Code Splitting (4 modified)
1. `apps/web/components/dashboard/charts/expense-breakdown-chart.tsx`
2. `apps/web/components/dashboard/charts/occupancy-chart.tsx`
3. `apps/web/components/dashboard/charts/rent-collection-chart.tsx`
4. `apps/web/components/dashboard/charts/maintenance-chart.tsx`

### Part B: WCAG Color Contrast (1 modified)
5. `apps/web/components/marketing/landing-page.tsx`

### Part C: ARIA Improvements (2 modified)
6. `apps/web/components/dashboard/sidebar-nav.tsx`
7. `apps/web/components/dashboard/global-search.tsx`

### Part D: Image Optimization (1 modified)
8. `apps/web/components/dashboard/user-menu-popover.tsx` (or wherever avatar `unoptimized` is used)

### Part E: Keyboard Accessibility (2 modified)
9. `apps/web/app/layout.tsx`
10. `apps/web/app/globals.css`

**Total: ~10 files modified, 0 new files**

## Implementation Requirements

### Part A: Chart Code Splitting

Each chart component currently imports recharts directly. Wrap each in a lazy-loaded wrapper pattern:

For each chart file (`expense-breakdown-chart.tsx`, `occupancy-chart.tsx`, `rent-collection-chart.tsx`, `maintenance-chart.tsx`):

1. Check if the component is already exported as a named export
2. Create a lazy wrapper using `next/dynamic`:

```tsx
// At the TOP of the file that IMPORTS the chart (NOT the chart file itself)
// This should be done where the charts are consumed, likely in analytics-section.tsx
// or section-renderer.tsx

import dynamic from "next/dynamic";

const ExpenseBreakdownChart = dynamic(
  () => import("./charts/expense-breakdown-chart").then(m => m.ExpenseBreakdownChart),
  { ssr: false, loading: () => <div className="h-64 animate-pulse rounded-xl bg-zinc-100" /> }
);
```

**Important:** Check where these charts are imported. If they're already imported in `analytics-section.tsx` and that section is already behind `next/dynamic` in `section-renderer.tsx`, then the charts are ALREADY code-split transitively. In that case:
- Verify `analytics-section.tsx` is loaded via `next/dynamic` in `section-renderer.tsx`
- If yes, no changes needed for Part A — just confirm and note in report
- If no, wrap the chart imports in `analytics-section.tsx` with `next/dynamic`

### Part B: WCAG Color Contrast

In `landing-page.tsx`, improve contrast on dark backgrounds:

**Replace low-contrast text classes:**

| Current Class | Replacement | Where |
|---|---|---|
| `text-slate-400` (body text on dark bg) | `text-slate-300` | Problem cards, feature descriptions, how-it-works body text |
| `text-slate-500` (on dark bg) | `text-slate-400` | Any instances on slate-950 background |
| `text-zinc-400` (on dark bg) | `text-zinc-300` | FAQ answers, testimonial text |

**Rules:**
- On `bg-slate-950` or `bg-slate-900` backgrounds: minimum `text-slate-300` for body text
- On `bg-slate-950` or `bg-slate-900` backgrounds: minimum `text-slate-200` for important text
- Do NOT change heading colors (they're already white/light enough)
- Do NOT change the overall design or layout — just bump text colors for contrast
- Keep accent colors (violet, emerald, amber) as-is — they have good contrast

**How to verify:** Use the WCAG contrast ratio formula. On `#020617` (slate-950):
- `text-slate-300` (#cbd5e1) = ~11:1 ratio ✅
- `text-slate-400` (#94a3b8) = ~7:1 ratio ✅
- `text-slate-500` (#64748b) = ~4.2:1 ratio ⚠️ borderline
- `text-zinc-400` (#a1a1aa) = ~7:1 ratio ✅

So the main fix is: replace any `text-slate-500` on dark backgrounds with `text-slate-400`.

### Part C: ARIA Improvements

**sidebar-nav.tsx:**

Add `aria-current="page"` to the active navigation item:

```tsx
// In the nav item rendering, when an item is active:
<button
  aria-current={isActive ? "page" : undefined}
  // ... existing props
>
```

Find where the active state is determined (likely comparing `activeItemId` to `item.id`) and add the attribute.

**global-search.tsx:**

Wrap search results in a proper list structure:

```tsx
// Results should be in a <ul> with role="listbox"
<ul role="listbox" aria-label="Search results">
  {filteredItems.map(item => (
    <li key={item.id} role="option">
      <Link ...>{item.label}</Link>
    </li>
  ))}
</ul>
```

Also add `role="combobox"` and `aria-expanded` to the search input:
```tsx
<input
  role="combobox"
  aria-expanded={showResults}
  aria-controls="search-results"
  aria-autocomplete="list"
  // ... existing props
/>
```

### Part D: Image Optimization

Find avatar images using `unoptimized` prop and replace with proper optimization:

```tsx
// Before:
<Image src={avatarUrl} alt="..." unoptimized ... />

// After:
<Image src={avatarUrl} alt="..." sizes="40px" ... />
```

If the `unoptimized` flag is needed because avatars come from Supabase storage URLs, add the Supabase storage domain to `next.config.js` `images.remotePatterns` instead:

```js
// next.config.js
images: {
  remotePatterns: [
    {
      protocol: 'https',
      hostname: '*.supabase.co',
    },
  ],
},
```

If `remotePatterns` is already configured, just remove the `unoptimized` flag. If the avatar is loaded from a public URL that's already in remotePatterns, simply remove `unoptimized` and add `sizes`.

**Check first** — if there's a good reason for `unoptimized` (like dynamic external URLs), leave it and just add `sizes` for layout hints.

### Part E: Keyboard Accessibility

**layout.tsx — Skip to content link:**

Add a visually hidden "Skip to main content" link as the first child of `<body>`:

```tsx
<body>
  <a
    href="#main-content"
    className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-violet-600 focus:px-4 focus:py-2 focus:text-white focus:shadow-lg"
  >
    Skip to main content
  </a>
  {children}
</body>
```

Then ensure the main content area has `id="main-content"` — check each page layout. The dashboard `<main>` tag in `index.tsx` should have this ID. If it already has an ID, use that one for the skip link.

**globals.css — Focus visible styles:**

Add a global focus-visible style that works consistently:

```css
/* Focus visible for keyboard users */
:focus-visible {
  outline: 2px solid #7c3aed; /* violet-600 */
  outline-offset: 2px;
  border-radius: 4px;
}

/* Remove default outline for mouse users */
:focus:not(:focus-visible) {
  outline: none;
}
```

Check if similar styles already exist in globals.css. If so, improve them. If focus styles are already defined, make sure they use `focus-visible` (not just `focus`) so mouse clicks don't show outlines.

## Validation Commands

```bash
# 1. Gate (must pass)
npm run gate:web

# 2. Verify charts are behind dynamic imports
grep -rn "next/dynamic" apps/web/components/dashboard/charts/ apps/web/components/dashboard/analytics-section.tsx apps/web/components/dashboard/section-renderer.tsx

# 3. Verify no text-slate-500 on dark backgrounds in landing page
grep -n "text-slate-500" apps/web/components/marketing/landing-page.tsx

# 4. Verify aria-current on nav
grep -n "aria-current" apps/web/components/dashboard/sidebar-nav.tsx

# 5. Verify skip-to-content link
grep -n "Skip to" apps/web/app/layout.tsx

# 6. Verify focus-visible in CSS
grep -n "focus-visible" apps/web/app/globals.css

# 7. Verify search results have list semantics
grep -n "listbox\|combobox" apps/web/components/dashboard/global-search.tsx
```

## Acceptance Criteria

1. Charts are code-split (either directly or transitively via analytics-section dynamic import)
2. No `text-slate-500` on dark backgrounds in landing page
3. All body text on dark backgrounds uses `text-slate-300` minimum
4. `aria-current="page"` on active sidebar nav item
5. Search results wrapped in list with `role="listbox"`
6. Search input has `role="combobox"` and `aria-expanded`
7. Avatar images have `sizes` attribute (or documented reason for `unoptimized`)
8. Skip-to-content link in layout.tsx
9. `main` element has `id="main-content"`
10. Global `focus-visible` styles in globals.css
11. `npm run gate:web` passes (all 503+ tests, lint, typecheck, build)

## Report Format

```
gate_pass: YES | NO
test_count: <N>/<N>
lint_clean: YES | NO
typecheck_clean: YES | NO
build_clean: YES | NO
charts_code_split: YES | NO | ALREADY_SPLIT (explain)
contrast_fixed: YES | NO (count: N replacements)
aria_current_added: YES | NO
search_listbox_added: YES | NO
avatar_optimized: YES | NO | KEPT_UNOPTIMIZED (reason)
skip_link_added: YES | NO
focus_visible_added: YES | NO
files_changed: <N>
```

## Constraints

- Do NOT modify any source file behavior — only accessibility attributes, CSS, and import patterns
- Do NOT apply database migrations
- Do NOT deploy to Vercel
- Do NOT modify `CLAUDE.md` or `AGENTS.md`
- Do NOT add new npm dependencies
- Do NOT modify test files
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
