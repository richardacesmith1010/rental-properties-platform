import { expect, test, type Page } from "@playwright/test";
import { DEMO_USERS, loginAs } from "./helpers";

async function loginTenantOrSkip(page: Page) {
  const loggedIn = await loginAs(page, DEMO_USERS.tenant1.email, DEMO_USERS.tenant1.password);
  test.skip(!loggedIn, "Demo seed not available. Run npm run seed:demo first.");
}

test.describe("Tenant flows", () => {
  test("loads tenant dashboard welcome", async ({ page }) => {
    await loginTenantOrSkip(page);

    await expect(page.getByRole("heading", { name: /Welcome home/ })).toBeVisible();
    await expect(page.getByText("Riverside Apartments")).toBeVisible();
  });

  test("shows charges and payment history", async ({ page }) => {
    await loginTenantOrSkip(page);
    await page.goto("/tenant?section=charges");

    await expect(page.getByRole("heading", { name: "Rent Payments" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Payment History" })).toBeVisible();
    await expect(page.getByRole("link", { name: "View Receipt" }).first()).toBeVisible();
  });

  test("shows lease details", async ({ page }) => {
    await loginTenantOrSkip(page);
    await page.goto("/tenant?section=charges");

    await expect(page.getByRole("heading", { name: "My Lease" })).toBeVisible();
    await expect(page.getByText("Days Remaining")).toBeVisible();
    await expect(page.getByText("Monthly Rent")).toBeVisible();
  });

  test("shows maintenance request tracker", async ({ page }) => {
    await loginTenantOrSkip(page);
    await page.goto("/tenant?section=maintenance");
    await page.locator("summary").first().click();

    await expect(page.getByText("Repair Tracker").first()).toBeVisible();
    await expect(page.getByText("In Progress").first()).toBeVisible();
  });

  test("shows documents section", async ({ page }) => {
    await loginTenantOrSkip(page);
    await page.goto("/tenant?section=documents");

    await expect(page.getByRole("heading", { name: "Documents & Signatures" })).toBeVisible();
  });

  test("shows notifications section", async ({ page }) => {
    await loginTenantOrSkip(page);
    await page.goto("/tenant?section=notifications");

    await expect(page.getByRole("heading", { name: "Notifications" }).first()).toBeVisible();
    await expect(page.getByText("Payment received")).toBeVisible();
  });

  test("opens achievements page", async ({ page }) => {
    await loginTenantOrSkip(page);
    await page.goto("/achievements");

    await expect(page.getByRole("heading", { name: "Achievement gallery" })).toBeVisible();
    await expect(page.getByText(/achievements unlocked/i)).toBeVisible();
  });
});
