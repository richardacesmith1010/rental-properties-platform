# Sprint 76 — Codex Implementation Prompt

## 1. Objective

Aggressive marketing page text contrast fix + settings duplicate text bug. Previous sprints (73 hotfix, 75) only changed a handful of lines. This sprint must grep EVERY text color class in the marketing components and fix ALL remaining light-text-on-white issues. Also fix the duplicate description in settings.

## 2. Context

- **Branch**: `main`
- **HEAD**: `e38467e`
- **Files**: `apps/web/components/marketing/landing-page.tsx`, `landing-content.tsx`, `landing-shell.tsx`
- **Settings bug**: `apps/web/app/settings/page.tsx` or the profile settings component — "Update how your name and photo appear throughout Domus." appears twice

## 3. The Fix

### Part A: Marketing — Nuclear Text Color Pass

Run this exact process on ALL three marketing files:

1. **Find every heading** (`<h1>`, `<h2>`, `<h3>`, or any element with `font-bold`/`font-semibold` that acts as a heading). Every single one on a white/light background MUST use `text-slate-900`. No exceptions.

2. **Find every body paragraph** (`<p>` elements with descriptive text). Every single one on a white/light background MUST use `text-slate-700` minimum. Never `text-slate-400`, `text-slate-500`, or `text-gray-400`.

3. **Find every small/muted text** (labels like "per month", "forever", card subtitles). These MUST use `text-slate-600` minimum.

4. **Find every section label** ("FEATURE SHOWCASE", "HOW IT WORKS", etc.). These can stay `text-violet-600` — they're fine.

**Specific sections that are STILL too light and must be fixed:**

- Problem cards ("Spreadsheets can't track payments", "Texts and emails get lost", "Maintenance falls through cracks"):
  - Card titles → `text-slate-900 font-bold`
  - Card descriptions → `text-slate-700`

- "One platform, five critical workflows" heading → `text-slate-900`
- Feature showcase description text → `text-slate-700`

- "Get operational in four steps" heading → `text-slate-900`
- Step card titles ("Create your account", etc.) → `text-slate-900`
- Step card descriptions → `text-slate-700`

- "Built for real owners, managers, and tenants" heading → `text-slate-900`
- Testimonial quote text → `text-slate-700`
- Testimonial name → `text-slate-900`

- "Start simple, upgrade when your portfolio does" heading → `text-slate-900`
- Pricing feature list text → `text-slate-700`
- "per month", "forever", "annual contract" → `text-slate-600`
- "All plans include..." → `text-slate-600`

- "Answers before you commit" heading → `text-slate-900`
- FAQ answer text → `text-slate-700`

- Footer text → `text-slate-600` minimum

**EXCEPTION — keep light/white text ONLY on:**
- Elements inside the dark dashboard mockup card
- Text on purple/gradient CTA buttons
- Text on any explicitly dark background section

### Part B: Settings Duplicate Text

In the settings profile section, the text "Update how your name and photo appear throughout Domus." appears twice in a row. Remove the duplicate line. It should appear exactly once.

## 4. Validation
```bash
npm run gate:web
```

## 5. Acceptance Criteria
1. [ ] Every marketing heading on white bg uses `text-slate-900`
2. [ ] Every marketing body paragraph on white bg uses `text-slate-700` minimum
3. [ ] Every marketing muted label uses `text-slate-600` minimum
4. [ ] Zero instances of `text-slate-400` or `text-gray-400` on white backgrounds in marketing files
5. [ ] Problem card titles are clearly bold and dark
6. [ ] Step card titles and descriptions are clearly readable
7. [ ] FAQ and testimonial text is clearly readable
8. [ ] Settings profile description appears exactly once
9. [ ] `npm run gate:web` passes
10. [ ] Dark-background elements still have light text (no regression)

## 6. Constraints
- Do NOT modify app interior dashboard components
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT deploy
- Compact status report only
