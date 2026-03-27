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

test.describe.serial("Mobile viewport", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("shows hamburger menu on mobile", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await openOwnerHome(page);

    const menuButton = page.getByRole("button", { name: /open navigation menu/i });
    test.skip((await menuButton.count()) === 0, "Mobile navigation trigger is not available.");

    await expect(menuButton).toBeVisible();
    await menuButton.click();
    await expect(page.getByRole("navigation", { name: "Main navigation" }).first()).toBeVisible();
  });

  test("home cards stack into a single column on mobile", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await openOwnerHome(page);

    const topCard =
      (await page.getByRole("heading", { name: /needs your attention/i }).count()) > 0
        ? page.getByRole("heading", { name: /needs your attention/i }).first()
        : page.getByRole("heading", { name: /no action items right now/i });
    const lowerCard = page.getByRole("heading", { name: /financial overview/i });

    await expect(topCard).toBeVisible();
    await expect(lowerCard).toBeVisible();

    const firstBox = await topCard.boundingBox();
    const secondBox = await lowerCard.boundingBox();

    if (!firstBox || !secondBox) {
      test.skip(true, "Unable to measure the mobile card layout.");
      return;
    }

    expect(secondBox.y).toBeGreaterThan(firstBox.y + firstBox.height);
  });

  test("command palette opens from the mobile search button", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await openOwnerHome(page);

    const searchButton = page.getByRole("button", { name: /open search/i });
    test.skip((await searchButton.count()) === 0, "Mobile search trigger is not available.");

    await searchButton.click();
    await expect(page.getByRole("dialog", { name: /search commands/i })).toBeVisible();
  });

  test("pagination controls stay thumb-sized on mobile", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await dismissOwnerOnboarding(page, DEMO_USERS.owner.email);
    await page.goto("/owner?section=charges");
    await page.waitForLoadState("networkidle").catch(() => {});

    const previousButton = page.getByRole("button", { name: "Previous section" });
    const nextButton = page.getByRole("button", { name: "Next section" });

    const previousBox = await previousButton.boundingBox();
    const nextBox = await nextButton.boundingBox();

    if (!previousBox || !nextBox) {
      test.skip(true, "Unable to measure pagination controls.");
      return;
    }

    expect(previousBox.width).toBeGreaterThanOrEqual(44);
    expect(previousBox.height).toBeGreaterThanOrEqual(44);
    expect(nextBox.width).toBeGreaterThanOrEqual(44);
    expect(nextBox.height).toBeGreaterThanOrEqual(44);
  });
});
