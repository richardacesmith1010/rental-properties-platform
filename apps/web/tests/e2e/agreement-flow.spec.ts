import { expect, test, type Page } from "@playwright/test";

const names = ["OWNER_EMAIL", "OWNER_PASSWORD", "TENANT_EMAIL", "TENANT_PASSWORD", "SIGNUP_EMAIL", "SIGNUP_PASSWORD"] as const;
const required = names.map((name) => `AGREEMENT_E2E_${name}`);
const missingMessage = "Set AGREEMENT_E2E_* (scripts/agreement-e2e-accounts.mjs create)";
const phase = process.env.AGREEMENT_E2E_PHASE;
const boxLabel = "I am 18 or older. I agree to the Terms of Service.";
function env(name: typeof names[number]) { return process.env[`AGREEMENT_E2E_${name}`]!; }
test.beforeAll("E0 requires fresh account variables", () => {
  if (required.some((name) => !process.env[name]?.trim()) || !process.env.APP_URL) throw new Error(missingMessage);
  if (phase !== "signup" && phase !== "after-confirm") throw new Error("Set AGREEMENT_E2E_PHASE=signup or after-confirm");
});
async function signIn(page: Page, who: "OWNER" | "TENANT" | "SIGNUP") {
  await page.goto(`${process.env.APP_URL}/login`);
  await page.getByLabel("Email", { exact: true }).fill(env(`${who}_EMAIL`));
  await page.getByLabel("Password", { exact: true }).fill(env(`${who}_PASSWORD`));
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/(agree|onboarding|owner|tenant)(?:[/?#]|$)/);
}

test("E2E-S1 form registration with forged role, then confirmed sign-in without /agree", async ({ page }) => {
  if (phase === "signup") {
    await page.goto(`${process.env.APP_URL}/login?mode=signup`);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByLabel("Email", { exact: true }).fill(env("SIGNUP_EMAIL"));
    await page.getByLabel("Password", { exact: true }).fill(env("SIGNUP_PASSWORD"));
    await page.getByLabel("Confirm password", { exact: true }).fill(env("SIGNUP_PASSWORD"));
    await page.getByLabel(boxLabel, { exact: true }).check();
    const role = page.locator('input[type="hidden"][name="role"]');
    await role.evaluate((input: HTMLInputElement) => { input.value = "admin"; });
    await expect(role).toHaveValue("admin");
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(page.getByText("Check your email", { exact: true })).toBeVisible();
  } else {
    const visits: string[] = [];
    page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) visits.push(frame.url()); });
    await signIn(page, "SIGNUP");
    await expect(page).toHaveURL(/\/(onboarding|owner)(?:[/?#]|$)/);
    expect(visits.some((url) => new URL(url).pathname === "/agree")).toBe(false);
  }
});
test("E2E-R1,A1,B1,C1,M1 recovery, API gate, Back bar, console and 375px layout", async ({ page }) => {
  test.skip(phase === "signup", "Recovery runs after the operator confirms the form registration.");
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, "OWNER");
  await expect(page).toHaveURL(/\/agree/);
  const before = await page.request.get(`${process.env.APP_URL}/api/owner/section-data?section=daily-ops-home`);
  expect(before.status()).toBe(403);
  expect(await before.json()).toEqual({ error: "Please agree to the Terms first." });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Check the box to agree first.");
  await expect(page.getByLabel(boxLabel)).toBeFocused();
  await page.getByRole("button", { name: "Read the Terms", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Terms of Service", exact: true });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("button", { name: "Read the Terms", exact: true })).toBeFocused();
  const previous = page.url();
  await page.goto(`${process.env.APP_URL}/terms`, { referer: previous });
  await page.getByRole("button", { name: "‹ Back", exact: true }).click();
  await expect(page).toHaveURL(previous);
  await page.getByLabel(boxLabel).check();
  const continueButton = page.getByRole("button", { name: "Continue", exact: true });
  await continueButton.scrollIntoViewIfNeeded();
  await expect(page.getByLabel(boxLabel)).toBeVisible(); await expect(continueButton).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await continueButton.click();
  await expect(page).toHaveURL(/\/(onboarding|owner)(?:[/?#]|$)/);
  const after = await page.request.get(`${process.env.APP_URL}/api/owner/section-data?section=daily-ops-home`);
  expect(after.status()).toBe(200);
  await page.context().clearCookies(); await signIn(page, "OWNER");
  await expect(page).toHaveURL(/\/(onboarding|owner)(?:[/?#]|$)/);
  expect(errors).toEqual([]);
});
test("E2E-T1 tenant can download, request deletion and sign out without agreeing", async ({ page }) => {
  test.skip(phase === "signup", "Tenant checks run in the after-confirm phase.");
  await signIn(page, "TENANT"); await expect(page).toHaveURL(/\/agree/);
  await expect(page.getByText("Our Terms do not change your lease.", { exact: true })).toBeVisible();
  await page.getByText("Don't want to agree?", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Download my data", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete my account", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).not.toHaveURL(/\/agree/);
  await page.goto(`${process.env.APP_URL}/tenant`); await expect(page).toHaveURL(/\/login/);
});
