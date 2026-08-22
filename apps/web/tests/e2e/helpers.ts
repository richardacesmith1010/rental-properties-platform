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
  role: "Owner" | "Manager" | "Tenant",
  email: string,
  password: string
) {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp("^" + role) }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();

  const redirected = await page
    .waitForURL(/\/(owner|manager|tenant|onboarding|owner\/setup)/, { timeout: 12_000 })
    .then(() => true)
    .catch(() => false);

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
