# Sprint 55 — Codex Implementation Prompt

## 1. Objective

E2E test coverage for Sprints 50-54 features: dark mode rendering, mobile viewport tests, onboarding flow, accessibility checks, and command palette interactions.

## 2. Context

- **Branch**: `main`
- **HEAD**: (use latest after Sprint 54)
- **Gate baseline**: all unit tests passing, lint clean, typecheck clean, build clean
- **E2E baseline**: 55 tests across 13 spec files
- **E2E pattern**: Demo users (owner@demo.domus.com etc., password Demo123!), loginAs() helper, test.skip() when demo seed unavailable, single Chromium worker, serial execution
- **E2E config**: apps/web/playwright.config.ts, APP_URL env var
- **Helpers**: apps/web/tests/e2e/helpers.ts — DEMO_USERS, loginAs(), collectConsoleErrors()

## 3. In Scope

### New Test Files (4)

#### 1. `apps/web/tests/e2e/dark-mode.spec.ts` (3 tests)
- Test theme switching: click theme toggle, verify body has correct `data-domus-theme` attribute
- Test dark theme renders without white-on-white text: screenshot comparison or check that no elements have `bg-white` class when dark mode active
- Test KPI cards are visible in dark mode: verify card text is not invisible

#### 2. `apps/web/tests/e2e/mobile-viewport.spec.ts` (4 tests)
- Set viewport to 375x667 (iPhone SE)
- Test mobile hamburger menu is visible and opens drawer
- Test KPI grid stacks to single column
- Test command palette opens from mobile search icon
- Test batch toolbar stacks vertically on mobile

#### 3. `apps/web/tests/e2e/onboarding-flow.spec.ts` (3 tests)
- Test onboarding checklist renders for new owner with progress counter
- Test "Skip setup" dismisses onboarding card
- Test skip preference persists after reload (localStorage)

#### 4. `apps/web/tests/e2e/accessibility-enhanced.spec.ts` (4 tests)
- Test KPI cards have role="status" and aria-labels
- Test rent collection bar has role="progressbar"
- Test command palette has role="dialog" and focus trap (open palette, Tab cycles within)
- Test breadcrumbs have aria-label="Breadcrumb"

### Modify Existing (1)
- `apps/web/tests/e2e/command-palette.spec.ts` — add keyboard navigation test (arrow keys, Enter, Escape)

## 4. Out of Scope

- Visual regression testing (screenshot diffing)
- Automated Lighthouse/axe audits
- Tenant/manager viewport tests
- Database migrations
- CLAUDE.md / AGENTS.md edits

## 5. Exact Files Expected to Change

### New Files (4)
1. `apps/web/tests/e2e/dark-mode.spec.ts`
2. `apps/web/tests/e2e/mobile-viewport.spec.ts`
3. `apps/web/tests/e2e/onboarding-flow.spec.ts`
4. `apps/web/tests/e2e/accessibility-enhanced.spec.ts`

### Modified Files (1)
5. `apps/web/tests/e2e/command-palette.spec.ts` — add keyboard nav test

## 6. Implementation Requirements

### Dark Mode Tests
```typescript
import { test, expect } from "@playwright/test";
import { DEMO_USERS, loginAs } from "./helpers";

test.describe.serial("Dark mode", () => {
  test("switches to dark theme", async ({ page }) => {
    const loggedIn = await loginAs(page, "owner");
    if (!loggedIn) { test.skip(); return; }

    // Find and click theme toggle (noctis-neon)
    // Verify data-domus-theme attribute changes
    const body = page.locator("body");
    // Look for theme toggle button
    const themeBtn = page.getByRole("button", { name: /noctis|dark|night/i });
    if (await themeBtn.count() === 0) { test.skip(); return; }
    await themeBtn.click();
    await expect(body).toHaveAttribute("data-domus-theme", /noctis|night/);
  });

  test("KPI cards visible in dark mode", async ({ page }) => {
    const loggedIn = await loginAs(page, "owner");
    if (!loggedIn) { test.skip(); return; }

    // Switch to dark theme first
    // Then check KPI card text is visible (not empty, not hidden)
    // Verify at least one KPI card heading is visible
  });
});
```

### Mobile Viewport Tests
```typescript
import { test, expect } from "@playwright/test";
import { DEMO_USERS, loginAs } from "./helpers";

test.describe.serial("Mobile viewport", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("shows hamburger menu on mobile", async ({ page }) => {
    const loggedIn = await loginAs(page, "owner");
    if (!loggedIn) { test.skip(); return; }

    // Desktop sidebar should be hidden
    // Hamburger/menu button should be visible
    const menuBtn = page.getByRole("button", { name: /menu|navigation/i });
    await expect(menuBtn).toBeVisible();
  });

  test("KPI grid stacks on mobile", async ({ page }) => {
    const loggedIn = await loginAs(page, "owner");
    if (!loggedIn) { test.skip(); return; }

    // Navigate to a section with KPI grid
    // Verify grid is single-column (check computed style or card positions)
  });

  test("command palette opens from mobile", async ({ page }) => {
    const loggedIn = await loginAs(page, "owner");
    if (!loggedIn) { test.skip(); return; }

    // Find search icon in mobile top bar
    const searchBtn = page.getByRole("button", { name: /search/i });
    if (await searchBtn.count() > 0) {
      await searchBtn.click();
      // Verify palette dialog opens
      await expect(page.getByRole("dialog")).toBeVisible();
    }
  });
});
```

