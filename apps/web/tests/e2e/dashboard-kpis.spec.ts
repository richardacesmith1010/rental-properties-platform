import { expect, test, type Page } from "@playwright/test";
import { DEMO_USERS, loginAs } from "./helpers";

async function loginOwnerOrSkip(page: Page) {
  const loggedIn = await loginAs(page, DEMO_USERS.owner.email, DEMO_USERS.owner.password);
  test.skip(!loggedIn, "Demo seed not available. Run npm run seed:demo first.");
}

async function openOwnerOverview(page: Page) {
  await page.goto("/owner");
  await page.waitForTimeout(1500);
}

test.describe("Dashboard KPIs", () => {
  test("shows 6 KPI cards on owner overview", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await openOwnerOverview(page);

    const cardTitles = [
      "Monthly Revenue",
      "Occupancy",
      "Rent Collection",
      "Outstanding",
      "Open Tickets",
      "Net Cash Flow"
    ];

    for (const title of cardTitles) {
      expect(await page.getByText(title, { exact: true }).count()).toBeGreaterThan(0);
    }
  });

  test("shows rent collection bar", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await openOwnerOverview(page);

    await expect(page.getByText(/rent collection this month/i)).toBeVisible();
    await expect(page.getByText(/collected/i).first()).toBeVisible();
    await expect(page.getByText(/pending/i).first()).toBeVisible();
  });

  test("charges show status badges or empty state", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await page.goto("/owner?section=charges");
    await page.waitForTimeout(1500);

    const emptyState = page.getByText(/no charges yet|no matching charges/i);
    if (await emptyState.count()) {
      await expect(emptyState.first()).toBeVisible();
      return;
    }

    const coloredBadges = page.locator(
      'span[class*="text-emerald-700"], span[class*="text-amber-700"], span[class*="text-red-700"]'
    );
    await expect(coloredBadges.first()).toBeVisible();
  });
});
