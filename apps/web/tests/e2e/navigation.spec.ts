import { expect, test } from "@playwright/test";
import { dismissOwnerOnboarding, loginAsRole } from "./helpers";
import { buildTestEmail, createTestUser } from "./helpers/auth";
import { cleanupAllTestData, cleanupTestUser } from "./helpers/cleanup";
import { seedOwnerData } from "./helpers/seed";

const password = "TestPass123!";

test.describe.serial("Owner navigation", () => {
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

  test("owner can open the property wizard and move page-by-page", async ({ page }) => {
    const email = buildTestEmail("owner-navigation");
    const user = await createTestUser({ email, password, role: "owner", fullName: "E2E Navigation Owner" });
    createdUser = { id: user.id, email };
    await seedOwnerData(user.id);

    const loggedIn = await loginAsRole(page, "Owner", email, password);
    expect(loggedIn).toBeTruthy();

    await dismissOwnerOnboarding(page, email);
    await page.goto("/owner");
    await page.waitForLoadState("networkidle").catch(() => {});

    await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();

    await page.getByRole("button", { name: /^New Property$/ }).click();
    const wizard = page.getByRole("dialog");
    await expect(wizard.getByText(/set up the property, units, lease, and tenant in one flow/i)).toBeVisible();
    await wizard.getByRole("button", { name: "Close", exact: true }).click();
    await expect(wizard).toHaveCount(0);

    await page.getByRole("button", { name: "Next section" }).click();
    await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Next section" }).click();
    await expect(page.getByRole("heading", { name: "Charges", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Previous section" }).click();
    await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  });
});
