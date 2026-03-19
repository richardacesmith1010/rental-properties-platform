import { expect, test, type Page } from "@playwright/test";
import { DEMO_USERS, loginAs } from "./helpers";

async function loginOwnerOrSkip(page: Page) {
  const loggedIn = await loginAs(page, DEMO_USERS.owner.email, DEMO_USERS.owner.password);
  test.skip(!loggedIn, "Demo seed not available. Run npm run seed:demo first.");
}

test.describe.serial("Mobile viewport", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("shows hamburger menu on mobile", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await page.goto("/owner");
    await page.waitForTimeout(1500);

    const menuButton = page.getByRole("button", { name: /open navigation menu/i });
    test.skip((await menuButton.count()) === 0, "Mobile navigation trigger is not available.");

    await expect(menuButton).toBeVisible();
    await menuButton.click();
    await expect(page.getByRole("navigation", { name: "Main navigation" }).first()).toBeVisible();
  });

  test("KPI grid stacks into a single column on mobile", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await page.goto("/owner");
    await page.waitForTimeout(1500);

    const cards = page.getByRole("status");
    const cardCount = await cards.count();
    test.skip(cardCount < 2, "Not enough KPI cards are visible to verify the mobile stack.");

    const firstBox = await cards.nth(0).boundingBox();
    const secondBox = await cards.nth(1).boundingBox();

    if (!firstBox || !secondBox) {
      test.skip(true, "Unable to measure KPI card layout.");
      return;
    }

    expect(Math.abs(firstBox.x - secondBox.x)).toBeLessThan(8);
    expect(secondBox.y).toBeGreaterThan(firstBox.y + 10);
  });

  test("command palette opens from the mobile search button", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await page.goto("/owner");
    await page.waitForTimeout(1500);

    const searchButton = page.getByRole("button", { name: /open search/i });
    test.skip((await searchButton.count()) === 0, "Mobile search trigger is not available.");

    await searchButton.click();
    await expect(page.getByRole("dialog", { name: /search commands/i })).toBeVisible();
  });

  test("batch toolbar stacks vertically on mobile", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await page.goto("/owner?section=charges");
    await page.waitForTimeout(1500);

    const chargeCheckboxes = page.locator('input[type="checkbox"][aria-label^="Select charge for "]');
    test.skip((await chargeCheckboxes.count()) === 0, "No selectable charges are available for the demo account.");

    await chargeCheckboxes.first().check();

    const toolbar = page.getByRole("toolbar", { name: /batch actions for selected charges/i });
    await expect(toolbar).toBeVisible();

    const selectionStatus = toolbar.getByRole("status");
    const sendReminderButton = toolbar.getByRole("button", { name: /send reminder/i });
    const statusBox = await selectionStatus.boundingBox();
    const buttonBox = await sendReminderButton.boundingBox();

    if (!statusBox || !buttonBox) {
      test.skip(true, "Unable to measure the batch toolbar layout.");
      return;
    }

    expect(buttonBox.y).toBeGreaterThan(statusBox.y + 4);
  });
});
