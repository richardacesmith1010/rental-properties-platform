import { expect, test, type Page } from "@playwright/test";
import { collectConsoleErrors, DEMO_USERS, expectNoConsoleErrors, loginAs } from "./helpers";

async function loginOwnerOrSkip(page: Page) {
  const loggedIn = await loginAs(page, DEMO_USERS.owner.email, DEMO_USERS.owner.password);
  test.skip(!loggedIn, "Demo seed not available. Run npm run seed:demo first.");
}

test.describe("Owner flows", () => {
  test("loads dashboard header and KPI pills", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await loginOwnerOrSkip(page);

    await expect(page.getByRole("heading", { name: /^Good / })).toBeVisible();
    await expect(page.getByText("Monthly revenue")).toBeVisible();
    await expect(page.getByText("Open tickets")).toBeVisible();
    expectNoConsoleErrors(errors);
  });

  test("shows seeded portfolio data", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await page.goto("/owner?mode=records&section=portfolio");

    await expect(page.getByRole("heading", { name: "Portfolio", exact: true })).toBeVisible();
    await expect(page.getByText("Riverside Apartments")).toBeVisible();
    await expect(page.getByText("Oak Park Duplex")).toBeVisible();
  });

  test("shows expenses section with seeded expenses", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await page.goto("/owner?section=expenses");

    await expect(page.getByRole("heading", { name: "Expenses" })).toBeVisible();
    await expect(page.getByText("Create Expense")).toBeVisible();
    await expect(page.getByText("Property P&L")).toBeVisible();
  });

  test("shows analytics charts", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await page.goto("/owner?section=analytics");

    await expect(page.getByText("Rent Collection")).toBeVisible();
    await expect(page.getByText("Expense Breakdown")).toBeVisible();
    await expect(page.getByText("Occupancy Rate")).toBeVisible();
  });

  test("shows contextual greeting summary on overview", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await page.goto("/owner");
    await page.waitForTimeout(1500);

    await expect(page.getByRole("heading", { name: /good (morning|afternoon|evening),/i })).toBeVisible();
    expect(
      await page.getByText(/everything looks good|overdue charge|maintenance ticket/i).count()
    ).toBeGreaterThan(0);
  });

  test("shows inline edit affordance on portfolio", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await page.goto("/owner?mode=records&section=portfolio");
    await page.waitForTimeout(1500);

    const emptyState = page.getByText(/no properties yet/i);
    if (await emptyState.count()) {
      await expect(emptyState.first()).toBeVisible();
      return;
    }

    await expect(page.locator('[title^="Rename "]').first()).toBeVisible();
  });

  test("keeps the batch toolbar hidden by default on charges", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await page.goto("/owner?section=charges");
    await page.waitForTimeout(1500);

    await expect(page.getByText("Send Reminder", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Export CSV", { exact: true })).toHaveCount(0);
  });

  test("shows vendors content or empty state", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await page.goto("/owner?section=vendors");
    await page.waitForTimeout(1500);

    const vendorHeading = page.getByRole("heading", { name: /vendors/i });
    if (await vendorHeading.count()) {
      const vendorState = page.getByText(
        /no vendors yet|create vendor|vendors unavailable|vendor workflows are not ready/i
      );
      expect(await vendorState.count()).toBeGreaterThan(0);
      return;
    }

    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  });

  test("opens the reports page", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await page.goto("/owner/reports");

    await expect(page.getByRole("heading", { name: "Financial Reports" })).toBeVisible();
    await expect(page.locator("h2", { hasText: "Rent Roll" })).toBeVisible();
    await expect(page.locator("h2", { hasText: "Accounts Receivable" })).toBeVisible();
  });
});
