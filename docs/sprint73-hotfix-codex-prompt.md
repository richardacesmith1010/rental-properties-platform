# Sprint 73 Hotfix — Codex Implementation Prompt

## 1. Objective

EMERGENCY FIX: The marketing page is blank/invisible — white text on white background. Sprint 73 changed the marketing page background to light but left all text colors as dark-theme values (text-white, text-slate-300). Fix all text colors to be readable on light background.

## 2. Context

- **Branch**: `main`
- **HEAD**: `6a6dade`
- **Production URL**: `https://domusbase.com`
- **Problem**: Marketing page at `/marketing` renders white/invisible text on light background. No content is readable.
- **Root cause**: `landing-page.tsx` and `landing-content.tsx` use `text-white`, `text-slate-300`, `text-slate-400` which are invisible on light backgrounds.

## 3. In Scope

### Fix ALL text colors in marketing page components to be readable on light backgrounds:

**In `landing-page.tsx` and `landing-content.tsx`:**

Replace dark-theme text classes:
- `text-white` on light sections → `text-slate-900` or `text-gray-900`
- `text-slate-300` → `text-slate-600`
- `text-slate-400` → `text-slate-500`
- `text-white/60` → `text-slate-500`
- `border-white/10` → `border-slate-200`
- `bg-white/5` → `bg-slate-50` or `bg-white border border-slate-200`

**EXCEPTION**: The dashboard mockup/preview card area can keep a dark background with light text — it's showing a screenshot of the dark app. But the surrounding page text must be dark on light.

**In `landing-shell.tsx`:**
- Ensure the nav bar text is readable
- "Sign in" button should be visible

**Also check `login/page.tsx`:**
- The split-screen login should have dark text on the right (form) side
- Left branding panel can keep purple/dark gradient with white text

## 4. Out of Scope

- New features
- Database changes
- CLAUDE.md / AGENTS.md edits

## 5. Exact Files Expected to Change

1. `apps/web/components/marketing/landing-page.tsx` — fix all text colors
2. `apps/web/components/marketing/landing-content.tsx` — fix all text colors
3. `apps/web/components/marketing/landing-shell.tsx` — fix nav text colors
4. `apps/web/app/login/page.tsx` — verify form side has dark text (fix if needed)

## 6. Implementation Requirements

**Global find-and-replace approach for marketing components:**

1. Grep for every instance of `text-white` in landing-page.tsx and landing-content.tsx
2. For each instance, check if it's inside a dark container (gradient bg, purple bg) — if yes, keep it
3. If it's on the main light page background, change to `text-slate-900`
4. Grep for `text-slate-300` → change to `text-slate-600`
5. Grep for `text-slate-400` → change to `text-slate-500`
6. Grep for `border-white/10` → change to `border-slate-200`
7. Grep for `bg-white/5` → change to `bg-slate-100` or `bg-white shadow-sm border border-slate-200`

**Key sections that need dark text:**
- Hero headline ("Stop managing rentals in spreadsheets")
- Hero subtitle
- Problem cards ("Spreadsheets can't track payments")
- Feature showcase section
- "How it works" steps
- Testimonials
- Footer text
- "Trusted by 500+ landlords" text

**Key sections that should KEEP light text (on dark/purple backgrounds):**
- CTA buttons (white text on purple buttons) — keep
- Dashboard mockup card (dark bg preview) — keep
- Any section with explicit dark gradient background — keep

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] Marketing page hero text is clearly readable (dark text on light background)
2. [ ] Problem cards text is readable with visible card borders/shadows
3. [ ] Feature showcase text is readable
4. [ ] "How it works" steps text is readable
5. [ ] Footer text is readable
6. [ ] Nav bar text and "Sign in" button clearly visible
7. [ ] CTA buttons still have white text on purple (unchanged)
8. [ ] Login page form side has dark text on light background
9. [ ] `npm run gate:web` passes
10. [ ] No regressions to app interior

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
MARKETING_READABLE: yes | no
LOGIN_READABLE: yes | no
NOTES: [any issues]
```

## 10. Constraints

- Do NOT change app interior styles
- Do NOT create database migrations
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- PRIORITY: This is a production-breaking bug. Fix text visibility first, perfect aesthetics second.
