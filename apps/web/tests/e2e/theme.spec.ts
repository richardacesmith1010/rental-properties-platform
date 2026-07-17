import { expect, test } from "@playwright/test";

const legacyDarkPreference = ["noctis", "neon"].join("-");

test.describe("Theme switching", () => {
  test("default theme matches the device setting", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
  });

  test("legacy dark storage resolves to dark mode", async ({ page }) => {
    await page.addInitScript((theme) => {
      localStorage.setItem("domus-theme", theme);
    }, legacyDarkPreference);
    await page.goto("/login");

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("explicit dark mode persists across navigation", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("domus-theme", "dark");
    });
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.goto("/privacy");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
});
