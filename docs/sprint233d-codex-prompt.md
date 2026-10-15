# Sprint 233d — Theme smoke must ignore the hidden page copy during React's swap (L1, test only)

## 1. Objective
After Sprint 233b (functions moved to pdx1, pages ~2× faster), the production theme smoke fails
intermittently (2 of 4 runs) on tenant `/settings`:
`strict mode violation: locator('main') resolved to 2 elements`. The second element is not in the
accessibility tree (error output: element 1 is `getByRole('main')`, element 2 only
`locator('#main-content').nth(1)`; the page snapshot shows one `main`). It is the hidden copy React
holds during a streamed swap. Users never see it. Make the smoke wait for the visible `main` only.

## 2. Context
- HEAD `f44d502`.
- `apps/web/tests/e2e/smoke-theme.spec.ts:183-186`:
  ```ts
  async function waitForView(page: Page) {
    await expect(page.locator("main")).toBeVisible({ timeout: 6_000 });
    await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => {});
  }
  ```
- Same pattern: `apps/web/tests/e2e/dark-mode.spec.ts:33` `page.locator("main").evaluate(...)`.
- Claude probed 12 plain `/settings` + `/tenant` loads with a MutationObserver: 0 duplicates; Sentry has
  no hydration or production errors. Not a user-facing bug.

## 3. In scope
Use the accessible, visible main region in both specs.

## 4. Out of scope
App code. Any other spec. Timeouts. The contrast assertions themselves.

## 5. Exact files expected to change
1. `apps/web/tests/e2e/smoke-theme.spec.ts`
2. `apps/web/tests/e2e/dark-mode.spec.ts`

## 6. Implementation requirements
1. `waitForView`: `await expect(page.getByRole("main")).toBeVisible({ timeout: 6_000 });`
   (`getByRole` skips elements hidden from the accessibility tree.)
2. `dark-mode.spec.ts:33`: `page.getByRole("main").evaluate(...)`.
3. No other change. Lines ≤ 140 characters.

## 7. Validation commands
```
cd apps/web && npx tsc --noEmit
npm run lint:web
```
Do not run Playwright against production (needs the owner's test logins); Claude runs it.

## 8. Acceptance criteria
- `/usr/bin/grep -rn 'locator("main")' apps/web/tests/e2e` returns nothing.
- Both specs use `getByRole("main")` exactly at the two places above.
- tsc and lint clean.
- (Claude) theme smoke passes 5 runs in a row against production.

## 9. Report format
Compact status only: files changed, command results. Do NOT include "Claude prompt" or
"recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
Only the two files in §5. No new dependencies.
