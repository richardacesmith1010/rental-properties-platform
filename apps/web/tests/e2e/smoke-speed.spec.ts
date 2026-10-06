import { expect, test, type Page } from "@playwright/test";
import { loginAsRole, missingSmokeEnv } from "./helpers";

type VisibleTarget = { path: string; name: string; budgetMs: number; visible: (page: Page) => Promise<void> };

function percentile(sorted: number[], percent: number): number {
  return sorted[Math.ceil(sorted.length * percent) - 1];
}

async function measureRoute(page: Page, target: VisibleTarget) {
  await page.goto(target.path);
  await target.visible(page);
  const samples: number[] = [];
  for (let run = 0; run < 5; run += 1) {
    const startedAt = performance.now();
    await page.goto(target.path);
    await target.visible(page);
    samples.push(performance.now() - startedAt);
  }
  samples.sort((left, right) => left - right);
  const median = percentile(samples, 0.5);
  const p75 = percentile(samples, 0.75);
  console.log(`[smoke-speed] ${target.name}: median=${median.toFixed(0)}ms p75=${p75.toFixed(0)}ms`);
  expect(p75, `${target.name} p75 content visible`).toBeLessThanOrEqual(target.budgetMs);
}

test.describe("authenticated content speed", () => {
  test.skip(missingSmokeEnv().length > 0, `Missing smoke env: ${missingSmokeEnv().join(", ")}`);
  test.use({ viewport: { width: 375, height: 812 } });
  test.setTimeout(180_000);

  test("owner Home and Rent", async ({ page }) => {
    expect(await loginAsRole(page, "Owner", process.env.SMOKE_OWNER_EMAIL!, process.env.SMOKE_OWNER_PASSWORD!)).toBe(true);
    await measureRoute(page, {
      path: "/owner",
      name: "owner Home",
      budgetMs: 2_000,
      visible: async (current) => {
        await expect(current.getByText("Needs you today")).toBeVisible();
      }
    });
    await measureRoute(page, {
      path: "/owner?section=charges",
      name: "owner Rent",
      budgetMs: 2_000,
      visible: async (current) => {
        await expect(current.getByRole("main")).toBeVisible();
      }
    });
  });

  test("tenant Home", async ({ page }) => {
    expect(await loginAsRole(page, "Tenant", process.env.SMOKE_TENANT_EMAIL!, process.env.SMOKE_TENANT_PASSWORD!)).toBe(true);
    await measureRoute(page, {
      path: "/tenant",
      name: "tenant Home",
      budgetMs: 2_000,
      visible: async (current) => {
        await expect(current.getByText("Report a problem")).toBeVisible();
      }
    });
  });
});
