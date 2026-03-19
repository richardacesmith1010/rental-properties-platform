import { expect, test, type Page } from "@playwright/test";
import { DEMO_USERS, loginAs } from "./helpers";

const onboardingDismissKey = `domus-owner-onboarding-dismissed:${DEMO_USERS.owner.email}`;

async function loginOwnerOrSkip(page: Page) {
  const loggedIn = await loginAs(page, DEMO_USERS.owner.email, DEMO_USERS.owner.password);
  test.skip(!loggedIn, "Demo seed not available. Run npm run seed:demo first.");
}

async function openOnboardingOrSkip(page: Page) {
  await page.goto("/owner");
  await page.waitForTimeout(1500);

  const progressText = page.getByText(/\d+ of 6 complete/i).first();
  test.skip((await progressText.count()) === 0, "Owner onboarding is not visible for the current demo account state.");

  await expect(progressText).toBeVisible();
  return progressText;
}

test.describe.serial("Onboarding flow", () => {
  test("shows onboarding progress counter", async ({ page }) => {
    await loginOwnerOrSkip(page);
    const progressText = await openOnboardingOrSkip(page);

    await expect(progressText).toContainText(/of 6 complete/i);
    await expect(page.getByText(/Owner setup/i)).toBeVisible();
  });

  test("skip setup dismisses the onboarding card", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await openOnboardingOrSkip(page);

    const skipButton = page.getByRole("button", { name: /skip setup/i });
    await skipButton.click();
    await page.waitForTimeout(300);

    await expect(page.getByRole("button", { name: /skip setup/i })).toHaveCount(0);
  });

  test("skip preference persists after reload", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await openOnboardingOrSkip(page);

    const skipButton = page.getByRole("button", { name: /skip setup/i });
    await skipButton.click();
    await page.waitForTimeout(300);

    await expect(page.getByRole("button", { name: /skip setup/i })).toHaveCount(0);
    await expect.poll(
      () => page.evaluate((key) => window.localStorage.getItem(key), onboardingDismissKey),
      { message: "Expected onboarding dismissal to be stored in localStorage." }
    ).toBe("true");

    await page.reload();
    await page.waitForTimeout(1500);

    await expect(page.getByRole("button", { name: /skip setup/i })).toHaveCount(0);
  });
});
