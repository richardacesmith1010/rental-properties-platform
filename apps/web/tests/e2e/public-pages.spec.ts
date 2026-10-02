import { expect, test } from "@playwright/test";

test.describe("Public pages", () => {
  test("marketing page loads with Domus branding", async ({ page }) => {
    await page.goto("/marketing");

    await expect(page.getByText("Domus").first()).toBeVisible();
  });

  test("landing page shows honest product copy", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Rent, repairs, and leases. All in one place." })).toBeVisible();
    await expect(page.getByText("Free while Domus is in early access. No credit card.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "What Domus does" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Questions" })).toBeVisible();
  });

  test("privacy and terms pages load", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();

    await page.goto("/terms");
    await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();
  });
});
