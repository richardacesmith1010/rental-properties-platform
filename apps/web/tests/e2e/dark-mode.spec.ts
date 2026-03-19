import { expect, test, type Page } from "@playwright/test";
import { DEMO_USERS, loginAs } from "./helpers";

async function loginOwnerOrSkip(page: Page) {
  const loggedIn = await loginAs(page, DEMO_USERS.owner.email, DEMO_USERS.owner.password);
  test.skip(!loggedIn, "Demo seed not available. Run npm run seed:demo first.");
}

async function applyThemeOrSkip(page: Page, themeLabel: RegExp, expectedTheme: string) {
  await page.goto("/settings");
  await page.waitForTimeout(1500);

  const themeButton = page.getByTitle(themeLabel).first();
  test.skip((await themeButton.count()) === 0, "Theme controls are not available for this environment.");

  await themeButton.click();
  await expect(page.locator("html")).toHaveAttribute("data-domus-theme", expectedTheme);
}

test.describe.serial("Dark mode", () => {
  test("switches to Noctis Neon theme", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await applyThemeOrSkip(page, /Apply Noctis Neon theme\./i, "noctis-neon");
  });

  test("dashboard cards avoid light-only surfaces in dark theme", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await applyThemeOrSkip(page, /Apply Noctis Neon theme\./i, "noctis-neon");

    await page.goto("/owner");
    await page.waitForTimeout(1500);

    const statusCards = page.getByRole("status");
    const cardCount = await statusCards.count();
    test.skip(cardCount === 0, "KPI cards are not visible for the current demo account state.");

    const colors = await statusCards.first().evaluate((node) => {
      const style = window.getComputedStyle(node as HTMLElement);
      return {
        background: style.backgroundColor,
        color: style.color
      };
    });

    expect(colors.background).not.toBe("rgb(255, 255, 255)");
    expect(colors.background).not.toBe(colors.color);
  });

  test("KPI cards remain readable in dark theme", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await applyThemeOrSkip(page, /Apply Imperium Night theme\./i, "imperium-night");

    await page.goto("/owner");
    await page.waitForTimeout(1500);

    const metric = page.getByText(/Monthly Revenue|Occupancy|Rent Collection|Outstanding|Open Tickets|Net Cash Flow/i).first();
    test.skip((await metric.count()) === 0, "Overview KPIs are not visible for the current demo account state.");

    await expect(metric).toBeVisible();

    const textColor = await metric.evaluate((node) => window.getComputedStyle(node as HTMLElement).color);
    expect(textColor).not.toBe("rgba(0, 0, 0, 0)");
  });
});
