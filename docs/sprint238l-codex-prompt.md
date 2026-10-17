# Sprint 238l — Smoke specs: "Report a problem" → "Report a repair" (L1, test-only, tiny)

## 1. Objective
Sprint 238d (`962152b`) renamed the tenant Home action to **Report a repair**
(`apps/web/components/dashboard/tenant-overview.tsx:82-85`, a `Link` with text `Report a repair`). Two production smoke
specs still look for the old text **Report a problem**, so the smoke run fails (`smoke-keyboard` "tenant home actions"
timed out after 120 s tabbing for a link that no longer exists, Claude's run 2026-10-17 ~04:40 MDT) and the daily
scheduled smoke will fail the same way. Update the two specs.

## 2. Context
- `apps/web/tests/e2e/smoke-keyboard.spec.ts:80`: `await tabTo(page, page.getByRole("link", { name: "Report a problem" }));`
- `apps/web/tests/e2e/smoke-speed.spec.ts:61`: `await expect(current.getByText("Report a problem")).toBeVisible();`
- No component contains "Report a problem" any more (`grep -rln "Report a problem" apps/web/components apps/web/app` is empty).

## 3. In scope
Change the two strings above to `Report a repair`.

## 4. Out of scope
Any app code, any other spec, test titles, helpers.

## 5. Exact files expected to change
1. `apps/web/tests/e2e/smoke-keyboard.spec.ts` (line 80 only)
2. `apps/web/tests/e2e/smoke-speed.spec.ts` (line 61 only)

## 6. Implementation requirements
1. `smoke-keyboard.spec.ts:80` → `page.getByRole("link", { name: "Report a repair" })`.
2. `smoke-speed.spec.ts:61` → `current.getByText("Report a repair", { exact: true })` (exact, so it does not also match the
   link's `title="Report a repair."` or other text).
3. Nothing else changes. The working tree may contain other uncommitted files from another sprint: do not touch them.

## 7. Validation commands
```
cd apps/web && npx tsc --noEmit && cd ../.. && npm run lint:web && git diff --check
```
Do NOT run Playwright (Claude runs it against production) or `gate:web`.

## 8. Acceptance criteria
1. `git diff --stat` shows exactly the two files, 1 line changed in each.
2. `grep -rn "Report a problem" apps/web/tests` returns nothing.
3. (Claude) `APP_URL=https://domusbase.com npx playwright test tests/e2e/smoke-keyboard.spec.ts tests/e2e/smoke-speed.spec.ts`
   passes with the `SMOKE_*` variables loaded.

## 9. Report format
Compact status only: files changed, the two new lines, command results. Do NOT include "Claude prompt" or "recommended
next steps for Claude" sections. Report compact status only.

## 10. Constraints
Only the files in §5. No new dependencies.
