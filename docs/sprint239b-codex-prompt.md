# Sprint 239b — Terms and Privacy readable in light mode (L1, styling only)

## 1. Objective
On `/terms` and `/privacy`, the title, section headings and bold labels use `text-white`. In the light theme the page
background is `var(--ground)` (light grey), so this text is invisible (seen live on 2026-10-18, L-022). Use the theme
tokens the landing page uses so the text reads in both light and dark.

## 2. Context
- `apps/web/app/terms/page.tsx` (100 lines, 13 `white` classes) and `apps/web/app/privacy/page.tsx` (136 lines, 23).
- `LandingShell` sets `bg-[var(--ground)] text-[var(--ink)]` (`components/marketing/landing-shell.tsx:4`).
- The landing page uses `border-[var(--line)]` and `bg-[var(--surface)]` (`components/marketing/landing-page.tsx:13,41`).

## 3. In scope
Class names in the two page files, and the existing test file.

## 4. Out of scope
Any copy change (the text was just shipped in 239a and must stay character for character), `LandingShell`, globals.css,
any other page.

## 5. Exact files expected to change
1. `apps/web/app/terms/page.tsx`
2. `apps/web/app/privacy/page.tsx`
3. `apps/web/app/__tests__/legal-pages.test.tsx`

## 6. Implementation requirements
- `text-white` → `text-[var(--ink)]` (h1, h2, `<strong>`).
- `border-white/10` (and any other `white/NN` border) → `border-[var(--line)]`.
- The section background `bg-[color-mix(in_srgb,var(--surface)_3%,transparent)]` → `bg-[var(--surface)]`.
- Any other `white` class: replace with the closest token from the list above and name it in the report.
- No other class or text changes. Lines ≤ 140 characters.

## 7. Validation commands
```
(cd apps/web && npx vitest run app/__tests__/legal-pages.test.tsx)
(cd apps/web && npx tsc --noEmit)
npm run lint:web
/usr/bin/grep -n "white" apps/web/app/terms/page.tsx apps/web/app/privacy/page.tsx
```
The last command prints nothing. Do NOT run `npm run gate:web`.

## 8. Acceptance criteria
1. New test in `legal-pages.test.tsx`, "uses theme colors, never white": for each page,
   `container.querySelectorAll('[class*="white"]').length === 0`, and the `h1` plus every `h2` has a class containing
   `text-[var(--ink)]`.
2. The existing 239a tests pass unchanged (they prove the copy did not change).

## 9. Report format
Compact status only: files changed with line counts, test names, command results.
Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
- Only the files in §5. No new dependencies. No copy changes.
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory. If the
  user needs to think about what to do, the UI needs to be clearer.
