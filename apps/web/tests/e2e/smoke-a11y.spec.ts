import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginAsRole, missingSmokeEnv, openManagerSheet } from "./helpers";

async function assertAccessible(page: Page, view: string) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const severe = result.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""));
  const details = severe.flatMap((violation) =>
    violation.nodes.map((node) => `${view}: ${violation.id} → ${node.target.join(", ")}`)
  );
  expect(details, details.join("\n")).toEqual([]);
}

test.describe("accessibility smoke", () => {
  test.skip(missingSmokeEnv().length > 0, `Missing smoke env: ${missingSmokeEnv().join(", ")}`);
  test.setTimeout(120_000);

  test("public login and owner signup", async ({ page }) => {
    for (const path of ["/login", "/login?mode=signup&role=owner"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: /workspace|owner account/i })).toBeVisible();
      await assertAccessible(page, path);
    }
  });

  test("owner views and manager sheet", async ({ page }) => {
    expect(await loginAsRole(page, "Owner", process.env.SMOKE_OWNER_EMAIL!, process.env.SMOKE_OWNER_PASSWORD!)).toBe(true);
    for (const path of ["/owner", "/owner?section=charges", "/owner/bank", "/owner/money"]) {
      await page.goto(path);
      await expect(page.getByRole("main")).toBeVisible();
      await assertAccessible(page, path);
    }
    await page.goto("/owner");
    await openManagerSheet(page);
    await assertAccessible(page, "Add a manager");
  });

  test("manager home", async ({ page }) => {
    expect(await loginAsRole(page, "Manager", process.env.SMOKE_MANAGER_EMAIL!, process.env.SMOKE_MANAGER_PASSWORD!)).toBe(true);
    await assertAccessible(page, "/manager");
  });

  test("tenant home and problem form", async ({ page }) => {
    expect(await loginAsRole(page, "Tenant", process.env.SMOKE_TENANT_EMAIL!, process.env.SMOKE_TENANT_PASSWORD!)).toBe(true);
    for (const path of ["/tenant", "/tenant?section=maintenance"]) {
      await page.goto(path);
      await expect(page.getByRole("main")).toBeVisible();
      await assertAccessible(page, path);
    }
  });
});