### Onboarding Flow Tests
```typescript
test.describe.serial("Onboarding flow", () => {
  test("shows progress counter", async ({ page }) => {
    const loggedIn = await loginAs(page, "owner");
    if (!loggedIn) { test.skip(); return; }

    // Check for "X of 6 complete" or progress indicator
    const progress = page.getByText(/\d+ of \d+ complete/);
    const hasProgress = await progress.count() > 0;
    // Only check if onboarding is visible (new accounts)
    if (hasProgress) {
      await expect(progress).toBeVisible();
    }
  });

  test("skip setup dismisses onboarding", async ({ page }) => {
    const loggedIn = await loginAs(page, "owner");
    if (!loggedIn) { test.skip(); return; }

    const skipBtn = page.getByText(/skip setup/i);
    if (await skipBtn.count() === 0) { test.skip(); return; }
    await skipBtn.click();
    // Onboarding card should be gone
    await expect(skipBtn).not.toBeVisible();
  });
});
```

### Accessibility Tests
```typescript
test.describe.serial("Enhanced accessibility", () => {
  test("KPI cards have status role", async ({ page }) => {
    const loggedIn = await loginAs(page, "owner");
    if (!loggedIn) { test.skip(); return; }

    const statusElements = page.locator('[role="status"]');
    const count = await statusElements.count();
    expect(count).toBeGreaterThan(0);
  });

  test("rent collection bar has progressbar role", async ({ page }) => {
    const loggedIn = await loginAs(page, "owner");
    if (!loggedIn) { test.skip(); return; }

    const progressbar = page.locator('[role="progressbar"]');
    // May not exist if no rent data, so check gracefully
    if (await progressbar.count() > 0) {
      await expect(progressbar.first()).toHaveAttribute("aria-valuenow", /.+/);
    }
  });

  test("command palette has dialog role", async ({ page }) => {
    const loggedIn = await loginAs(page, "owner");
    if (!loggedIn) { test.skip(); return; }

    // Open command palette
    await page.keyboard.press("Meta+k");
    const dialog = page.getByRole("dialog");
    if (await dialog.count() > 0) {
      await expect(dialog).toHaveAttribute("aria-modal", "true");
      // Close it
      await page.keyboard.press("Escape");
    }
  });

  test("breadcrumbs have aria-label", async ({ page }) => {
    const loggedIn = await loginAs(page, "owner");
    if (!loggedIn) { test.skip(); return; }

    // Navigate to a page that shows breadcrumbs (property drill-down)
    const breadcrumb = page.locator('nav[aria-label="Breadcrumb"]');
    // Only check if breadcrumbs are present
    if (await breadcrumb.count() > 0) {
      await expect(breadcrumb.first()).toBeVisible();
    }
  });
});
```

### Key Patterns:
- **Always use `test.skip()` when preconditions aren't met** (no demo data, feature not visible)
- **Never fail on optional content** — check `.count()` before asserting visibility
- **Use `loginAs()` from helpers.ts** — skip if login fails
- **Serial execution** within each describe block

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] 4 new E2E spec files created
2. [ ] ~14 new test cases total
3. [ ] Dark mode tests verify theme attribute changes
4. [ ] Mobile tests use 375x667 viewport and verify responsive layout
5. [ ] Onboarding tests check progress counter and skip functionality
6. [ ] Accessibility tests verify ARIA roles and attributes
7. [ ] All tests use graceful skip when preconditions not met
8. [ ] Command palette keyboard nav test added to existing spec
9. [ ] `npm run gate:web` passes
10. [ ] No flaky assertions — all tests handle empty/missing data states

## 9. Report Format

```
STATUS: PASS | FAIL
NEW_FILES: [list]
MODIFIED_FILES: [list]
NEW_TESTS: [count]
TOTAL_E2E: [count]
TESTS_UNIT: xxx/xxx
LINT: clean | [errors]
TYPECHECK: clean | [errors]
BUILD: clean | [errors]
NOTES: [any issues]
```

## 10. Constraints

- Do NOT create database migrations
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT modify application source code
- Do NOT install new npm dependencies
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Follow existing E2E patterns exactly (helpers.ts, serial execution, skip pattern)
- All tests must handle the case where demo users/data don't exist
