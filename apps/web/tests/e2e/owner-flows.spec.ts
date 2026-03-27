import { expect, test, type Page } from "@playwright/test";
import { collectConsoleErrors, DEMO_USERS, dismissOwnerOnboarding, expectNoConsoleErrors, loginAs } from "./helpers";

async function loginOwnerOrSkip(page: Page) {
  const loggedIn = await loginAs(page, DEMO_USERS.owner.email, DEMO_USERS.owner.password);
  test.skip(!loggedIn, "Demo seed not available. Run npm run seed:demo first.");
}

async function openOwnerWorkspace(page: Page, path = "/owner") {
  await dismissOwnerOnboarding(page, DEMO_USERS.owner.email);
  await page.goto(path);
  await page.waitForLoadState("networkidle").catch(() => {});
}

test.describe("Owner flows", () => {
  test("loads owner home with action center and finance panel", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await loginOwnerOrSkip(page);
    await openOwnerWorkspace(page);

    await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
    await expect(page.getByText(/good (morning|afternoon|evening),/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: /financial overview/i })).toBeVisible();

    const actionCenterVisible =
      (await page.getByText(/what needs attention/i).count()) > 0 ||
      (await page.getByRole("heading", { name: /no action items right now/i }).count()) > 0;
    expect(actionCenterVisible).toBeTruthy();

    expectNoConsoleErrors(errors);
  });

  test("shows seeded portfolio data", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await openOwnerWorkspace(page, "/owner?section=portfolio");

    await expect(page.getByRole("heading", { name: "Portfolio", exact: true })).toBeVisible();
    const portfolio = page.locator("#portfolio");
    await expect(portfolio.getByRole("button", { name: "Rename Riverside Apartments.", exact: true })).toBeVisible();
    await expect(portfolio.getByRole("button", { name: "Rename Oak Park Duplex.", exact: true })).toBeVisible();
  });

  test("shows manager payments section or empty state", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await openOwnerWorkspace(page, "/owner?section=manager-payments");

    await expect(page.getByRole("heading", { name: "Manager Payments" }).first()).toBeVisible();
    const paymentStateVisible =
      (await page.getByText(/pay manager|record payment|no manager payments|manager payments unavailable/i).count()) >
      0;
    expect(paymentStateVisible).toBeTruthy();
  });

  test("shows analytics charts", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await openOwnerWorkspace(page, "/owner?section=analytics");

    await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
    await expect(page.getByText(/rent collection|collected/i).first()).toBeVisible();
    await expect(page.getByText(/expense breakdown|maintenance/i).first()).toBeVisible();
  });

  test("shows the compact greeting summary on the home page", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await openOwnerWorkspace(page);

    await expect(page.getByText(/good (morning|afternoon|evening),/i)).toBeVisible();
    const summaryVisible =
      (await page.getByText(/everything looks good|overdue charge|open ticket|urgent ticket/i).count()) > 0;
    expect(summaryVisible).toBeTruthy();
  });

  test("shows inline edit affordance on portfolio", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await openOwnerWorkspace(page, "/owner?section=portfolio");

    const emptyState = page.getByText(/no properties yet/i);
    if (await emptyState.count()) {
      await expect(emptyState.first()).toBeVisible();
      return;
    }

    await expect(page.locator('[title^="Rename "]').first()).toBeVisible();
  });

  test("keeps the batch toolbar hidden by default on charges", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await openOwnerWorkspace(page, "/owner?section=charges");

    await expect(page.getByRole("toolbar", { name: /batch actions for selected charges/i })).toHaveCount(0);
  });

  test("shows members content or empty state", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await openOwnerWorkspace(page, "/owner?section=members");

    await expect(page.getByRole("heading", { name: "Members" }).first()).toBeVisible();
    const membersState = page.getByText(
      /invite members|current members|members only shows up for llc accounts|you have no pending invitations/i
    );
    expect(await membersState.count()).toBeGreaterThan(0);
  });

  test("opens the reports page", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await page.goto("/owner/reports");

    await expect(page.getByRole("heading", { name: "Financial Reports" })).toBeVisible();
    await expect(page.locator("h2", { hasText: "Rent Roll" })).toBeVisible();
    await expect(page.locator("h2", { hasText: "Accounts Receivable" })).toBeVisible();
  });
});
