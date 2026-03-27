import { expect, test } from "@playwright/test";
import { dismissOwnerOnboarding, loginAsRole } from "./helpers";
import { buildTestEmail, createTestUser } from "./helpers/auth";
import { cleanupAllTestData, cleanupTestUser } from "./helpers/cleanup";
import { seedOwnershipAccount } from "./helpers/seed";

const password = "TestPass123!";

test.describe.serial("LLC members page", () => {
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

  test("LLC owners can open the members page and see the invite form", async ({ page }) => {
    const email = buildTestEmail("llc-members-owner");
    const user = await createTestUser({ email, password, role: "owner", fullName: "E2E LLC Owner" });
    createdUser = { id: user.id, email };

    const llcAccount = await seedOwnershipAccount({
      userId: user.id,
      accountType: "llc",
      displayName: "E2E Family LLC"
    });

    const loggedIn = await loginAsRole(page, "Owner", email, password);
    expect(loggedIn).toBeTruthy();

    await dismissOwnerOnboarding(page, email);
    await page.goto(`/owner?account=${llcAccount.accountId}&section=members`);
    await page.waitForLoadState("networkidle").catch(() => {});

    await expect(page.getByRole("heading", { name: "Members", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Invite Members" })).toBeVisible();
    await expect(page.getByLabel(/email addresses \(one per line or comma-separated\)/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /send invitations/i })).toBeVisible();

    await expect(page.getByRole("heading", { name: "Current Members" })).toBeVisible();
    const membersSection = page.locator("#members");
    await expect(membersSection.getByText(email, { exact: true })).toBeVisible();
    await expect(membersSection.getByText(/^You$/)).toBeVisible();
    await expect(membersSection.getByText(/how should rent money be split/i)).toBeVisible();
  });
});
