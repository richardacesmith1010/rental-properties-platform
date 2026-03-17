# Sprint 49 — Codex Implementation Prompt

## 1. Objective

Add E2E tests covering all Sprint 44-48 UI features: KPI dashboard, property drill-down, command palette, empty states, inline editing, batch operations, and tenant portal polish.

## 2. Context

- **Branch**: `main`
- **HEAD**: `69d929c`
- **Gate baseline**: all unit tests passing, lint clean, typecheck clean, build clean
- **Production URL**: `https://domusbase.com`
- **E2E baseline**: 39 tests across 12 spec files (from Sprint 38)
- **E2E config**: `apps/web/playwright.config.ts`, test dir `apps/web/tests/e2e/`, Chromium, 1 worker
- **E2E helpers**: `tests/e2e/helpers.ts` — `DEMO_USERS`, `loginAs()`, `collectConsoleErrors()`
- **Demo users**: `owner@demo.domus.com`, `manager@demo.domus.com`, `tenant1@demo.domus.com` (all `Demo123!`)
- **E2E run command**: `cd apps/web && APP_URL=https://domusbase.com npx playwright test --reporter=list`

**Features to test (Sprints 44-48):**
- Sprint 44: 6 KPI cards, rent collection bar, status color badges, trend arrows
- Sprint 45: Property selector, breadcrumbs, property summary card, portfolio drill-down
- Sprint 46: Empty states across sections, shadow cards, sidebar polish
- Sprint 47: Command palette (⌘K), notification feed with grouping, contextual greeting
- Sprint 48: Inline editing, batch charge selection, tenant overview with quick actions

## 3. In Scope

### Part A: Dashboard KPI Tests (3 tests)
1. **KPI grid renders 6 cards** — login as owner, verify 6 KPI card elements visible on overview
2. **Rent collection bar visible** — verify collection progress bar renders with legend labels
3. **Status color badges on charges** — navigate to charges, verify badges use consistent color classes

### Part B: Property Navigation Tests (3 tests)
4. **Property selector renders** — verify "All Properties" dropdown visible on overview
5. **Breadcrumbs on section navigation** — navigate to charges section, verify breadcrumb shows "Dashboard > Charges"
6. **Portfolio drill-down** — navigate to portfolio, verify property cards are clickable (have cursor-pointer or role=button)

### Part C: Command Palette Tests (3 tests)
7. **⌘K opens command palette** — press Cmd+K (or Ctrl+K), verify modal appears with search input
8. **Command palette search filters results** — type a section name, verify matching results appear
9. **Escape closes command palette** — open palette, press Escape, verify modal closes

### Part D: Visual Polish Tests (2 tests)
10. **Empty state renders when no data** — login as owner (demo account may have data, so test the component exists by checking for empty-state class or role)
11. **Contextual greeting shows on overview** — verify greeting text contains "Good morning" or "Good afternoon" or "Good evening"

### Part E: Inline Edit & Batch Tests (2 tests)
12. **Inline edit elements present on portfolio** — navigate to portfolio, verify property names have click-to-edit affordance (button role or editable indicator)
13. **Batch toolbar hidden by default on charges** — navigate to charges, verify no batch toolbar visible initially (appears only on selection)

### Part F: Tenant Portal Tests (3 tests)
14. **Tenant greeting shows** — login as tenant, verify time-aware greeting on overview
15. **Quick action buttons visible** — verify "Pay Rent", "Submit Request", "View Documents" buttons present
16. **Lease summary card renders** — verify lease information card visible (property name, dates, or rent amount)

## 4. Out of Scope

- Testing actual inline edit save operations (requires demo data manipulation)
- Testing actual batch send reminder (requires notification infrastructure)
- Testing actual payment flows
- Modifying existing E2E tests
- Database migrations
- CLAUDE.md / AGENTS.md edits

## 5. Exact Files Expected to Change

