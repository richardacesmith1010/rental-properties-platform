import { expect, test, type Page } from "@playwright/test";
import { DEMO_USERS, dismissOwnerOnboarding, loginAs } from "./helpers";

async function loginOwnerOrSkip(page: Page) {
  const loggedIn = await loginAs(page, DEMO_USERS.owner.email, DEMO_USERS.owner.password);
  test.skip(!loggedIn, "Demo seed not available. Run npm run seed:demo first.");
}

async function openOwnerHome(page: Page) {
  await dismissOwnerOnboarding(page, DEMO_USERS.owner.email);
  await page.goto("/owner");
  await page.waitForLoadState("networkidle").catch(() => {});
}

test.describe("Dashboard home", () => {
  test("shows the owner home shell and finance panel", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await openOwnerHome(page);

    await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: /financial overview/i })).toBeVisible();

    const actionCenterVisible =
      (await page.getByText(/what needs attention/i).count()) > 0 ||
      (await page.getByRole("heading", { name: /no action items right now/i }).count()) > 0;

    expect(actionCenterVisible).toBeTruthy();
  });

  test("shows Domus finance metrics on the home page", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await openOwnerHome(page);

    await page.getByRole("button", { name: "Domus", exact: true }).click();
    await expect(page.getByText(/^This Month$/)).toBeVisible();
    await expect(page.getByText(/^Collected$/)).toBeVisible();
    await expect(page.getByText(/^Outstanding$/)).toBeVisible();
    await expect(page.getByText(/^Net Income$/)).toBeVisible();
    await expect(page.getByText(/^Year to Date$/)).toBeVisible();
  });

  test("charges section still shows status badges or an empty state", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await dismissOwnerOnboarding(page, DEMO_USERS.owner.email);
    await page.goto("/owner?section=charges");
    await page.waitForLoadState("networkidle").catch(() => {});

    await expect(page.getByRole("heading", { name: "Charges", exact: true })).toBeVisible();

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
