import { expect, test, type Page } from "@playwright/test";
import { buildTestEmail, createTestUser } from "./helpers/auth";
import { cleanupAllTestData, cleanupTestUser } from "./helpers/cleanup";

const password = "TestPass123!";

async function openRoleLogin(page: Page, role: "Owner" | "Tenant") {
  await page.goto("/login");
  await page.getByRole("button", { name: role }).click();
}

test.describe.serial("Authentication", () => {
  const createdUsers: Array<{ id: string; email: string }> = [];

  test.afterEach(async () => {
    while (createdUsers.length > 0) {
      const user = createdUsers.pop();
      if (user) {
        await cleanupTestUser(user.id, user.email);
      }
    }
  });

  test.afterAll(async () => {
    await cleanupAllTestData().catch(() => {});
  });

  test("login page loads with Domus branding", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Domus")).toBeVisible();
    await expect(page.getByText("Choose your role to sign in or create an account.").first()).toBeVisible();
  });

  test("owner can sign in and reach owner setup", async ({ page }) => {
    const email = buildTestEmail("owner-auth");
    const user = await createTestUser({ email, password, role: "owner", fullName: "E2E Owner Auth" });
    createdUsers.push({ id: user.id, email });

    await openRoleLogin(page, "Owner");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page).toHaveURL(/\/owner\/setup/, { timeout: 10000 });
  });

  test("tenant can sign in and reach tenant dashboard", async ({ page }) => {
    const email = buildTestEmail("tenant-auth");
    const user = await createTestUser({ email, password, role: "tenant", fullName: "E2E Tenant Auth" });
    createdUsers.push({ id: user.id, email });

    await openRoleLogin(page, "Tenant");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page).toHaveURL(/\/tenant/, { timeout: 10000 });
    await expect(page.getByRole("heading", { name: "Tenant Workspace" })).toBeVisible();
  });

  test("unauthenticated user is redirected from protected routes", async ({ page }) => {
    await page.goto("/owner");
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });
});
