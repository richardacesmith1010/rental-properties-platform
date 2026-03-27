import { expect, test } from "@playwright/test";
import { loginAsRole } from "./helpers";
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

  test("owner onboarding can create an individual account and reach the setup checklist", async ({ page }) => {
    const email = buildTestEmail("owner-setup");
    const user = await createTestUser({ email, password, role: "owner", fullName: "E2E Owner Setup" });
    createdUser = { id: user.id, email };

    const loggedIn = await loginAsRole(page, "Owner", email, password);
    expect(loggedIn).toBeTruthy();

    await expect(page).toHaveURL(/\/owner\/setup/, { timeout: 10000 });
    await expect(page.getByRole("heading", { name: /set up your ownership account/i })).toBeVisible();
    await page.getByRole("button", { name: /individual landlord/i }).click();

    await expect(page).toHaveURL(/\/owner/, { timeout: 15000 });
    await page.waitForLoadState("networkidle").catch(() => {});

    await expect(page.getByText(/owner setup/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: /welcome, e2e!/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /add your first property/i })).toBeVisible();
    await expect(page.getByText(/^2 of 6 complete$/).last()).toBeVisible();
    await expect(page.getByText(/account set up/i)).toBeVisible();
  });
});