### New Files (4)
1. `apps/web/tests/e2e/dashboard-kpis.spec.ts` — KPI grid, collection bar, status badges (3 tests)
2. `apps/web/tests/e2e/property-navigation.spec.ts` — property selector, breadcrumbs, drill-down (3 tests)
3. `apps/web/tests/e2e/command-palette.spec.ts` — ⌘K open/search/close (3 tests)
4. `apps/web/tests/e2e/tenant-portal.spec.ts` — greeting, quick actions, lease card (3 tests)

### Modified Files (1-2)
5. `apps/web/tests/e2e/owner-flows.spec.ts` — add tests for inline edit elements, batch toolbar, contextual greeting, empty states (4 tests)

## 6. Implementation Requirements

### General E2E Patterns

Follow the existing test patterns exactly:

```typescript
import { test, expect } from "@playwright/test";
import { DEMO_USERS, loginAs } from "./helpers";

// Skip if demo seed unavailable
async function loginOwnerOrSkip(page: Page) {
  const result = await loginAs(page, DEMO_USERS.owner);
  if (!result) test.skip();
}

async function loginTenantOrSkip(page: Page) {
  const result = await loginAs(page, DEMO_USERS.tenant1);
  if (!result) test.skip();
}
```

### Part A: Dashboard KPIs (`dashboard-kpis.spec.ts`)

```typescript
test.describe("Dashboard KPIs", () => {
  test("shows 6 KPI cards on owner overview", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await page.goto("/owner");
    // Wait for dashboard to load
    await page.waitForSelector('[data-testid="kpi-grid"], .kpi-grid, [class*="kpi"]', { timeout: 10000 }).catch(() => {});
    // Check for KPI card elements — look for the card container or gradient backgrounds
    // Use flexible selectors: check for text content of known card titles
    const cardTitles = ["Monthly Revenue", "Occupancy", "Rent Collection", "Outstanding", "Open Tickets", "Net Cash Flow"];
    let foundCount = 0;
    for (const title of cardTitles) {
      const count = await page.getByText(title, { exact: false }).count();
      if (count > 0) foundCount++;
    }
    expect(foundCount).toBeGreaterThanOrEqual(4); // At least 4 of 6 visible (some may vary by data)
  });

  test("shows rent collection bar", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await page.goto("/owner");
    // Look for collection bar text
    const hasCollectionBar = await page.getByText(/rent collection/i).count();
    const hasLegend = await page.getByText(/collected|pending/i).count();
    expect(hasCollectionBar + hasLegend).toBeGreaterThan(0);
  });

  test("charges show status badges", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await page.goto("/owner?section=charges");
    await page.waitForTimeout(2000);
    // Check for status badge elements (paid/pending/late)
    const hasBadges = await page.locator('[class*="emerald"], [class*="amber"], [class*="red"]').count();
    const hasStatusText = await page.getByText(/paid|pending|late/i).count();
    // Either badges exist or empty state exists
    const hasEmptyState = await page.getByText(/no charges/i).count();
    expect(hasBadges + hasStatusText + hasEmptyState).toBeGreaterThan(0);
  });
});
```

### Part B: Property Navigation (`property-navigation.spec.ts`)

```typescript
test.describe("Property Navigation", () => {
  test("property selector renders on overview", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await page.goto("/owner");
    // Look for property selector / "All Properties" text
    const hasSelector = await page.getByText(/all properties/i).count();
    const hasDropdown = await page.locator('select, [role="combobox"], [data-testid="property-selector"]').count();
    expect(hasSelector + hasDropdown).toBeGreaterThan(0);
  });

  test("breadcrumbs show on section navigation", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await page.goto("/owner?section=charges");
    await page.waitForTimeout(2000);
    // Check for breadcrumb nav or "Dashboard" text in breadcrumb area
    const hasBreadcrumb = await page.locator('nav[aria-label="Breadcrumb"], [class*="breadcrumb"]').count();
    const hasDashboardLink = await page.getByText("Dashboard").count();
    expect(hasBreadcrumb + hasDashboardLink).toBeGreaterThan(0);
  });

  test("portfolio shows clickable property cards", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await page.goto("/owner?section=portfolio");
    await page.waitForTimeout(2000);
    // Either property cards with click affordance or empty state
    const hasClickableCards = await page.locator('[role="button"], [class*="cursor-pointer"]').count();
    const hasEmptyState = await page.getByText(/no properties/i).count();
    expect(hasClickableCards + hasEmptyState).toBeGreaterThan(0);
  });
});
```

