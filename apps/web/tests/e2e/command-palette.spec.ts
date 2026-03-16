import { expect, test, type Page } from "@playwright/test";
import { DEMO_USERS, loginAs } from "./helpers";

async function loginOwnerOrSkip(page: Page) {
  const loggedIn = await loginAs(page, DEMO_USERS.owner.email, DEMO_USERS.owner.password);
  test.skip(!loggedIn, "Demo seed not available. Run npm run seed:demo first.");
}

async function openCommandPalette(page: Page) {
  const dialog = page.getByRole("dialog", { name: /command palette/i });

  await page.keyboard.press("Meta+k");
  await page.waitForTimeout(300);
  if (await dialog.count()) {
    return dialog;
  }

  await page.keyboard.press("Control+k");
  await page.waitForTimeout(300);
  return dialog;
}

test.describe("Command palette", () => {
  test("Cmd+K or Ctrl+K opens command palette", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await page.goto("/owner");
    await page.waitForTimeout(1500);

    const dialog = await openCommandPalette(page);
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByPlaceholder(/search sections, properties, tenants, and transactions/i)
    ).toBeVisible();
  });

  test("command palette filters results on search", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await page.goto("/owner");
    await page.waitForTimeout(1500);

    const dialog = await openCommandPalette(page);
    await expect(dialog).toBeVisible();

    const input = dialog.getByPlaceholder(/search sections, properties, tenants, and transactions/i);
    await input.fill("charges");
    await page.waitForTimeout(300);

    await expect(dialog.getByText("Sections", { exact: true })).toBeVisible();
    await expect(dialog.getByText(/charges/i).first()).toBeVisible();
  });

  test("Escape closes command palette", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await page.goto("/owner");
    await page.waitForTimeout(1500);

    const dialog = await openCommandPalette(page);
    await expect(dialog).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: /command palette/i })).toHaveCount(0);
  });
});
