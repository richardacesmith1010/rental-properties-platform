# Sprint 198 — Phone sign-in shows the form first; sitemap duplicate (L1) · Category 14 (Launch) / 4 (Onboarding)

## 1. Objective
Launch audit S1/S3 (`docs/launch-readiness-audit-2026-10-07.md`). At 375 px, `/login` (and `/login?mode=signup&role=owner`, the "Start free" target) repeats a marketing intro ("Your rental workspace / Manage your rentals like a pro. / Domus brings rent…") above the sign-in card, so the role choice and form start below the first screen (812 px tall). CLAUDE.md treats a primary action that is hidden without scrolling as production-breaking. The sitemap also lists `/marketing`, which duplicates `/`.

## 2. Context
- `apps/web/app/login/page.tsx` renders the intro + the sign-in card (tests in `app/login/__tests__/`). Desktop (≥ 1024 px) shows them side by side; that layout is fine and must not change.
- `apps/web/app/sitemap.ts` lists `/`, `/login`, `/marketing`, `/terms`, `/privacy`.

## 3. In scope
1. Below the `lg` breakpoint, hide the marketing intro block (e.g. `hidden lg:block`) so the sign-in card is the first thing under the page top. Keep a single small brand line ("Domus") so the page isn't anonymous. The card's own copy stays unchanged. At ≥ `lg` nothing changes.
2. Remove the `/marketing` entry from `sitemap.ts` (leave the route itself alone).
3. Tests: a login page test asserting that the intro container has the class that hides it below `lg` and the card renders; a sitemap test asserting `/marketing` is absent and the other 4 URLs remain.

## 4. Out of scope
Any auth logic, sign-in/sign-up behavior, copy changes, other pages. Deploy, commit, `.claude/launch.json`, `docs/`.

## 5. Exact files expected to change
`apps/web/app/login/page.tsx` (or the one component it uses for the intro; name it), `apps/web/app/sitemap.ts`, and their tests.

## 6. Implementation requirements
Lines ≤ 140 chars. No new dependencies. The user should never need to read instructions to complete this flow. Every step must be self-explanatory.

## 7. Validation commands to run
`npm run lint:web`; `npx tsc --noEmit -p apps/web/tsconfig.json`; the login and sitemap tests; `lib/__tests__/plain-language.test.ts`.

## 8. Acceptance criteria (binary)
1. Below `lg`, the intro is hidden and the sign-in card comes first; at `lg` and up the layout is unchanged.
2. The sitemap has no `/marketing`.
3. Tests, lint and typecheck pass; only §5 files changed.

## 8b. Post-deploy (Claude only)
At 375×812, `/login` and `/login?mode=signup&role=owner` show the role choice within the first screen (bounding box bottom ≤ 812); 1280 px unchanged; sign-in for the smoke owner still works; 0 console errors.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB access, no deploy, commit or push. Never touch `.claude/launch.json`.
