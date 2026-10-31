import { expect, type Page } from "@playwright/test";

export const DEMO_USERS = {
  owner: { email: "owner@demo.domus.com", password: "Demo123!" },
  manager: { email: "manager@demo.domus.com", password: "Demo123!" },
  tenant1: { email: "tenant1@demo.domus.com", password: "Demo123!" },
  tenant2: { email: "tenant2@demo.domus.com", password: "Demo123!" },
  tenant3: { email: "tenant3@demo.domus.com", password: "Demo123!" }
} as const;

function inferRoleLabel(email: string) {
  if (email.startsWith("owner@")) return "Owner";
  if (email.startsWith("manager@")) return "Manager";
  return "Tenant";
}

export function ownerOnboardingDismissKey(email: string) {
  return `domus-owner-onboarding-dismissed:${email.toLowerCase()}`;
}

export async function dismissOwnerOnboarding(page: Page, email: string) {
  await page.evaluate((storageKey) => {
    window.localStorage.setItem(storageKey, "true");
  }, ownerOnboardingDismissKey(email));
}

export async function loginAsRole(
  page: Page,
  _role: "Owner" | "Manager" | "Tenant",
  email: string,
  password: string
) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  const redirected = await page
    .waitForURL(/\/(owner|manager|tenant|onboarding|owner\/setup|agree)/, { timeout: 12_000 })
    .then(() => true)
    .catch(() => false);

  if (redirected && new URL(page.url()).pathname === "/agree") {
    await page.getByLabel("I am 18 or older. I agree to the Terms of Service.", { exact: true }).check();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.waitForURL(/\/(owner|manager|tenant|onboarding)/);
  }
  return redirected && !page.url().includes("/login");
}

export async function loginAs(page: Page, email: string, password: string) {
  return loginAsRole(page, inferRoleLabel(email), email, password);
}

export function collectConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    const lower = text.toLowerCase();
    const ignoredAnalyticsCspError =
      lower.includes("va.vercel-scripts.com/v1/script.debug.js") &&
      lower.includes("content security policy directive");

    if (message.type() === "error" && !lower.includes("favicon") && !ignoredAnalyticsCspError) {
      errors.push(message.text());
    }
  });
  return errors;
}

export function expectNoConsoleErrors(errors: string[]) {
  expect(errors, errors.join("\n")).toEqual([]);
}

export const REQUIRED_SMOKE_ENV = [
  "APP_URL", "SMOKE_OWNER_EMAIL", "SMOKE_OWNER_PASSWORD", "SMOKE_MANAGER_EMAIL",
  "SMOKE_MANAGER_PASSWORD", "SMOKE_TENANT_EMAIL", "SMOKE_TENANT_PASSWORD"
] as const;

export function missingSmokeEnv() {
  return REQUIRED_SMOKE_ENV.filter((name) => !process.env[name]?.trim());
}

export async function openManagerSheet(page: Page) {
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Add a manager" }).click();
  await expect(page.getByRole("dialog", { name: "Add a manager" })).toBeVisible();
}
