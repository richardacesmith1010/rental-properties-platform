# Sprint 239c — Terms and Privacy body text contrast (L1, styling only)

## 1. Objective
The body text of `/terms` and `/privacy` uses `text-[var(--faint)]` (#8A8E95 on white, about 3.4:1 — below the 4.5:1
needed for body text). Use `text-[var(--muted)]` (#5D6168, about 6:1) for the section body. Seen live 2026-10-18.

## 2. Context
- `apps/web/app/terms/page.tsx` and `apps/web/app/privacy/page.tsx`: the `<section className="... text-[var(--faint)]">`
  wrapping all articles. The date line under the title also uses `--faint`; it stays (small meta text).
- Tokens: `apps/web/app/globals.css:15,18` (light), `:88,90` and `:119,121` (dark).

## 3. In scope
The `<section>` class on each page and the existing test file.

## 4. Out of scope
Copy, the date line, the banner, other pages, globals.css.

## 5. Exact files expected to change
1. `apps/web/app/terms/page.tsx`
2. `apps/web/app/privacy/page.tsx`
3. `apps/web/app/__tests__/legal-pages.test.tsx`

## 6. Implementation requirements
- In each page, on the `<section>` only: `text-[var(--faint)]` → `text-[var(--muted)]`. No other change.

## 7. Validation commands
```
(cd apps/web && npx vitest run app/__tests__/legal-pages.test.tsx)
(cd apps/web && npx tsc --noEmit)
npm run lint:web
```
Do NOT run `npm run gate:web`.

## 8. Acceptance criteria
1. In the existing "uses theme colors, never white" test, add for each page: `container.querySelector("main section")`
   has a class containing `text-[var(--muted)]` and not `text-[var(--faint)]`.
2. The other legal-page tests pass unchanged.

## 9. Report format
Compact status only: files changed with line counts, test names, command results.
Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
- Only the files in §5. No copy changes. No new dependencies.
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory. If the
  user needs to think about what to do, the UI needs to be clearer.
