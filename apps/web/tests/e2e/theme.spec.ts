import { expect, test } from "@playwright/test";

test.describe("Theme switching", () => {
  test("default theme is atlas-light", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("html")).not.toHaveAttribute("data-domus-theme", /.+/);
  });

  test("noctis-neon theme applies from localStorage", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("domus-theme", "noctis-neon");
    });
    await page.goto("/login");

    await expect(page.locator("html")).toHaveAttribute("data-domus-theme", "noctis-neon");
  });

  test("imperium-night persists across navigation", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("domus-theme", "imperium-night");
    });
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("data-domus-theme", "imperium-night");

    await page.goto("/privacy");
    await expect(page.locator("html")).toHaveAttribute("data-domus-theme", "imperium-night");
  });
});
