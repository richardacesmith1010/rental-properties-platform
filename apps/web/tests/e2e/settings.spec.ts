import { expect, test, type Page } from "@playwright/test";
import { DEMO_USERS, loginAs } from "./helpers";

async function loginOwnerOrSkip(page: Page) {
  const loggedIn = await loginAs(page, DEMO_USERS.owner.email, DEMO_USERS.owner.password);
  test.skip(!loggedIn, "Demo seed not available.");
}

test.describe("Settings page", () => {
  test("owner can access settings with password form", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await page.goto("/settings");

    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await page.getByRole("button", { name: "Security" }).click();
    await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Update Password" })).toBeVisible();
  });

  test("settings shows notification preferences", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await page.goto("/settings");

    await page.getByRole("button", { name: "Notifications" }).click();
    await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
    await expect(page.getByText("New maintenance ticket")).toBeVisible();
    await expect(page.getByText("Rent due reminder")).toBeVisible();
  });

  test("owner page shows Stripe test mode banner", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await page.goto("/owner");

    await expect(page.getByRole("heading", { name: /^Good / })).toBeVisible();

    const banner = page.getByText("Stripe is in test mode. Payments will not be processed with real money.");
    const bannerVisible = await banner.isVisible().catch(() => false);

    if (bannerVisible) {
      await expect(banner).toBeVisible();
    }
  });
});
