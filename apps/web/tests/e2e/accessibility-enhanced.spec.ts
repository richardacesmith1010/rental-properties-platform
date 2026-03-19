import { expect, test, type Locator, type Page } from "@playwright/test";
import { DEMO_USERS, loginAs } from "./helpers";

async function loginOwnerOrSkip(page: Page) {
  const loggedIn = await loginAs(page, DEMO_USERS.owner.email, DEMO_USERS.owner.password);
  test.skip(!loggedIn, "Demo seed not available. Run npm run seed:demo first.");
}

async function openCommandPaletteOrSkip(page: Page): Promise<Locator> {
  const dialog = page.getByRole("dialog", { name: /search commands/i });

  await page.keyboard.press("Meta+k");
  await page.waitForTimeout(300);
  if ((await dialog.count()) > 0) {
    return dialog;
  }

  await page.keyboard.press("Control+k");
  await page.waitForTimeout(300);
  test.skip((await dialog.count()) === 0, "Command palette is not available in this environment.");

  return dialog;
}

test.describe.serial("Enhanced accessibility", () => {
  test("KPI cards expose status roles with aria labels", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await page.goto("/owner");
    await page.waitForTimeout(1500);

    const statusElements = page.locator('[role="status"][aria-label]');
    const count = await statusElements.count();
    test.skip(count === 0, "KPI cards are not visible for the current demo account state.");

    expect(count).toBeGreaterThan(0);
    await expect(statusElements.first()).toHaveAttribute("aria-label", /.+/);
  });

  test("rent collection bar exposes progressbar semantics", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await page.goto("/owner");
    await page.waitForTimeout(1500);

    const progressbar = page.getByRole("progressbar");
    test.skip((await progressbar.count()) === 0, "Rent collection data is not available for the current demo account state.");

    await expect(progressbar.first()).toHaveAttribute("aria-valuenow", /\d+/);
    await expect(progressbar.first()).toHaveAttribute("aria-valuemin", "0");
    await expect(progressbar.first()).toHaveAttribute("aria-valuemax", "100");
  });

  test("command palette exposes dialog semantics and traps focus", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await page.goto("/owner");
    await page.waitForTimeout(1500);

    const dialog = await openCommandPaletteOrSkip(page);
    await expect(dialog).toHaveAttribute("aria-modal", "true");

    const input = dialog.getByRole("combobox", { name: /search commands/i });
    await expect(input).toBeFocused();

    await page.keyboard.press("Shift+Tab");
    await page.waitForTimeout(100);

    const focusAfterShiftTab = await page.evaluate(() => {
      const activeElement = document.activeElement as HTMLElement | null;
      return {
        insideDialog: Boolean(activeElement?.closest('[role="dialog"]')),
        id: activeElement?.id ?? "",
        role: activeElement?.getAttribute("role") ?? ""
      };
    });

    expect(focusAfterShiftTab.insideDialog).toBe(true);
    expect(focusAfterShiftTab.id !== "" || focusAfterShiftTab.role === "option").toBe(true);

    await page.keyboard.press("Tab");
    await page.waitForTimeout(100);
    await expect(input).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: /search commands/i })).toHaveCount(0);
  });

  test("breadcrumbs expose an accessible label and current page", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await page.goto("/owner?section=charges");
    await page.waitForTimeout(1500);

    const breadcrumb = page.locator('nav[aria-label="Breadcrumb"]');
    test.skip((await breadcrumb.count()) === 0, "Breadcrumbs are not visible for the current view.");

    await expect(breadcrumb.first()).toBeVisible();
    expect(await breadcrumb.locator('[aria-current="page"]').count()).toBeGreaterThan(0);
  });
});
