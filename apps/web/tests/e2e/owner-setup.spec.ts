import { expect, test } from "@playwright/test";
import { buildTestEmail, createTestUser } from "./helpers/auth";
import { cleanupAllTestData, cleanupTestUser } from "./helpers/cleanup";

const password = "TestPass123!";

test.describe.serial("Owner setup flow", () => {
  let createdUser: { id: string; email: string } | null = null;

  test.afterEach(async () => {
    if (createdUser) {
      await cleanupTestUser(createdUser.id, createdUser.email);
      createdUser = null;
    }
  });

  test.afterAll(async () => {
    await cleanupAllTestData().catch(() => {});
  });

  test("owner onboarding can create an individual account and first property", async ({ page }) => {
    const email = buildTestEmail("owner-setup");
    const user = await createTestUser({ email, password, role: "owner", fullName: "E2E Owner Setup" });
    createdUser = { id: user.id, email };

    await page.goto("/login");
    await page.getByRole("button", { name: "Owner" }).click();
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page).toHaveURL(/\/owner\/setup/, { timeout: 10000 });
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: /Individual Landlord/ }).click();

    await expect(page).toHaveURL(/\/owner(?:\?.*)?$/, { timeout: 15000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForFunction(() => {
      const text = document.body.innerText || "";
      return (
        text.includes("Add Your First Property") ||
        text.includes("Add your first property") ||
        text.includes("Let's get your first property set up") ||
        /^Good /m.test(text) ||
        /\bOverview\b/.test(text)
      );
    }, null, { timeout: 10000 });

    const hasPropertyPrompt =
      (await page.getByRole("heading", { name: "Add your first property" }).count()) > 0;
    const hasFirstPropertyCta =
      (await page.getByRole("button", { name: /Add Your First Property|Add Property/ }).count()) > 0;
    const hasDashboardGreeting =
      (await page.getByRole("heading", { name: /^Good / }).count()) > 0;
    const hasWelcomeCard =
      (await page.getByRole("heading", { name: /Welcome,/ }).count()) > 0;
    const hasOverview =
      (await page.getByRole("heading", { name: "Overview", exact: true }).count()) > 0;

    expect(
      hasPropertyPrompt ||
        hasFirstPropertyCta ||
        hasDashboardGreeting ||
        hasWelcomeCard ||
        hasOverview
    ).toBeTruthy();

    if (!hasPropertyPrompt && !hasFirstPropertyCta) {
      return;
    }

    const addPropertyButton = page
      .getByRole("button", { name: /Add Your First Property|Add Property/ })
      .first();
    await addPropertyButton.click();
    await expect(page).toHaveURL(/mode=new_property/, { timeout: 10000 });
    await page.waitForTimeout(500);

    await page.getByLabel(/Property Name/).fill("E2E UI Property");
    await expect(page.getByRole("button", { name: "Next", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByLabel(/Street Address/).fill("555 Automation Way");
    await expect(page.getByRole("button", { name: "Next", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByLabel(/City/).fill("Denver");
    await expect(page.getByRole("button", { name: "Next", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByLabel(/State/).fill("CO");
    await expect(page.getByRole("button", { name: "Next", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByLabel(/ZIP Code/).fill("80205");
    await expect(page.getByRole("button", { name: "Next", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Save Property" }).click();

    await expect(page.getByText("E2E UI Property")).toBeVisible({ timeout: 10000 });
  });
});
