import { expect, test, type Page } from "@playwright/test";
import { DEMO_USERS, loginAs } from "./helpers";

async function loginTenantOrSkip(page: Page) {
  const loggedIn = await loginAs(page, DEMO_USERS.tenant1.email, DEMO_USERS.tenant1.password);
  test.skip(!loggedIn, "Demo seed not available. Run npm run seed:demo first.");
}

async function openTenantOverview(page: Page) {
  await page.goto("/tenant");
  await page.waitForLoadState("networkidle").catch(() => {});
}

test.describe("Tenant portal", () => {
  test("shows the home greeting", async ({ page }) => {
    await loginTenantOrSkip(page);
    await openTenantOverview(page);

    await expect(page.getByRole("heading", { name: /Hi,/ })).toBeVisible();
  });

  test("shows home actions", async ({ page }) => {
    await loginTenantOrSkip(page);
    await openTenantOverview(page);

    const quickActions = page.getByRole("main");
    await expect(quickActions.getByRole("link", { name: /report a problem/i })).toBeVisible();
    await expect(quickActions.getByRole("link", { name: /message landlord/i })).toBeVisible();
  });

  test("shows lease or payment summary blocks", async ({ page }) => {
    await loginTenantOrSkip(page);
    await openTenantOverview(page);

    const visibleBlocks =
      (await page.getByRole("heading", { name: /no payments due right now|your rent|rent paid!/i }).count()) +
      (await page.getByText(/you'?re all caught up|rent due|outstanding/i).count()) +
      (await page.getByText(/your problems|your lease/i).count());

    expect(visibleBlocks).toBeGreaterThan(0);
  });
});
