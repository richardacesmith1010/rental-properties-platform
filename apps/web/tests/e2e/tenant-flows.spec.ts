import { expect, test, type Page } from "@playwright/test";
import { DEMO_USERS, loginAs } from "./helpers";

async function loginTenantOrSkip(page: Page) {
  const loggedIn = await loginAs(page, DEMO_USERS.tenant1.email, DEMO_USERS.tenant1.password);
  test.skip(!loggedIn, "Demo seed not available. Run npm run seed:demo first.");
}

test.describe("Tenant flows", () => {
  test("loads the tenant dashboard home", async ({ page }) => {
    await loginTenantOrSkip(page);

    await expect(page.getByRole("heading", { name: "Tenant Portal" })).toBeVisible();
    await expect(page.getByText(/good (morning|afternoon|evening),/i).first()).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /no payments due right now|your rent|rent paid!/i }).first()
    ).toBeVisible();
  });

  test("shows rent payments and payment history", async ({ page }) => {
    await loginTenantOrSkip(page);
    await page.goto("/tenant?section=charges");

    await expect(page.getByRole("heading", { name: "Payment History", level: 2 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Rent Payments" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Payment History", level: 3 })).toBeVisible();

    const paymentStateVisible =
      (await page.getByRole("link", { name: /view receipt/i }).count()) > 0 ||
      (await page.getByText(/no payments yet/i).count()) > 0;
    expect(paymentStateVisible).toBeTruthy();
  });

  test("shows lease details or the lease empty state", async ({ page }) => {
    await loginTenantOrSkip(page);
    await page.goto("/tenant?section=charges");

    await expect(page.getByRole("heading", { name: "My Lease" })).toBeVisible();
    const leaseDetailsVisible =
      (await page.getByText(/days remaining|monthly rent/i).count()) > 0 ||
      (await page.getByText(/no active lease/i).count()) > 0;
    expect(leaseDetailsVisible).toBeTruthy();
  });

  test("shows the simplified maintenance experience", async ({ page }) => {
    await loginTenantOrSkip(page);
    await page.goto("/tenant?section=maintenance");

    await expect(page.getByRole("heading", { name: "Problems", level: 2 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Report a Problem" })).toBeVisible();
    await expect(page.getByLabel("What's the problem?")).toBeVisible();
    await expect(page.getByRole("button", { name: /take photo|choose from gallery/i }).first()).toBeVisible();
  });

  test("shows documents section", async ({ page }) => {
    await loginTenantOrSkip(page);
    await page.goto("/tenant?section=documents");

    await expect(page.getByRole("heading", { name: "Documents & Signatures" })).toBeVisible();
  });

  test("shows messages section", async ({ page }) => {
    await loginTenantOrSkip(page);
    await page.goto("/tenant?section=notifications");

    await expect(page.getByRole("heading", { name: "Messages" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /domus inbox/i })).toBeVisible();
    await expect(page.getByText(/payment received|maintenance request resolved/i).first()).toBeVisible();
  });

  test("opens achievements page", async ({ page }) => {
    await loginTenantOrSkip(page);
    await page.goto("/achievements");

    await expect(page.getByRole("heading", { name: "Achievement gallery" })).toBeVisible();
    await expect(page.getByText(/achievements unlocked/i)).toBeVisible();
  });
});
