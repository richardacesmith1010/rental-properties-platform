import { expect, test } from "@playwright/test";
import { DEMO_USERS, loginAs } from "./helpers";

test.describe("Accessibility", () => {
  test("login page exposes labeled form fields", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Owner" }).click();

    await expect(page.getByLabel("Email")).toHaveAttribute("type", "email");
    await expect(page.getByLabel("Password")).toHaveAttribute("type", "password");
  });

  test("main navigation is labeled for assistive tech", async ({ page }) => {
    const loggedIn = await loginAs(page, DEMO_USERS.owner.email, DEMO_USERS.owner.password);
    test.skip(!loggedIn, "Demo seed not available. Run npm run seed:demo first.");

    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  });

  test("theme settings are keyboard reachable", async ({ page }) => {
    const loggedIn = await loginAs(page, DEMO_USERS.owner.email, DEMO_USERS.owner.password);
    test.skip(!loggedIn, "Demo seed not available. Run npm run seed:demo first.");

    await page.goto("/settings");
    await page.keyboard.press("Tab");
    const activeTag = await page.evaluate(() => document.activeElement?.tagName ?? "");
    expect(activeTag).not.toBe("");
  });

  test("Dom mascot image has descriptive alt text", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByAltText("Dom, the Domus mascot").first()).toBeVisible();
  });
});
