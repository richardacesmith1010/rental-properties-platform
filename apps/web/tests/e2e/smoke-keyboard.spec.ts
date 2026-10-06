import { expect, test, type Page } from "@playwright/test";
import { loginAsRole, missingSmokeEnv } from "./helpers";

async function expectFocusVisible(page: Page) {
  const focused = await page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    if (!element) return { label: "none", visible: false };
    const style = getComputedStyle(element);
    const className = element.className?.toString() ?? "";
    return {
      label: `${element.tagName}: ${element.textContent?.trim().slice(0, 40) ?? ""}`,
      visible: (style.outlineStyle !== "none" && style.outlineWidth !== "0px") ||
        style.boxShadow !== "none" || /focus-visible:(ring|outline)/.test(className)
    };
  });
  expect(focused.visible, `No visible focus on ${focused.label}`).toBe(true);
}

async function tabTo(page: Page, target: ReturnType<Page["getByRole"]>, maxTabs = 80) {
  for (let index = 0; index < maxTabs; index += 1) {
    await page.keyboard.press("Tab");
    await expectFocusVisible(page);
    if (await target.evaluate((element) => element === document.activeElement).catch(() => false)) return;
  }
  throw new Error(`Tab did not reach ${target.toString()}`);
}

test.describe("keyboard smoke", () => {
  test.skip(missingSmokeEnv().length > 0, `Missing smoke env: ${missingSmokeEnv().join(", ")}`);
  test.setTimeout(120_000);

  test("login order and Enter submit", async ({ page }) => {
    await page.goto("/login");
    await tabTo(page, page.getByRole("button", { name: /^Owner/ }));
    await tabTo(page, page.getByRole("button", { name: /^Manager/ }));
    await tabTo(page, page.getByRole("button", { name: /^Tenant/ }));
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Enter");
    await tabTo(page, page.getByLabel("Email"));
    await page.keyboard.type(process.env.SMOKE_OWNER_EMAIL!);
    await tabTo(page, page.getByLabel("Password"));
    await page.keyboard.type(process.env.SMOKE_OWNER_PASSWORD!);
    await tabTo(page, page.getByRole("button", { name: "Sign In" }));
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/owner(?:\?|$)/, { timeout: 45_000 });
  });

  test("owner nav, Add menu and manager sheet", async ({ page }) => {
    expect(await loginAsRole(page, "Owner", process.env.SMOKE_OWNER_EMAIL!, process.env.SMOKE_OWNER_PASSWORD!)).toBe(true);
    await expect(page.getByRole("main")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("ControlOrMeta+Home");
    await tabTo(page, page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Rent" }));
    await tabTo(page, page.getByRole("button", { name: "Add", exact: true }));
    await page.keyboard.press("Enter");
    const first = page.getByRole("menuitem", { name: "Add a home" });
    await expect(first).toBeFocused();
    await expectFocusVisible(page);
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "Add a unit" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Add", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "Add a manager" })).toBeFocused();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Add a manager" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(":focus")).toHaveCount(1);
    for (let index = 0; index < 12; index += 1) {
      await page.keyboard.press("Tab");
      await expect(dialog.locator(":focus")).toHaveCount(1);
      await expectFocusVisible(page);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "Add", exact: true })).toBeFocused();
  });

  test("tenant home actions", async ({ page }) => {
    expect(await loginAsRole(page, "Tenant", process.env.SMOKE_TENANT_EMAIL!, process.env.SMOKE_TENANT_PASSWORD!)).toBe(true);
    await expect(page.getByRole("main")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await tabTo(page, page.getByRole("link", { name: "Report a problem" }));
    await tabTo(page, page.getByRole("link", { name: "Message landlord" }));
  });
});
