import { expect, test } from "@playwright/test";
import { buildTestEmail, createTestUser } from "./helpers/auth";
import { cleanupAllTestData, cleanupTestUser } from "./helpers/cleanup";
import { loginAsRole } from "./helpers";

const password = "TestPass123!";

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
    await expect(page.getByRole("heading", { name: /sign in to your workspace/i })).toBeVisible();
    await expect(page.getByText(/choose your role, then sign in or create your account/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /owner/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /tenant/i })).toBeVisible();
  });

  test("owner can sign in and reach owner setup", async ({ page }) => {
    const email = buildTestEmail("owner-auth");
    const user = await createTestUser({ email, password, role: "owner", fullName: "E2E Owner Auth" });
    createdUsers.push({ id: user.id, email });

    const loggedIn = await loginAsRole(page, "Owner", email, password);
    expect(loggedIn).toBeTruthy();
    await expect(page).toHaveURL(/\/owner(\/setup)?/, { timeout: 10000 });
    await expect(page.getByRole("heading", { name: /set up your ownership account/i })).toBeVisible();
  });

  test("tenant can sign in and reach tenant dashboard", async ({ page }) => {
    const email = buildTestEmail("tenant-auth");
    const user = await createTestUser({ email, password, role: "tenant", fullName: "E2E Tenant Auth" });
    createdUsers.push({ id: user.id, email });

    const loggedIn = await loginAsRole(page, "Tenant", email, password);
    expect(loggedIn).toBeTruthy();

    await expect(page).toHaveURL(/\/tenant/, { timeout: 10000 });
    await expect(page.getByText(/good (morning|afternoon|evening),/i)).toBeVisible();
    const rentVisible =
      (await page.getByRole("heading", { name: /your rent|rent paid!/i }).count()) > 0 ||
      (await page.getByText(/rent due|no payments due right now/i).count()) > 0;
    expect(rentVisible).toBeTruthy();
  });

  test("unauthenticated user is redirected from protected routes", async ({ page }) => {
    await page.goto("/owner");
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });
});
