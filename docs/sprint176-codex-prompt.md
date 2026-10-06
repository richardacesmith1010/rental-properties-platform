# Sprint 176 — Accessibility checks, keyboard paths, 375 px pass (L2) · Category 10: Visual design & accessibility

## 1. Objective
Move Visual design & accessibility from 75 toward 80:
1. **Automated accessibility checks** in the post-deploy smoke for the key pages, with 0 serious or critical axe violations.
2. **Keyboard-only paths** for the main flows, with visible focus and no traps.
3. **A 375 px pass** of the main screens, with nothing clipped, overlapping or scrolling sideways.

Fix whatever these checks find.

## 2. Context
- Branch `main`, HEAD `87e15c7` or a later docs-only commit. Next 15.5.27, React 19.2.8.
- Smoke specs live in `apps/web/tests/e2e/`. They run against production through `npm run smoke:web` with the `SMOKE_*` env vars.
  - `smoke-auth.spec.ts` handles login and render for 3 roles, and already visits `/owner/bank` and `/owner/money`.
  - `smoke-theme.spec.ts` handles contrast, with helpers `assertView`, `waitForView` and `configureTheme`, and has `test.setTimeout(90_000)` for the owner.
- Smoke accounts:
  - **owner:** one home ("Smoke Test Property"), a $1 lease, no bank accounts;
  - **manager:** assigned to that home;
  - **tenant:** the $1 lease, below the online-pay minimum.
- Smoke tests must stay **read-only**: no form sends, uploads, payments or answers.
- There is no axe tooling today. Adding `@axe-core/playwright` as an `apps/web` devDependency is allowed.

## 3. In scope
1. **Accessibility smoke:** add `apps/web/tests/e2e/smoke-a11y.spec.ts`. It uses `@axe-core/playwright` with WCAG 2.1 A/AA tags, and runs as each smoke role on:
   - **owner:** `/owner` (Home), `/owner?section=charges` (Rent), `/owner/bank`, `/owner/money`, and the "Add a manager" sheet open;
   - **manager:** `/manager` (Home);
   - **tenant:** `/tenant` (Home) and `/tenant?section=maintenance` (the problem form view, without sending);
   - **public:** `/login` and `/login?mode=signup&role=owner`.

   The spec fails on any `serious` or `critical` violation, and prints the rule id plus the target for each. Do not exclude rules or elements to make it pass, except third-party iframes (Stripe, Plaid) and Vercel/Sentry widgets, each with a comment.
2. **Keyboard spec:** add `apps/web/tests/e2e/smoke-keyboard.spec.ts`. It is read-only and uses keyboard only after login. Assert:
   - **Login:** Tab reaches the role buttons, email, password and "Sign In" in order. Enter on "Sign In" submits.
   - **Owner Home:** Tab reaches the main nav and the "Add" menu. Enter opens it, the arrow keys move, Escape closes it and returns focus to "Add".
   - **"Add a manager" sheet:** focus moves into the sheet, Tab cycles within it (no escape to the page behind), and Escape closes it and returns focus.
   - **Tenant Home:** Tab reaches "Report a problem" and "Message landlord", with visible focus.
   - Every focused element has a visible focus indicator: a computed outline or box-shadow that is not "none", or a ring class.
3. **375 px pass:** add `apps/web/tests/e2e/smoke-mobile-layout.spec.ts`. At 375×812, for every page in item 1, assert:
   - `document.documentElement.scrollWidth <= 375`;
   - no visible element's bounding box extends beyond 375 px (allow fixed-position elements);
   - every visible button and link meets the 44 px minimum height (skip inline text links inside paragraphs).

   Report the offending selectors.
4. **Fix every violation** the three specs find in app code, with the minimal changes: labels, roles, contrast tokens, focus styles, focus trap and restore in `ModalOverlay`, and overflow or width fixes.
5. Wire the new specs into `npm run smoke:web` (`scripts/smoke-web.sh`), the same way the existing smoke specs run, and require `SMOKE_*`.

## 4. Out of scope
- New features, copy rewrites beyond accessible names/labels, money or auth logic, schema, notifications, and the marketing landing page (only `/login` is in scope).
- `.claude/launch.json`, `docs/`, `CLAUDE.md`, `AGENTS.md`.

## 5. Exact files expected to change
- New specs in `apps/web/tests/e2e/`: `smoke-a11y.spec.ts`, `smoke-keyboard.spec.ts`, `smoke-mobile-layout.spec.ts`.
- Shared helpers: `apps/web/tests/e2e/helpers.ts`.
- `scripts/smoke-web.sh`.
- `apps/web/package.json` plus `package-lock.json` (`@axe-core/playwright` devDependency only).
- The app files that the found violations require you to fix. List each one with the violation it fixes.
- Unit or component tests for any fixed component behaviour, for example a `ModalOverlay` focus trap test.

## 6. Implementation requirements
- The smoke specs are read-only, idempotent and production-safe.
- Every fix keeps light and dark mode working and keeps the existing contrast smoke green.
- Each line at most 140 characters. Do not compact code (L-015).
- The user should never need to read instructions to complete these flows. Every step must be self-explanatory.

## 7. Validation commands to run
- `npm run gate:web`
- If the `SMOKE_*` env vars are available: `npx playwright install chromium`, then `APP_URL=https://domusbase.com npm run smoke:web`. This runs against **production**, which does not yet include your fixes, so expect the new specs to show the current violations. Report them. Claude re-runs after deploy.
- Optionally run against a local production build: `npm run build -w @domus/web`, then `npx next start -p 3123` in `apps/web`, and run the smoke with `APP_URL=http://localhost:3123`. This proves your fixes before deploy.

## 8. Acceptance criteria (binary)
1. The three new specs exist, run in `npm run smoke:web`, and use no rule or element exclusions beyond the documented third-party ones.
2. Against a local production build of this branch (`APP_URL=http://localhost:3123`, smoke env), all three specs pass:
   - 0 serious or critical axe violations on every listed page;
   - the keyboard assertions pass;
   - the 375 px assertions pass.
3. The existing smoke suite (auth 3 + theme 11) still passes against the local build.
4. `npm run gate:web` passes. Any component behaviour fix (for example the modal focus trap) has a unit or component test.
5. The report lists every violation found and the fix for each, as rule id → file.

## 9. Report format
JSON per `docs/codex-report-schema.json`. In `self_verification.findings`, include:
- a violations table before and after;
- the results of the local-build smoke run;
- the files changed per violation.

Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB writes, deploy, commit or push. Never touch `.claude/launch.json`. No dependencies other than `@axe-core/playwright`.