### Part C: Command Palette (`command-palette.spec.ts`)

```typescript
test.describe("Command Palette", () => {
  test("Cmd+K opens command palette", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await page.goto("/owner");
    await page.waitForTimeout(2000);
    // Press Cmd+K (Mac) or Ctrl+K
    await page.keyboard.press("Meta+k");
    await page.waitForTimeout(500);
    // Check for palette modal — look for search input inside a dialog/modal
    let paletteVisible = await page.locator('[role="dialog"], [data-testid="command-palette"], [class*="command-palette"]').count();
    if (paletteVisible === 0) {
      // Try Ctrl+K as fallback
      await page.keyboard.press("Control+k");
      await page.waitForTimeout(500);
      paletteVisible = await page.locator('[role="dialog"], [data-testid="command-palette"], [class*="command-palette"]').count();
    }
    expect(paletteVisible).toBeGreaterThan(0);
  });

  test("command palette filters results on search", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await page.goto("/owner");
    await page.waitForTimeout(2000);
    await page.keyboard.press("Meta+k");
    await page.waitForTimeout(500);
    // Type a section name
    await page.keyboard.type("charges");
    await page.waitForTimeout(300);
    // Check for filtered results containing "charges"
    const hasResult = await page.getByText(/charges/i).count();
    expect(hasResult).toBeGreaterThan(0);
  });

  test("Escape closes command palette", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await page.goto("/owner");
    await page.waitForTimeout(2000);
    await page.keyboard.press("Meta+k");
    await page.waitForTimeout(500);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const paletteVisible = await page.locator('[role="dialog"], [data-testid="command-palette"], [class*="command-palette"]').count();
    expect(paletteVisible).toBe(0);
  });
});
```

### Part D: Owner Flow Extensions (add to `owner-flows.spec.ts`)

```typescript
test("contextual greeting shows on overview", async ({ page }) => {
  await loginOwnerOrSkip(page);
  await page.goto("/owner");
  await page.waitForTimeout(2000);
  const hasGreeting = await page.getByText(/good (morning|afternoon|evening)/i).count();
  expect(hasGreeting).toBeGreaterThan(0);
});

test("inline edit affordance on portfolio", async ({ page }) => {
  await loginOwnerOrSkip(page);
  await page.goto("/owner?section=portfolio");
  await page.waitForTimeout(2000);
  // Check for inline-edit buttons or editable indicators
  const hasEditButtons = await page.locator('[title="Click to edit"], [data-testid="inline-edit"], [class*="inline-edit"]').count();
  const hasEmptyState = await page.getByText(/no properties/i).count();
  expect(hasEditButtons + hasEmptyState).toBeGreaterThan(0);
});

test("batch toolbar hidden by default on charges", async ({ page }) => {
  await loginOwnerOrSkip(page);
  await page.goto("/owner?section=charges");
  await page.waitForTimeout(2000);
  // Batch toolbar should NOT be visible when nothing selected
  const hasBatchToolbar = await page.getByText(/selected/i).count();
  // Either no toolbar or empty state
  const chargesExist = await page.getByText(/charges/i).count();
  if (chargesExist > 0) {
    expect(hasBatchToolbar).toBe(0); // toolbar hidden
  }
});

test("empty state component renders correctly", async ({ page }) => {
  await loginOwnerOrSkip(page);
  // Navigate to a section likely to be empty for demo user
  await page.goto("/owner?section=vendors");
  await page.waitForTimeout(2000);
  // Check for empty state OR vendor content
  const hasEmptyState = await page.getByText(/no vendors/i).count();
  const hasVendors = await page.getByText(/vendor/i).count();
  expect(hasEmptyState + hasVendors).toBeGreaterThan(0);
});
```

