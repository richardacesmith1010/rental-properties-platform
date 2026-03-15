import { expect, test } from "@playwright/test";

test.describe("Public pages", () => {
  test("marketing page loads with Domus branding", async ({ page }) => {
    await page.goto("/marketing");

    await expect(page.getByText("Domus").first()).toBeVisible();
  });

  test("privacy and terms pages load", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();

    await page.goto("/terms");
    await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();
  });
});
