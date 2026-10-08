import { expect, test, type Page } from "@playwright/test";
import { loginAsRole, missingSmokeEnv, openManagerSheet } from "./helpers";

async function assertMobileLayout(page: Page, view: string) {
  // Measure the settled layout, not mid-load or mid-animation frames.
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(500);
  const findings = await page.evaluate(() => {
    const issues: string[] = [];
    if (document.documentElement.scrollWidth > 375) {
      issues.push(`document scrollWidth=${document.documentElement.scrollWidth}`);
    }
    const selector = (element: Element) => {
      const id = element.id ? `#${element.id}` : "";
      const className = [...element.classList].slice(0, 2).map((name) => `.${CSS.escape(name)}`).join("");
      return `${element.tagName.toLowerCase()}${id}${className}`;
    };
    for (const element of document.body.querySelectorAll("*")) {
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") continue;
      if (element.closest("[aria-hidden='true']")) continue;
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      if (element.closest("[style*='position: fixed'], .fixed")) continue;
      const offscreen = rect.left < -1 || rect.right > 376;
      const nearestScrollContainer = (() => {
        let ancestor = element.parentElement;
        while (ancestor) {
          const overflowX = getComputedStyle(ancestor).overflowX;
          if (overflowX === "auto" || overflowX === "scroll") return ancestor;
          ancestor = ancestor.parentElement;
        }
        return null;
      })();
      const containerRect = nearestScrollContainer?.getBoundingClientRect();
      const containerOnScreen = !!containerRect && containerRect.left >= -1 && containerRect.right <= 376;
      if (offscreen && !(nearestScrollContainer && containerOnScreen)) {
        issues.push(`${selector(element)} extends ${rect.left}..${rect.right}`);
      }
      if (!element.matches("button, a[href]")) continue;
      if (element.matches("a.sr-only")) continue;
      if (element.closest("p") && style.display === "inline") continue;
      if (rect.height < 44) issues.push(`${selector(element)} height=${rect.height}`);
    }
    return issues;
  });
  expect(findings, `${view}:\n${findings.join("\n")}`).toEqual([]);
}

test.describe("375 px layout smoke", () => {
  test.skip(missingSmokeEnv().length > 0, `Missing smoke env: ${missingSmokeEnv().join(", ")}`);
  test.use({ viewport: { width: 375, height: 812 } });
  test.setTimeout(240_000);

  test("public login", async ({ page }) => {
    for (const path of ["/login", "/login?mode=signup&role=owner"]) {
      await page.goto(path);
      await assertMobileLayout(page, path);
    }
  });

  test("owner views and manager sheet", async ({ page }) => {
    expect(await loginAsRole(page, "Owner", process.env.SMOKE_OWNER_EMAIL!, process.env.SMOKE_OWNER_PASSWORD!)).toBe(true);
    const ownerSections = [
      "overview", "charges", "maintenance", "inbox", "portfolio", "units", "leases", "tenants", "leasing",
      "applications", "invitations", "payments", "expenses", "analytics", "documents", "vendors", "automations",
      "activity", "notifications", "ownership", "members"
    ];
    for (const path of ["/settings", ...ownerSections.map((section) => `/owner?section=${section}`), "/owner/bank", "/owner/money"]) {
      await page.goto(path);
      await assertMobileLayout(page, path);
      if (path === "/settings") {
        await page.locator("[data-settings-mobile-nav] [data-settings-tab]").last().click();
        await assertMobileLayout(page, `${path} (Account & Data tab)`);
      }
    }
    await page.goto("/owner");
    await openManagerSheet(page);
    await assertMobileLayout(page, "Add a manager");
  });

  test("manager views", async ({ page }) => {
    expect(await loginAsRole(page, "Manager", process.env.SMOKE_MANAGER_EMAIL!, process.env.SMOKE_MANAGER_PASSWORD!)).toBe(true);
    const managerSections = [
      "overview", "charges", "maintenance", "inbox", "portfolio", "units", "leases", "tenants", "leasing",
      "applications", "invitations", "payments", "expenses", "analytics", "documents", "vendors", "automations",
      "activity", "notifications"
    ];
    for (const path of ["/settings", ...managerSections.map((section) => `/manager?section=${section}`)]) {
      await page.goto(path);
      await assertMobileLayout(page, path);
      if (path === "/settings") {
        await page.locator("[data-settings-mobile-nav] [data-settings-tab]").last().click();
        await assertMobileLayout(page, `${path} (Your data tab)`);
      }
    }
  });

  test("tenant views", async ({ page }) => {
    expect(await loginAsRole(page, "Tenant", process.env.SMOKE_TENANT_EMAIL!, process.env.SMOKE_TENANT_PASSWORD!)).toBe(true);
    const tenantSections = ["overview", "charges", "maintenance", "documents", "notifications"];
    for (const path of ["/settings", ...tenantSections.map((section) => `/tenant?section=${section}`)]) {
      await page.goto(path);
      await assertMobileLayout(page, path);
      if (path === "/settings") {
        await page.locator("[data-settings-mobile-nav] [data-settings-tab]").last().click();
        await assertMobileLayout(page, `${path} (Your data tab)`);
      }
    }
  });
});
