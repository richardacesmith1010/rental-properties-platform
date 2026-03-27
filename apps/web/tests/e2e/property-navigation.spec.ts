import { expect, test, type Page } from "@playwright/test";
import { DEMO_USERS, dismissOwnerOnboarding, loginAs } from "./helpers";

async function loginOwnerOrSkip(page: Page) {
  const loggedIn = await loginAs(page, DEMO_USERS.owner.email, DEMO_USERS.owner.password);
  test.skip(!loggedIn, "Demo seed not available. Run npm run seed:demo first.");
}

async function openOwnerSection(page: Page, section: string) {
  await dismissOwnerOnboarding(page, DEMO_USERS.owner.email);
  await page.goto(`/owner?section=${section}`);
  await page.waitForLoadState("networkidle").catch(() => {});
}

test.describe("Property navigation", () => {
  test("property scope selector renders on charges", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await openOwnerSection(page, "charges");

    const selector = page.getByRole("combobox", { name: /property scope/i });
    await expect(page.getByText("Property Scope", { exact: true })).toBeVisible();
    await expect(selector).toBeVisible();
    await expect(selector.locator('option[value=""]')).toHaveCount(1);
  });

  test("section header reflects page navigation", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await openOwnerSection(page, "charges");

    await expect(page.getByRole("heading", { name: "Charges", exact: true })).toBeVisible();
    await expect(page.getByText(/\d+ of \d+/i).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /upcoming \/ late charges/i })).toBeVisible();
  });

  test("portfolio drill-down scopes the dashboard by property", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await dismissOwnerOnboarding(page, DEMO_USERS.owner.email);
    await page.goto("/owner?section=portfolio");
    await page.waitForLoadState("networkidle").catch(() => {});

    const emptyState = page.getByText(/no properties yet/i);
    if (await emptyState.count()) {
      await expect(emptyState.first()).toBeVisible();
      return;
    }

    const propertyCard = page.locator('[title^="Open the dashboard filtered to "]').first();
    const propertyTitle = (await propertyCard.getAttribute("title")) ?? "";
    const propertyName = propertyTitle.replace(/^Open the dashboard filtered to\s+/, "").replace(/\.$/, "");

    await expect(propertyCard).toBeVisible();
    await propertyCard.click();
    await page.waitForFunction(() => new URL(window.location.href).searchParams.has("property"));
    await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();

    const selector = page.getByRole("combobox", { name: /property scope/i });
    await expect(selector).toBeVisible();
    await expect(selector.locator("option:checked")).toContainText(propertyName);
  });
});
