import { expect, test, type Page } from "@playwright/test";
import { DEMO_USERS, loginAs } from "./helpers";

async function loginManagerOrSkip(page: Page) {
  const loggedIn = await loginAs(page, DEMO_USERS.manager.email, DEMO_USERS.manager.password);
  test.skip(!loggedIn, "Demo seed not available. Run npm run seed:demo first.");
}

test.describe("Manager flows", () => {
  test("loads manager dashboard", async ({ page }) => {
    await loginManagerOrSkip(page);

    await expect(page.getByRole("heading", { name: /^Good / })).toBeVisible();
    await expect(page.getByText("Properties managed")).toBeVisible();
  });

  test("shows assigned properties", async ({ page }) => {
    await loginManagerOrSkip(page);
    await page.goto("/manager?mode=new_property&section=portfolio");

    await expect(page.getByRole("heading", { name: "Portfolio", exact: true })).toBeVisible();
    await expect(page.getByText("Riverside Apartments")).toBeVisible();
    await expect(page.getByText("Oak Park Duplex")).toBeVisible();
  });

  test("shows managed expenses", async ({ page }) => {
    await loginManagerOrSkip(page);
    await page.goto("/manager?section=expenses");

    await expect(page.getByRole("heading", { name: "Expenses" })).toBeVisible();
    await expect(page.getByText("Create Expense")).toBeVisible();
    await expect(page.getByText("Property P&L")).toBeVisible();
  });

  test("shows analytics for managed properties", async ({ page }) => {
    await loginManagerOrSkip(page);
    await page.goto("/manager?section=analytics");

    await expect(page.getByText("Rent Collection")).toBeVisible();
    await expect(page.getByText("Expense Breakdown")).toBeVisible();
  });

  test("shows maintenance tickets", async ({ page }) => {
    await loginManagerOrSkip(page);
    await page.goto("/manager?section=maintenance");

    await expect(page.getByRole("heading", { name: "Maintenance", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Maintenance Tickets" })).toBeVisible();

    const hasTickets = await page.getByText(/\bopen\b/i).count();
    const hasEmptyState = await page.getByText(/no maintenance tickets/i).count();
    expect(hasTickets + hasEmptyState).toBeGreaterThan(0);
  });
});
