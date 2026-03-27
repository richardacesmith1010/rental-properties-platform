import { expect, test } from "@playwright/test";
import { dismissOwnerOnboarding, loginAsRole } from "./helpers";
import { buildTestEmail, createTestUser, getAdminClient } from "./helpers/auth";
import { cleanupAllTestData, cleanupTestUser } from "./helpers/cleanup";
import { seedOwnerData, seedTenantLease } from "./helpers/seed";

const password = "TestPass123!";

test.describe.serial("Action center", () => {
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

  test("owner home shows actionable overdue rent cards", async ({ page }) => {
    const admin = getAdminClient();
    const ownerEmail = buildTestEmail("action-center-owner");
    const tenantEmail = buildTestEmail("action-center-tenant");

    const ownerUser = await createTestUser({
      email: ownerEmail,
      password,
      role: "owner",
      fullName: "E2E Action Owner"
    });
    const tenantUser = await createTestUser({
      email: tenantEmail,
      password,
      role: "tenant",
      fullName: "E2E Action Tenant"
    });

    createdUsers.push({ id: ownerUser.id, email: ownerEmail });
    createdUsers.push({ id: tenantUser.id, email: tenantEmail });

    const seededOwner = await seedOwnerData(ownerUser.id);
    const seededLease = await seedTenantLease({
      tenantUserId: tenantUser.id,
      unitId: seededOwner.unitId,
      propertyId: seededOwner.propertyId
    });

    const overdueDate = new Date();
    overdueDate.setDate(overdueDate.getDate() - 3);
    const { error: chargeError } = await admin
      .from("rent_charges")
      .update({ status: "late", due_date: overdueDate.toISOString().slice(0, 10) })
      .eq("id", seededLease.chargeId);

    if (chargeError) {
      throw new Error(`Failed to mark seeded charge late: ${chargeError.message}`);
    }

    const loggedIn = await loginAsRole(page, "Owner", ownerEmail, password);
    expect(loggedIn).toBeTruthy();

    await dismissOwnerOnboarding(page, ownerEmail);
    await page.goto(`/owner?account=${seededOwner.accountId}`);
    await page.waitForLoadState("networkidle").catch(() => {});

    await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
    await expect(page.getByText(/what needs attention/i)).toBeVisible();
    await expect(page.getByText(/rent is overdue/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Send Reminder", exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Waive", exact: true }).first()).toBeVisible();
  });
});
