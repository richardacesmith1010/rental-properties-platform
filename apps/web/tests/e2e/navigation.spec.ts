import { expect, test } from "@playwright/test";
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

  test("owner can switch workflow modes and move section-by-section", async ({ page }) => {
    const email = buildTestEmail("owner-navigation");
    const user = await createTestUser({ email, password, role: "owner", fullName: "E2E Navigation Owner" });
    createdUser = { id: user.id, email };
    await seedOwnerData(user.id);

    await page.goto("/login");
    await page.getByRole("button", { name: "Owner" }).click();
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page).toHaveURL(/\/owner/, { timeout: 10000 });
    await expect(page.getByText("Daily Operations Mode")).toBeVisible();

    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "New Property" }).click();
    await expect(page.getByText("New Property Mode")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

    await page.getByRole("button", { name: "Next section" }).click();
    await expect(page.getByRole("heading", { name: "Operations" })).toBeVisible();

    await page.getByRole("button", { name: "Previous section" }).click();
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  });
});
