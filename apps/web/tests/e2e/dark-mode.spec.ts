import { expect, test, type Page } from "@playwright/test";
import { DEMO_USERS, dismissOwnerOnboarding, loginAs } from "./helpers";

async function loginOwnerOrSkip(page: Page) {
  const loggedIn = await loginAs(page, DEMO_USERS.owner.email, DEMO_USERS.owner.password);
  test.skip(!loggedIn, "Demo seed not available. Run npm run seed:demo first.");
}

async function applyTheme(page: Page, expectedTheme: string) {
  await page.addInitScript((theme) => {
    window.localStorage.setItem("domus-theme", theme);
  }, expectedTheme);

  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("data-theme", expectedTheme);
}

test.describe.serial("Dark mode", () => {
  test("switches to dark mode", async ({ page }) => {
    await applyTheme(page, "dark");
    await loginOwnerOrSkip(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("owner home avoids pure white surfaces in dark mode", async ({ page }) => {
    await applyTheme(page, "dark");
    await loginOwnerOrSkip(page);

    await dismissOwnerOnboarding(page, DEMO_USERS.owner.email);
    await page.goto("/owner");
    await page.waitForLoadState("networkidle").catch(() => {});

    const colors = await page.locator("main").evaluate((node) => {
      const style = window.getComputedStyle(node as HTMLElement);
      return {
        background: style.backgroundColor,
        color: style.color
      };
    });

    expect(colors.background).not.toBe("rgb(255, 255, 255)");
    expect(colors.background).not.toBe(colors.color);
  });

  test("home headings remain readable in dark mode", async ({ page }) => {
    await applyTheme(page, "dark");
    await loginOwnerOrSkip(page);

    await dismissOwnerOnboarding(page, DEMO_USERS.owner.email);
    await page.goto("/owner");
    await page.waitForLoadState("networkidle").catch(() => {});

    const heading = page.getByRole("heading", { name: /financial overview|home/i }).first();
    await expect(heading).toBeVisible();

    const textColor = await heading.evaluate((node) => window.getComputedStyle(node as HTMLElement).color);
    expect(textColor).not.toBe("rgba(0, 0, 0, 0)");
  });
});
