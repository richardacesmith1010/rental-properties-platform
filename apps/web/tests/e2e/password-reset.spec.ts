import { expect, test } from "@playwright/test";

test.describe("Password reset flow", () => {
  test("login form shows forgot password link in signin mode", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Owner" }).click();

    await expect(page.getByRole("button", { name: "Forgot password?" })).toBeVisible();
  });

  test("forgot password form submits and shows success message", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Owner" }).click();
    await page.getByRole("button", { name: "Forgot password?" }).click();

    await expect(page.getByText("Reset your password")).toBeVisible();
    await page.getByLabel("Email").fill("test-reset@example.com");
    await page.getByRole("button", { name: "Send Reset Link" }).click();

    await expect(page.getByText("Check your email")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/password reset link has been sent/i)).toBeVisible();
  });

  test("login page shows password reset success banner", async ({ page }) => {
    await page.goto("/login?password_reset=true");

    await expect(page.getByText("Password updated!")).toBeVisible();
    await expect(page.getByText("Sign in below with your new password.")).toBeVisible();
  });
});
