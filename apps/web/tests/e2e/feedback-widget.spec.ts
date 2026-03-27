import { expect, test } from "@playwright/test";
import { dismissOwnerOnboarding, loginAsRole } from "./helpers";
import { buildTestEmail, createTestUser } from "./helpers/auth";
import { cleanupAllTestData, cleanupTestUser } from "./helpers/cleanup";
import { seedOwnerData } from "./helpers/seed";

const password = "TestPass123!";

test.describe.serial("Feedback widget", () => {
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

  test("dashboard feedback button opens and submits the feedback form", async ({ page }) => {
    const email = buildTestEmail("feedback-owner");
    const user = await createTestUser({ email, password, role: "owner", fullName: "E2E Feedback Owner" });
    createdUser = { id: user.id, email };
    await seedOwnerData(user.id);

    const loggedIn = await loginAsRole(page, "Owner", email, password);
    expect(loggedIn).toBeTruthy();

    await dismissOwnerOnboarding(page, email);
    await page.goto("/owner");
    await page.waitForLoadState("networkidle").catch(() => {});

    const trigger = page.getByRole("button", { name: /send feedback/i });
    await expect(trigger).toBeVisible();
    await trigger.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: /send feedback/i })).toBeVisible();
    await expect(dialog.getByLabel(/email \(optional\)/i)).toHaveValue(email);

    await dialog.getByLabel(/tell us what happened/i).fill("E2E feedback submission should succeed from the dashboard.");
    await dialog.getByRole("button", { name: /send feedback/i }).click();

    await expect(page.getByText(/thanks! we got your feedback/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
