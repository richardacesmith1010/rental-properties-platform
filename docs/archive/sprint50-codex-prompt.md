# Sprint 50 — Codex Implementation Prompt

## 1. Objective

Fix dark mode support for all Sprint 44-48 components. Replace hardcoded light-only Tailwind classes with semantic design tokens so all themes (light, noctis-neon, imperium-night) render correctly.

## 2. Context

- **Branch**: `main`
- **HEAD**: `f3809d9`
- **Gate baseline**: all unit tests passing, lint clean, typecheck clean, build clean
- **Theme system**: `darkMode: ["class"]` in tailwind.config.ts, `data-domus-theme` attribute with CSS variables in globals.css
- **Semantic tokens available**: `text-foreground`, `text-muted-foreground`, `bg-card`, `bg-background`, `bg-muted`, `border-border`, `domus-card` class, `var(--domus-primary)`

## 3. In Scope

### Fix hardcoded colors in these files:

**rent-collection-bar.tsx:**
- `bg-white` → `bg-card`
- `bg-zinc-100` → `bg-muted`
- `text-zinc-500/600` → `text-muted-foreground`

**kpi-card.tsx:**
- `text-zinc-500` → `text-muted-foreground`
- `text-zinc-950` → `text-foreground`
- `text-zinc-600` → `text-muted-foreground`

**property-summary-card.tsx:**
- `bg-white/95` → `bg-card/95`
- `text-zinc-900` → `text-foreground`
- `text-zinc-500` → `text-muted-foreground`
- `bg-zinc-50/80` → `bg-muted/80`
- `border-zinc-200/80` → `border-border/80`
- `bg-violet-100/80` → keep or use `bg-primary/10`

**tenant-overview.tsx:**
- All `text-zinc-900` → `text-foreground`
- All `text-zinc-500` → `text-muted-foreground`
- `bg-violet-50` → `bg-primary/10`
- `bg-violet-600` → `bg-primary`
- `text-zinc-900` in lease data → `text-foreground`

**batch-toolbar.tsx:**
- `bg-violet-50/70` → `bg-primary/10`
- `text-violet-900` → `text-foreground`
- `bg-violet-200` → `border-border`

**command-palette.tsx:**
- `bg-violet-50 text-violet-950` (active item) → `bg-primary/10 text-foreground`
- `bg-violet-100 text-violet-700` (hover) → `bg-primary/15 text-primary`
- Backdrop `bg-slate-950/55` is fine (intentionally dark overlay)

**kpi-grid.tsx:**
- Gradient strings can stay (they render on card backgrounds with white text overlay, which works in both modes)
- But verify any text/label colors inside gradient cards use white/light text

### General rules:
- Replace `text-zinc-900`, `text-zinc-800` → `text-foreground`
- Replace `text-zinc-500`, `text-zinc-600`, `text-zinc-400` → `text-muted-foreground`
- Replace `bg-white` → `bg-card` or `bg-background`
- Replace `bg-zinc-50`, `bg-zinc-100` → `bg-muted`
- Replace `border-zinc-200`, `border-zinc-300` → `border-border`
- Replace hardcoded `bg-violet-*` accents → `bg-primary/N` opacity variants
- Do NOT change colors inside gradient cards (they have their own light text)
- Do NOT change the status-colors.ts semantic system (those are badge-specific and intentional)

## 4. Out of Scope

- New features or components
- Mobile responsiveness changes (Sprint 51)
- Database migrations
- CLAUDE.md / AGENTS.md edits
- E2E test changes

## 5. Exact Files Expected to Change

1. `apps/web/components/dashboard/rent-collection-bar.tsx`
2. `apps/web/components/shared/kpi-card.tsx`
3. `apps/web/components/dashboard/property-summary-card.tsx`
4. `apps/web/components/dashboard/tenant-overview.tsx`
5. `apps/web/components/dashboard/batch-toolbar.tsx`
6. `apps/web/components/dashboard/command-palette.tsx`
7. `apps/web/components/dashboard/kpi-grid.tsx` (verify only, may not need changes)

## 6. Implementation Requirements

This is a find-and-replace sprint. For each file:
1. Read the file
2. Find all hardcoded zinc/slate/white color classes
3. Replace with semantic equivalents per the mapping above
4. Verify the component still looks correct conceptually (light text on gradient cards stays light, etc.)

**DO NOT:**
- Add `dark:` prefixed classes — the app uses CSS variables via `data-domus-theme`, not Tailwind `dark:` prefix
- Change the gradient background strings in kpi-grid.tsx
- Change status-colors.ts badge colors
- Change any colors in globals.css

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] Zero hardcoded `text-zinc-900/800` in Sprint 44-48 component files (replaced with `text-foreground`)
2. [ ] Zero hardcoded `text-zinc-500/600` in Sprint 44-48 component files (replaced with `text-muted-foreground`)
3. [ ] Zero hardcoded `bg-white` in Sprint 44-48 component files (replaced with `bg-card` or `bg-background`)
4. [ ] Zero hardcoded `bg-zinc-50/100` in Sprint 44-48 component files (replaced with `bg-muted`)
5. [ ] Gradient card text colors remain light (white/zinc-50) for readability
6. [ ] `npm run gate:web` passes
7. [ ] No behavioral regressions

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
TESTS_UNIT: xxx/xxx
LINT: clean | [errors]
TYPECHECK: clean | [errors]
BUILD: clean | [errors]
HARDCODED_COLORS_REMAINING: 0 | [count]
NOTES: [any issues]
```

## 10. Constraints

- Do NOT create database migrations
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT modify E2E test files
- Do NOT install new npm dependencies
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Do NOT add Tailwind `dark:` prefixes — use semantic tokens only
