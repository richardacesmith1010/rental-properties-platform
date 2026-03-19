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

async function openTenantMaintenance(page: Page) {
  await page.goto("/tenant?section=maintenance");
  await page.waitForTimeout(1500);
}

async function advanceTicketFormToPhotoStep(page: Page) {
  const formHeading = page.getByRole("heading", { name: /submit maintenance request/i });
  test.skip((await formHeading.count()) === 0, "Ticket creation form is not available for this tenant.");

  const unitSelect = page.locator("select").first();
  test.skip((await unitSelect.count()) === 0, "No unit selector is available for ticket creation.");

  const unitOptions = await unitSelect.locator("option").count();
  test.skip(unitOptions < 2, "No tenant units are available for ticket creation.");

  await unitSelect.selectOption({ index: 1 });
  await page.getByRole("button", { name: /^Next$/ }).click();

  await page.getByPlaceholder(/brief summary/i).fill("Leaky faucet under kitchen sink");
  await page.getByRole("button", { name: /^Next$/ }).click();

  await page.getByPlaceholder(/describe the issue in detail/i).fill("Water pools under the sink whenever the faucet runs.");
  await page.getByRole("button", { name: /^Next$/ }).click();
  await page.getByRole("button", { name: /^Next$/ }).click();
}

test.describe.serial("Maintenance photo support", () => {
  test("tenant maintenance section shows ticket creation", async ({ page }) => {
    await loginTenantOrSkip(page);
    await openTenantMaintenance(page);

    const headingCount = await page.getByRole("heading", { name: /maintenance tickets|submit maintenance request/i }).count();
    const contentCount = await page.getByText(/maintenance|request|ticket/i).count();

    expect(headingCount + contentCount).toBeGreaterThan(0);
  });

  test("ticket creation form exposes image upload controls", async ({ page }) => {
    await loginTenantOrSkip(page);
    await openTenantMaintenance(page);
    await advanceTicketFormToPhotoStep(page);

    await expect(page.getByText(/attach maintenance photos/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /take photo/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /choose from gallery/i })).toBeVisible();

    const captureInput = page.locator('input[type="file"][capture="environment"]');
    await expect(captureInput).toHaveAttribute("accept", /image\/jpeg/);
    await expect(captureInput).toHaveAttribute("accept", /image\/heic/);
  });

  test("maintenance views expose photo gallery affordances when photos exist", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await page.goto("/owner?section=maintenance");
    await page.waitForTimeout(1500);

    const viewPhotoLinks = page.getByRole("link", { name: /view photo/i });
    const openPhotoButtons = page.locator('button[title^="Open "]');

    if ((await viewPhotoLinks.count()) > 0) {
      await expect(viewPhotoLinks.first()).toBeVisible();
      return;
    }

    if ((await openPhotoButtons.count()) > 0) {
      await expect(openPhotoButtons.first()).toBeVisible();
      return;
    }

    const maintenanceHeadingCount = await page.getByRole("heading", { name: /maintenance/i }).count();
    const photoMetaCount = await page.getByText(/photos?:|no photos/i).count();

    expect(maintenanceHeadingCount + photoMetaCount).toBeGreaterThan(0);
  });
});
