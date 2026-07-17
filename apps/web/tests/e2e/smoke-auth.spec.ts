import { expect, test, type Page } from "@playwright/test";
import { loginAsRole } from "./helpers";

const REQUIRED_ENV_NAMES = [
  "APP_URL",
  "SMOKE_OWNER_EMAIL",
  "SMOKE_OWNER_PASSWORD",
  "SMOKE_MANAGER_EMAIL",
  "SMOKE_MANAGER_PASSWORD",
  "SMOKE_TENANT_EMAIL",
  "SMOKE_TENANT_PASSWORD"
] as const;

type SmokeScenario = {
  name: string;
  role: "Owner" | "Manager" | "Tenant";
  email: string;
  password: string;
  pathPattern: RegExp;
  navRole: "button" | "link";
  navLabel: string;
};

function getMissingEnvNames() {
  return REQUIRED_ENV_NAMES.filter((name) => !process.env[name]?.trim());
}

function collectRenderErrors(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (message) => {
    if (message.type() !== "error") {
      return;
    }

    const text = message.text();
    const lower = text.toLowerCase();
    const ignoredFaviconNoise = lower.includes("favicon");
    // Vercel Analytics debug script can throw a CSP console error on locked-down hosts without impacting app render.
    const ignoredVercelAnalyticsCspNoise =
      lower.includes("va.vercel-scripts.com/v1/script.debug.js") &&
      lower.includes("content security policy directive");

    if (!ignoredFaviconNoise && !ignoredVercelAnalyticsCspNoise) {
      consoleErrors.push(text);
    }
  });

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  return { consoleErrors, pageErrors };
}

async function assertRoleHomeRendered(page: Page, scenario: SmokeScenario) {
  const navigation = page.getByRole("navigation", { name: "Main navigation" });

  await expect(page).toHaveURL(scenario.pathPattern, { timeout: 45_000 });
  await expect(navigation).toBeVisible({ timeout: 30_000 });
  await expect(navigation.getByRole(scenario.navRole, { name: scenario.navLabel })).toBeVisible({
    timeout: 15_000,
  });
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  await expect(page.locator("body")).not.toContainText(/application error|something went wrong/i);
}

test.describe("authenticated smoke render", () => {
  test.describe.configure({ retries: 0 });

  const missingEnvNames = getMissingEnvNames();
  test.skip(
    missingEnvNames.length > 0,
    `Missing required smoke env vars: ${missingEnvNames.join(", ")}`
  );

  const scenarios: SmokeScenario[] = [
    {
      name: "owner dashboard renders without client errors",
      role: "Owner",
      email: process.env.SMOKE_OWNER_EMAIL ?? "",
      password: process.env.SMOKE_OWNER_PASSWORD ?? "",
      pathPattern: /\/owner(?:\?|$)/,
      navRole: "button",
      navLabel: "New Manager"
    },
    {
      name: "manager dashboard renders without client errors",
      role: "Manager",
      email: process.env.SMOKE_MANAGER_EMAIL ?? "",
      password: process.env.SMOKE_MANAGER_PASSWORD ?? "",
      pathPattern: /\/manager(?:\?|$)/,
      navRole: "button",
      navLabel: "Vendor Ops"
    },
    {
      name: "tenant dashboard renders without client errors",
      role: "Tenant",
      email: process.env.SMOKE_TENANT_EMAIL ?? "",
      password: process.env.SMOKE_TENANT_PASSWORD ?? "",
      pathPattern: /\/tenant(?:\?|$)/,
      navRole: "link",
      navLabel: "Messages"
    }
  ];

  for (const scenario of scenarios) {
    test(scenario.name, async ({ page }) => {
      const errors = collectRenderErrors(page);

      const loggedIn = await loginAsRole(page, scenario.role, scenario.email, scenario.password);
      expect(loggedIn).toBeTruthy();

      await assertRoleHomeRendered(page, scenario);
      expect(errors.consoleErrors, errors.consoleErrors.join("\n")).toEqual([]);
      expect(errors.pageErrors, errors.pageErrors.join("\n")).toEqual([]);
    });
  }
});
