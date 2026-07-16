# Sprint 75 — Codex Implementation Prompt

## 1. Objective

Darken all marketing page text to pass WCAG AA contrast. The page is readable but most headings and body text are too light gray on white.

## 2. Context

- **Branch**: `main`
- **HEAD**: `9fa332d`
- **File**: `apps/web/components/marketing/landing-page.tsx` (primary), `landing-content.tsx`, `landing-shell.tsx`

## 3. The Fix

Do a single pass through all three marketing component files. For every text color class on the light page background, apply these rules:

**Headings (h1, h2, h3, card titles):**
- Must be `text-slate-900` or `text-gray-900` — never lighter
- This includes: "Stop managing rentals...", "One platform, five critical workflows", "Get operational in four steps", "Built for real owners...", "Start simple, upgrade...", "Answers before you commit", problem card titles, step card titles, pricing plan names

**Body text (paragraphs, descriptions, feature lists):**
- Must be `text-slate-600` or `text-gray-600` minimum — never `text-slate-400` or lighter
- This includes: problem card descriptions, step card descriptions, feature showcase descriptions, pricing feature lists, FAQ answers, testimonial text

**Section labels ("FEATURE SHOWCASE", "HOW IT WORKS", "TESTIMONIALS", "PRICING", "FAQ"):**
- These can stay purple (`text-violet-600`) — they look fine

**Muted/secondary text:**
- Minimum `text-slate-500` — never `text-slate-400` or `text-gray-400` on white bg
- This includes: "per month", "forever", "annual contract", "All plans include..."

**EXCEPTION — keep light text on dark backgrounds:**
- Dashboard mockup card content (dark bg) — keep as-is
- CTA buttons (purple bg) — keep white text
- Any element with explicit dark gradient bg — keep white text

## 4. Out of Scope
- App interior changes
- New features
- CLAUDE.md / AGENTS.md edits

## 5. Files to Change
1. `apps/web/components/marketing/landing-page.tsx`
2. `apps/web/components/marketing/landing-content.tsx`
3. `apps/web/components/marketing/landing-shell.tsx` (if any light text exists)

## 6. Validation
```bash
npm run gate:web
```

## 7. Acceptance Criteria
1. [ ] All marketing page headings use `text-slate-900` on white backgrounds
2. [ ] All body text uses `text-slate-600` minimum on white backgrounds
3. [ ] No `text-slate-400`, `text-gray-400`, or lighter on white backgrounds
4. [ ] Section labels remain purple (`text-violet-600`)
5. [ ] Dark-background elements keep light text unchanged
6. [ ] `npm run gate:web` passes

## 8. Constraints
- Do NOT modify app interior components
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT deploy
- Compact status report only
