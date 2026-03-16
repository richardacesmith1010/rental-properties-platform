import { expect, test, type Page } from "@playwright/test";
import { DEMO_USERS, loginAs } from "./helpers";

async function loginOwnerOrSkip(page: Page) {
  const loggedIn = await loginAs(page, DEMO_USERS.owner.email, DEMO_USERS.owner.password);
  test.skip(!loggedIn, "Demo seed not available. Run npm run seed:demo first.");
}

test.describe("Property navigation", () => {
  test("property selector renders on overview", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await page.goto("/owner");
    await page.waitForTimeout(1500);

    const selector = page.locator("select").first();
    await expect(page.getByText("Property Scope", { exact: true })).toBeVisible();
    await expect(selector).toBeVisible();
    await expect(selector.locator('option[value=""]')).toHaveCount(1);
  });

  test("breadcrumbs show on section navigation", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await page.goto("/owner?section=charges");
    await page.waitForTimeout(1500);

    const breadcrumbs = page.locator('nav[aria-label="Breadcrumb"]');
    await expect(breadcrumbs).toBeVisible();
    await expect(breadcrumbs.getByText("Dashboard", { exact: true })).toBeVisible();
    await expect(breadcrumbs.getByText("Charges", { exact: true })).toBeVisible();
  });

  test("portfolio drill-down is available from property cards", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await page.goto("/owner?mode=records&section=portfolio");
    await page.waitForTimeout(1500);

    const emptyState = page.getByText(/no properties yet/i);
    if (await emptyState.count()) {
      await expect(emptyState.first()).toBeVisible();
      return;
    }

    const propertyCard = page.locator('[title^="Open the dashboard filtered to "]').first();
    await expect(propertyCard).toBeVisible();
    await propertyCard.click();
    await page.waitForFunction(() => new URL(window.location.href).searchParams.has("property"));

    await expect(page.locator('nav[aria-label="Breadcrumb"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "View Details" })).toBeVisible();
  });
});