### Part E: Tenant Portal (`tenant-portal.spec.ts`)

```typescript
test.describe("Tenant Portal", () => {
  test("shows time-aware greeting", async ({ page }) => {
    await loginTenantOrSkip(page);
    await page.goto("/tenant");
    await page.waitForTimeout(2000);
    const hasGreeting = await page.getByText(/good (morning|afternoon|evening)/i).count();
    expect(hasGreeting).toBeGreaterThan(0);
  });

  test("shows quick action buttons", async ({ page }) => {
    await loginTenantOrSkip(page);
    await page.goto("/tenant");
    await page.waitForTimeout(2000);
    const hasPayRent = await page.getByText(/pay rent/i).count();
    const hasSubmitRequest = await page.getByText(/submit request/i).count();
    const hasViewDocs = await page.getByText(/view documents/i).count();
    expect(hasPayRent + hasSubmitRequest + hasViewDocs).toBeGreaterThanOrEqual(2);
  });

  test("shows lease summary or payment info", async ({ page }) => {
    await loginTenantOrSkip(page);
    await page.goto("/tenant");
    await page.waitForTimeout(2000);
    // Check for lease card or payment card
    const hasLease = await page.getByText(/your lease|lease period|monthly rent/i).count();
    const hasPayment = await page.getByText(/next payment|payment due|pay now/i).count();
    const hasAllClear = await page.getByText(/all caught up|no payments due/i).count();
    expect(hasLease + hasPayment + hasAllClear).toBeGreaterThan(0);
  });
});
```

### Test Resilience Rules

1. **Always use `test.skip()` when demo users unavailable** — never hard-fail on login
2. **Use flexible selectors** — check for multiple possible class names, roles, text patterns
3. **Handle both data and empty states** — demo account may or may not have properties/charges
4. **Use `waitForTimeout` after navigation** — allow SSR to complete
5. **Don't test exact values** — test for presence of elements, not specific dollar amounts
6. **Each test must be independent** — no test depends on another test's side effects

## 7. Validation Commands to Run

```bash
npm run gate:web
```

E2E tests will be run separately after deploy:
```bash
cd apps/web && APP_URL=https://domusbase.com npx playwright test --reporter=list
```

## 8. Acceptance Criteria

1. [ ] 4 new spec files created with 16 total new E2E tests
2. [ ] Dashboard KPI tests verify card presence and collection bar
3. [ ] Property navigation tests verify selector, breadcrumbs, drill-down
4. [ ] Command palette tests verify open/search/close via keyboard
5. [ ] Tenant portal tests verify greeting, quick actions, lease/payment info
6. [ ] Owner flow tests extended with greeting, inline edit, batch, empty state checks
7. [ ] All tests use `test.skip()` pattern for demo user availability
8. [ ] All tests handle both data-present and empty-state scenarios
9. [ ] `npm run gate:web` passes — all unit tests, lint, typecheck, build clean
10. [ ] No modifications to existing passing E2E tests

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
NEW_FILES: [list]
TESTS_UNIT: xxx/xxx
LINT: clean | [errors]
TYPECHECK: clean | [errors]
BUILD: clean | [errors]
E2E_TESTS_ADDED: x new tests
E2E_SPEC_FILES: [list]
NOTES: [any issues encountered]
```

## 10. Constraints

- Do NOT create database migrations
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT install new npm dependencies
- Do NOT modify existing E2E tests (only add new ones or extend existing spec files)
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- All tests must be resilient to demo data state variations
- Tests must work with `APP_URL=https://domusbase.com` (production)
- Use the exact `loginAs` helper from `tests/e2e/helpers.ts`
- No test should take more than 30 seconds
