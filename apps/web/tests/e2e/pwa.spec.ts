import { expect, test } from "@playwright/test";

test.describe.serial("PWA support", () => {
  test("manifest.json is accessible and valid", async ({ request }) => {
    const response = await request.get("/manifest.json");

    expect(response.status()).toBe(200);

    const manifest = await response.json();
    expect(String(manifest.name)).toContain("Domus");
    expect(manifest.display).toBe("standalone");
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThan(0);
    expect(manifest.theme_color).toBeTruthy();
  });

  test("PWA meta tags are present in the document head", async ({ page }) => {
    await page.goto("/login");
    await page.waitForTimeout(1500);

    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", /manifest\.json/);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", /.+/);
    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute("content", "yes");
  });

  test("service worker registers successfully", async ({ page }) => {
    await page.goto("/login");
    await page.waitForTimeout(1500);

    const serviceWorkerSupported = await page.evaluate(
      () => window.isSecureContext && "serviceWorker" in navigator
    );
    test.skip(!serviceWorkerSupported, "Service workers are not available in this browser context.");

    const registrationScope = await page.evaluate(async () => {
      const startedAt = Date.now();

      while (Date.now() - startedAt < 5000) {
        const registration = await navigator.serviceWorker.getRegistration("/");
        if (registration?.scope) {
          return registration.scope;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 200));
      }

      return null;
    });

    expect(registrationScope).toContain("/");
  });
});
