# Sprint 243b — Dark-mode chat bubbles (L1)

## 1. Objective
Production theme smoke fails: in dark mode the tenant's own message bubbles use `--action` (#F2F3F5), a large light box
on the dark page ("light box in dark theme", `/tenant?section=notifications`). Since Sprint 242e. Fix the bubble colors.

## 2. Context
HEAD `ce5cdac`. `apps/web/components/dashboard/inbox-views.tsx` lines ~276–281: mine →
`bg-[var(--action)] text-[var(--action-contrast)]`; theirs → `bg-[var(--surface-2)] text-[var(--ink)]`.
Tokens (`app/globals.css`): `--hero` light #0B0C0E / dark #1F2226, `--hero-ink` #FFFFFF / #F2F3F5;
`--surface-3` light #ECEEF1 / dark #2A2D32.

## 3. In scope
Bubble classes only. Mine → `bg-[var(--hero)] text-[var(--hero-ink)]`. Theirs → `bg-[var(--surface-3)] text-[var(--ink)]`.
Any secondary text inside a "mine" bubble (timestamps, sender line) must stay readable on `--hero` (use `--hero-muted`
if it currently uses a muted token meant for light surfaces).

## 4. Out of scope
Everything else. No copy, layout or other component changes.

## 5. Exact files expected to change
- `apps/web/components/dashboard/inbox-views.tsx`
- `apps/web/components/__tests__/inbox-bubble-colors.test.tsx` (new)

## 6. Implementation requirements
Tailwind arbitrary-value classes as above; no new tokens; lines ≤ 140 characters.

## 7. Validation
```
cd apps/web
npx vitest run components/__tests__/inbox-bubble-colors.test.tsx
npm run gate:web
```

## 8. Acceptance criteria
- D1 A rendered "mine" bubble has class `bg-[var(--hero)]` and `text-[var(--hero-ink)]` and no `bg-[var(--action)]`.
- D2 A rendered "theirs" bubble has `bg-[var(--surface-3)]`.
- D3 Gate green (report counts verbatim).

## 9. Report format
Compact status only. Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact
status only.

## 10. Constraints
Stay inside §5. Do not commit. The user should never need to read instructions to complete this flow (colors only).
