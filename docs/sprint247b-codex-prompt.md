# Sprint 247b — Tab switch polish: no focus box, no doubled heading (L1)

## 1. Objective
After 247a, switching tenant tabs on a phone moves focus to the section heading (good for screen readers) but WebKit
draws a large focus ring around it (very visible in dark mode), and the visible section heading repeats the page title
("Rent" h1, then "Rent" h2 right under it; same for Repairs).

## 2. Context
HEAD `d4ad10b`. `apps/web/components/dashboard/tenant-section-tabs.tsx` (96 lines): per-section `<h2 tabIndex={-1}>`
— visible for `charges`/`maintenance`, `sr-only` for `overview`/`notifications`; the page `<h1>` already shows the
section label.

## 3. In scope
1. Make every per-section `h2` `sr-only` (the `h1` carries the visible title). Keep them focus targets.
2. Programmatic focus must not draw a ring: add `outline-none focus:outline-none` (and no ring classes) to those
   `tabIndex={-1}` headings only.

## 4. Out of scope
Everything else. No copy changes.

## 5. Exact files expected to change
- `apps/web/components/dashboard/tenant-section-tabs.tsx`
- `apps/web/components/__tests__/tenant-section-tabs.test.tsx`

## 6. Implementation requirements
Lines ≤ 140 characters.

## 7. Validation
```
cd apps/web
npx vitest run components/__tests__/tenant-section-tabs.test.tsx
```
(then from the repo root) `npm run gate:web`

## 8. Acceptance criteria
- P1 Each of the four section headings has class `sr-only` and `outline-none`, `tabIndex` -1, and still receives focus
  after a switch (existing T2 focus assertion still passes).
- P2 No visible element other than the `h1` contains the section label text in the header area for Rent and Repairs
  (assert the visible `h2` count is 0).
- P3 Gate green (counts verbatim).

## 9. Report format
Compact status only. Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact
status only.

## 10. Constraints
Stay inside §5. Do not commit. The user should never need to read instructions to complete this flow.
