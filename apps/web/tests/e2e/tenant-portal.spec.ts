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
  test("shows time-aware greeting", async ({ page }) => {
    await loginTenantOrSkip(page);
    await openTenantOverview(page);

    await expect(page.getByText(/good (morning|afternoon|evening),/i).first()).toBeVisible();
  });

  test("shows the simplified quick action links", async ({ page }) => {
    await loginTenantOrSkip(page);
    await openTenantOverview(page);

    const quickActions = page.getByRole("main");
    await expect(quickActions.getByRole("link", { name: /rent review your payment history/i })).toBeVisible();
    await expect(quickActions.getByRole("link", { name: /problems report an issue in your home/i })).toBeVisible();
    await expect(
      quickActions.getByRole("link", { name: /messages read updates from your landlord and reply in one place/i })
    ).toBeVisible();
    await expect(
      quickActions.getByRole("link", { name: /lease open your lease packet and shared rental documents/i })
    ).toBeVisible();
  });

  test("shows lease or payment summary blocks", async ({ page }) => {
    await loginTenantOrSkip(page);
    await openTenantOverview(page);

    const visibleBlocks =
      (await page.getByRole("heading", { name: /no payments due right now|your rent|rent paid!/i }).count()) +
      (await page.getByText(/you'?re all caught up|rent due|outstanding/i).count()) +
      (await page.getByText(/open tickets|documents/i).count());

    expect(visibleBlocks).toBeGreaterThan(0);
  });
});
