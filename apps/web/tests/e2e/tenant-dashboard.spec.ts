import { expect, test } from "@playwright/test";
import { buildTestEmail, createTestUser } from "./helpers/auth";
import { cleanupAllTestData, cleanupTestUser } from "./helpers/cleanup";
import { seedOwnerData, seedTenantLease } from "./helpers/seed";

const password = "TestPass123!";

test.describe.serial("Tenant dashboard", () => {
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

  test("tenant sees seeded charges and payment CTA", async ({ page }) => {
    const ownerEmail = buildTestEmail("tenant-dashboard-owner");
    const tenantEmail = buildTestEmail("tenant-dashboard-tenant");

    const ownerUser = await createTestUser({
      email: ownerEmail,
      password,
      role: "owner",
      fullName: "E2E Dashboard Owner"
    });
    const tenantUser = await createTestUser({
      email: tenantEmail,
      password,
      role: "tenant",
      fullName: "E2E Dashboard Tenant"
    });

    createdUsers.push({ id: ownerUser.id, email: ownerEmail });
    createdUsers.push({ id: tenantUser.id, email: tenantEmail });

    const seededOwner = await seedOwnerData(ownerUser.id);
    await seedTenantLease({
      tenantUserId: tenantUser.id,
      unitId: seededOwner.unitId,
      propertyId: seededOwner.propertyId
    });

    await page.goto("/login");
    await page.getByRole("button", { name: "Tenant" }).click();
    await page.getByLabel("Email").fill(tenantEmail);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page).toHaveURL(/\/tenant/, { timeout: 10000 });
    await page.goto("/tenant?section=charges");

    await expect(page.getByRole("heading", { name: "Rent Payments" })).toBeVisible();
    await expect(page.getByText(/E2E Test Property/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Pay with Card" })).toBeVisible();
  });
});
