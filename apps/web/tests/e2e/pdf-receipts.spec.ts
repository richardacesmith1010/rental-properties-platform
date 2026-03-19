import { expect, test, type Page } from "@playwright/test";
import { DEMO_USERS, loginAs } from "./helpers";

async function loginTenantOrSkip(page: Page) {
  const loggedIn = await loginAs(page, DEMO_USERS.tenant1.email, DEMO_USERS.tenant1.password);
  test.skip(!loggedIn, "Demo seed not available. Run npm run seed:demo first.");
}

async function getReceiptChargeIdOrSkip(page: Page) {
  await page.goto("/tenant?section=charges");
  await page.waitForTimeout(1500);

  const receiptLink = page.getByRole("link", { name: /view receipt/i }).first();
  test.skip((await receiptLink.count()) === 0, "No paid receipts are available for the current demo tenant.");

  const href = await receiptLink.getAttribute("href");
  const chargeId = href?.match(/\/payments\/receipt\/([^/?#]+)/)?.[1] ?? null;
  test.skip(!chargeId, "Unable to derive a charge id from the receipt link.");

  return chargeId;
}

test.describe.serial("PDF receipt generation", () => {
  test("receipt page has a download PDF option", async ({ page }) => {
    await loginTenantOrSkip(page);
    const chargeId = await getReceiptChargeIdOrSkip(page);

    await page.goto(`/payments/receipt/${chargeId}`);
    await page.waitForTimeout(1500);

    await expect(page.getByRole("link", { name: /download pdf/i })).toBeVisible();
  });

  test("receipt PDF route rejects unauthenticated requests", async ({ request }) => {
    const response = await request.get("/api/pdf/receipt/nonexistent-id");
    expect([401, 302, 307]).toContain(response.status());
  });

  test("receipt PDF route returns a PDF for authenticated users", async ({ page }) => {
    await loginTenantOrSkip(page);
    const chargeId = await getReceiptChargeIdOrSkip(page);

    const response = await page.context().request.get(`/api/pdf/receipt/${chargeId}`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/pdf");
  });
});
