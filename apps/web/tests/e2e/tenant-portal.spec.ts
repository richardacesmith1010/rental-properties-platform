import { expect, test, type Page } from "@playwright/test";
import { DEMO_USERS, loginAs } from "./helpers";

async function loginTenantOrSkip(page: Page) {
  const loggedIn = await loginAs(page, DEMO_USERS.tenant1.email, DEMO_USERS.tenant1.password);
  test.skip(!loggedIn, "Demo seed not available. Run npm run seed:demo first.");
}

async function openTenantOverview(page: Page) {
  await page.goto("/tenant");
  await page.waitForTimeout(1500);
}

test.describe("Tenant portal", () => {
  test("shows time-aware greeting", async ({ page }) => {
    await loginTenantOrSkip(page);
    await openTenantOverview(page);

    await expect(page.getByRole("heading", { name: /good (morning|afternoon|evening),/i })).toBeVisible();
  });

  test("shows quick action buttons", async ({ page }) => {
    await loginTenantOrSkip(page);
    await openTenantOverview(page);

    await expect(page.getByRole("link", { name: /pay rent/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /submit request/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /view documents/i })).toBeVisible();
  });

  test("shows lease summary or payment info", async ({ page }) => {
    await loginTenantOrSkip(page);
    await openTenantOverview(page);

    const nextPaymentCard = page.getByText(/next payment due/i);
    const allCaughtUp = page.getByText(/all caught up|no payments due/i);
    const leaseCard = page.getByRole("heading", { name: "Your Lease" });

    const visibleBlocks =
      (await nextPaymentCard.count()) +
      (await allCaughtUp.count()) +
      (await leaseCard.count());

    expect(visibleBlocks).toBeGreaterThan(0);
  });
});
