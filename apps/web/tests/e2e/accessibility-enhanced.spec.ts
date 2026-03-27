import { expect, test, type Locator, type Page } from "@playwright/test";
import { DEMO_USERS, dismissOwnerOnboarding, loginAs } from "./helpers";

async function loginOwnerOrSkip(page: Page) {
  const loggedIn = await loginAs(page, DEMO_USERS.owner.email, DEMO_USERS.owner.password);
  test.skip(!loggedIn, "Demo seed not available. Run npm run seed:demo first.");
}

async function openOwnerHome(page: Page) {
  await dismissOwnerOnboarding(page, DEMO_USERS.owner.email);
  await page.goto("/owner");
  await page.waitForLoadState("networkidle").catch(() => {});
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
  test("home pagination controls expose accessible labels", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await openOwnerHome(page);

    await expect(page.getByRole("button", { name: "Previous section" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Next section" })).toBeVisible();
    await expect(page.getByRole("button", { name: /open notifications/i }).first()).toBeVisible();
  });

  test("financial overview toggle exposes labeled controls", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await openOwnerHome(page);

    await expect(page.getByRole("heading", { name: /financial overview/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Bank", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Domus", exact: true })).toBeVisible();
  });

  test("command palette exposes dialog semantics and traps focus", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await openOwnerHome(page);

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

  test("section pages expose the current page heading", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await dismissOwnerOnboarding(page, DEMO_USERS.owner.email);
    await page.goto("/owner?section=charges");
    await page.waitForLoadState("networkidle").catch(() => {});

    await expect(page.getByRole("heading", { name: "Charges", exact: true })).toBeVisible();
    await expect(page.getByText(/\d+ of \d+/i).first()).toBeVisible();
  });
});
