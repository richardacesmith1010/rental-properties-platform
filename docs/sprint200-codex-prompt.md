# Sprint 200 — Phone layout smoke covers Settings and every main section (L1: tests) · Category 7 (Reliability) / 10 (Visual)

## 1. Objective
Sprint 199b fixed phone Settings clipping that existed since Sprint 136. `tests/e2e/smoke-mobile-layout.spec.ts` already flags any visible element past the 375 px edge, but it never visited `/settings` or most sections. Extend its coverage so clipping on any main screen fails the smoke run. Also swap the "Your data" tab icon (a trash can) for a download icon.

## 2. Context
- `apps/web/tests/e2e/smoke-mobile-layout.spec.ts` (71 lines): `assertMobileLayout(page, view)` flags `rect.left < -1 || rect.right > 376` for visible elements, and buttons/links under 44 px tall. Visits `/login` (2), owner `/owner`, `?section=charges`, `/owner/bank`, `/owner/money`, the manager sheet, manager `/manager`, tenant `/tenant`, `?section=maintenance`.
- Sections use `?section=<id>`. Owner and manager ids: `overview, charges, maintenance, inbox, portfolio, units, leases, tenants, leasing, applications, invitations, payments, expenses, analytics, documents, vendors, automations, activity, notifications` (owner also `ownership`, `members`). Tenant ids: `overview, charges, maintenance, documents, notifications`.
- `components/settings/settings-layout.tsx`: the phone tab row (`[data-settings-mobile-nav]`, `overflow-x-auto`) legitimately has tabs beyond the right edge while scrolled. The `yourData` item uses `Trash2`.
- `smoke:web` runs this spec via `scripts/smoke-web.sh`.

## 3. In scope
1. **Scrollable containers rule.** In `assertMobileLayout`, skip an element whose nearest ancestor with computed `overflow-x` of `auto`/`scroll` is itself fully on screen (`left ≥ -1`, `right ≤ 376`). Report the scroll container itself if it is off screen. Keep every other rule as is.
2. **Coverage:**
   - owner: `/settings`, plus **every** owner section id listed in §2 (`/owner?section=<id>`);
   - manager: `/settings`, plus every manager section id;
   - tenant: `/settings`, plus every tenant section id;
   - on each `/settings`, also click the **last** phone tab (owner "Account & Data", others "Your data") and assert the layout again.
   Use one sign-in per role. Keep the existing views. Raise the per-test timeout as needed (e.g. 240 s). Assert one view at a time so failures name the path.
3. **Icon:** the `yourData` settings item uses `Download` from `lucide-react` instead of `Trash2` (owner "Account & Data" keeps `Trash2`).
4. Run the extended spec once against production (`APP_URL=https://domusbase.com`, smoke env vars from `apps/web/.env.local` if available in the sandbox; if Chromium can't launch in the sandbox, say so and Claude will run it). Report every finding verbatim. **Do not fix app layout findings in this sprint**; list them.

## 4. Out of scope
Fixing any newly found layout issue (Claude will plan it), other specs, app code except the icon. Deploy, commit, `.claude/launch.json`, `docs/`.

## 5. Exact files expected to change
`apps/web/tests/e2e/smoke-mobile-layout.spec.ts`, `apps/web/components/settings/settings-layout.tsx` (icon only), and the settings-layout unit test if it asserts the icon.

## 6. Implementation requirements
Lines ≤ 140 chars; files ≤ 500 lines (split helpers into `tests/e2e/helpers/` if needed); no new dependencies. The user should never need to read instructions to complete this flow.

## 7. Validation commands to run
`npm run lint:web`; `npx tsc --noEmit -p apps/web/tsconfig.json`; settings-layout unit tests; the extended Playwright spec if Chromium is available.

## 8. Acceptance criteria (binary)
1. The scroll-container rule as in §3.1; every section id and `/settings` (+ last tab) for each role is covered.
2. Icon swapped for "Your data" only.
3. Lint, typecheck and unit tests pass; only §5 files changed; findings reported (not fixed).

## 9. Report format
JSON per `docs/codex-report-schema.json`, with the list of views covered and any findings. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB writes, no deploy, commit or push. Never touch `.claude/launch.json`.
