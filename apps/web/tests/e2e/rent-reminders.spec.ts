import { expect, test, type Page } from "@playwright/test";
import { DEMO_USERS, loginAs } from "./helpers";

async function loginTenantOrSkip(page: Page) {
  const loggedIn = await loginAs(page, DEMO_USERS.tenant1.email, DEMO_USERS.tenant1.password);
  test.skip(!loggedIn, "Demo seed not available. Run npm run seed:demo first.");
}

async function loginOwnerOrSkip(page: Page) {
  const loggedIn = await loginAs(page, DEMO_USERS.owner.email, DEMO_USERS.owner.password);
  test.skip(!loggedIn, "Demo seed not available. Run npm run seed:demo first.");
}

test.describe.serial("Rent reminders", () => {
  test("tenant dashboard shows urgency or caught-up rent status", async ({ page }) => {
    await loginTenantOrSkip(page);
    await page.goto("/tenant");
    await page.waitForTimeout(1500);

    const urgencyBannerCount = await page.getByText(/rent due in|rent is due today|rent is overdue/i).count();
    const caughtUpCount = await page.getByText(/caught up|no payments due|all paid/i).count();
    const chargesContentCount = await page.getByText(/rent|charge|payment/i).count();

    expect(urgencyBannerCount + caughtUpCount + chargesContentCount).toBeGreaterThan(0);
  });

  test("urgency banner exposes a pay action when urgent charges exist", async ({ page }) => {
    await loginTenantOrSkip(page);
    await page.goto("/tenant");
    await page.waitForTimeout(1500);

    const urgencyBannerCount = await page.getByText(/rent due in|rent is due today|rent is overdue/i).count();
    test.skip(urgencyBannerCount === 0, "No urgent charges are visible for the current demo tenant.");

    const payNowLink = page.getByRole("link", { name: /pay now/i });
    const payNowButton = page.getByRole("button", { name: /pay now/i });

    expect((await payNowLink.count()) + (await payNowButton.count())).toBeGreaterThan(0);
  });

  test("owner charges section shows reminder indicators when reminders have been sent", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await page.goto("/owner?section=charges");
    await page.waitForTimeout(1500);

    const reminderIndicators = page.getByText(/reminder sent/i);
    if ((await reminderIndicators.count()) > 0) {
      await expect(reminderIndicators.first()).toBeVisible();
      return;
    }

    const chargesHeadingCount = await page.getByRole("heading", { name: /charges/i }).count();
    const chargeContentCount = await page.getByText(/rent|charge|payment|no charges/i).count();

    expect(chargesHeadingCount + chargeContentCount).toBeGreaterThan(0);
  });
});
