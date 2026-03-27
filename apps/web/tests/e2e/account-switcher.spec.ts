import { expect, test } from "@playwright/test";
import { dismissOwnerOnboarding, loginAsRole } from "./helpers";
import { buildTestEmail, createTestUser } from "./helpers/auth";
import { cleanupAllTestData, cleanupTestUser } from "./helpers/cleanup";
import { seedOwnerData, seedOwnershipAccount } from "./helpers/seed";

const password = "TestPass123!";

test.describe.serial("Account switcher", () => {
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

  test("owner can switch accounts from the sidebar switcher", async ({ page }) => {
    const email = buildTestEmail("account-switcher-owner");
    const user = await createTestUser({ email, password, role: "owner", fullName: "E2E Switcher Owner" });
    createdUser = { id: user.id, email };

    const primary = await seedOwnerData(user.id);
    const secondary = await seedOwnershipAccount({
      userId: user.id,
      accountType: "llc",
      displayName: "E2E Backup LLC"
    });

    const loggedIn = await loginAsRole(page, "Owner", email, password);
    expect(loggedIn).toBeTruthy();

    await dismissOwnerOnboarding(page, email);
    await page.goto(`/owner?account=${primary.accountId}`);
    await page.waitForLoadState("networkidle").catch(() => {});

    const switcher = page.getByRole("button", { name: /switch ownership account/i });
    await expect(switcher).toBeVisible();
    await switcher.click();

    const listbox = page.getByRole("listbox", { name: /available ownership accounts/i });
    await expect(listbox).toBeVisible();
    await expect(listbox.getByRole("option", { name: /e2e backup llc/i })).toBeVisible();

    await listbox.getByRole("option", { name: /e2e backup llc/i }).click();
    await page.waitForURL(new RegExp(`[?&]account=${secondary.accountId}`));
    await expect(page.getByRole("button", { name: /switch ownership account/i })).toContainText("E2E Backup LLC");
  });
});
