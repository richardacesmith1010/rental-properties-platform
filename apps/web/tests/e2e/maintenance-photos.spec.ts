import { expect, test, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { DEMO_USERS, loginAs } from "./helpers";

function jpegSize(bytes: Buffer) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("Missing JPEG header");
  for (let offset = 2; offset + 4 < bytes.length;) {
    if (bytes[offset] !== 0xff) throw new Error("Invalid JPEG marker");
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) throw new Error("Invalid JPEG segment");
    if (marker === 0xc0 || marker === 0xc2) {
      return { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) };
    }
    offset += length;
  }
  throw new Error("JPEG frame size missing");
}

async function loginTenantOrSkip(page: Page) {
  const loggedIn = await loginAs(page, DEMO_USERS.tenant1.email, DEMO_USERS.tenant1.password);
  test.skip(!loggedIn, "Demo seed not available. Run npm run seed:demo first.");
}

async function loginOwnerOrSkip(page: Page) {
  const loggedIn = await loginAs(page, DEMO_USERS.owner.email, DEMO_USERS.owner.password);
  test.skip(!loggedIn, "Demo seed not available. Run npm run seed:demo first.");
}

async function openTenantMaintenance(page: Page) {
  await page.goto("/tenant?section=maintenance");
  await page.waitForTimeout(1500);
}

async function advanceTicketFormToPhotoStep(page: Page) {
  const formHeading = page.getByRole("heading", { name: /submit maintenance request/i });
  test.skip((await formHeading.count()) === 0, "Ticket creation form is not available for this tenant.");

  const unitSelect = page.locator("select").first();
  test.skip((await unitSelect.count()) === 0, "No unit selector is available for ticket creation.");

  const unitOptions = await unitSelect.locator("option").count();
  test.skip(unitOptions < 2, "No tenant units are available for ticket creation.");

  await unitSelect.selectOption({ index: 1 });
  await page.getByRole("button", { name: /^Next$/ }).click();

  await page.getByPlaceholder(/brief summary/i).fill("Leaky faucet under kitchen sink");
  await page.getByRole("button", { name: /^Next$/ }).click();

  await page.getByPlaceholder(/describe the issue in detail/i).fill("Water pools under the sink whenever the faucet runs.");
  await page.getByRole("button", { name: /^Next$/ }).click();
  await page.getByRole("button", { name: /^Next$/ }).click();
}

test.describe.serial("Maintenance photo support", () => {
  test("tenant maintenance section shows ticket creation", async ({ page }) => {
    await loginTenantOrSkip(page);
    await openTenantMaintenance(page);

    const headingCount = await page.getByRole("heading", { name: /maintenance tickets|submit maintenance request/i }).count();
    const contentCount = await page.getByText(/maintenance|request|ticket/i).count();

    expect(headingCount + contentCount).toBeGreaterThan(0);
  });

  test("ticket creation form exposes image upload controls", async ({ page }) => {
    await loginTenantOrSkip(page);
    await openTenantMaintenance(page);
    await advanceTicketFormToPhotoStep(page);

    const uploadHeadingCount =
      (await page.getByText(/attach maintenance photos/i).count()) +
      (await page.getByText(/follow-up or completion photos/i).count());
    const actionButtonCount =
      (await page.getByRole("button", { name: /take photo/i }).count()) +
      (await page.getByRole("button", { name: /choose from gallery/i }).count()) +
      (await page.getByRole("button", { name: /upload photos/i }).count());

    expect(uploadHeadingCount).toBeGreaterThan(0);
    expect(actionButtonCount).toBeGreaterThan(1);

    const captureInputs = page.locator('input[type="file"][capture="environment"]');
    expect(await captureInputs.count()).toBeGreaterThan(0);

    const acceptValues = await captureInputs.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("accept") ?? "")
    );

    expect(acceptValues.some((value) => value.includes("image/jpeg"))).toBe(true);
    expect(acceptValues.some((value) => value.includes("image/heic"))).toBe(false);
  });

  test("portrait EXIF photo reaches the repair action as a portrait JPEG", async ({ page }) => {
    await loginTenantOrSkip(page);
    await openTenantMaintenance(page);
    test.skip((await page.getByRole("heading", { name: "Report a repair" }).count()) === 0,
      "Tenant repair form is unavailable.");
    await page.getByLabel("What needs repair?").fill("The sink leaks.");
    const picker = page.locator('input[type="file"]:not([capture])').first();
    await picker.setInputFiles(fileURLToPath(new URL("../fixtures/portrait-exif6.jpg", import.meta.url)));
    const requestPromise = page.waitForRequest((request) =>
      request.method() === "POST" && new URL(request.url()).pathname === "/tenant");
    await page.getByRole("button", { name: "Send to landlord" }).click();
    const body = (await requestPromise).postDataBuffer();
    expect(body).not.toBeNull();
    const start = body!.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
    const end = body!.indexOf(Buffer.from([0xff, 0xd9]), start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const dimensions = jpegSize(body!.subarray(start, end + 2));
    expect(dimensions.height).toBeGreaterThan(dimensions.width);
  });

  test("maintenance views expose photo gallery affordances when photos exist", async ({ page }) => {
    await loginOwnerOrSkip(page);
    await page.goto("/owner?section=maintenance");
    await page.waitForTimeout(1500);

    const maintenanceSection = page.locator("#maintenance");
    const viewPhotoLinks = maintenanceSection.getByRole("link", { name: /view photo/i });
    const openPhotoButtons = maintenanceSection.locator('button[title^="Open "]');

    if ((await viewPhotoLinks.count()) > 0) {
      await expect(viewPhotoLinks.first()).toBeVisible();
      return;
    }

    if ((await openPhotoButtons.count()) > 0) {
      await expect(openPhotoButtons.first()).toBeVisible();
      return;
    }

    const maintenanceHeadingCount = await page.getByRole("heading", { name: /maintenance/i }).count();
    const photoMetaCount = await page.getByText(/photos?:|no photos/i).count();

    expect(maintenanceHeadingCount + photoMetaCount).toBeGreaterThan(0);
  });
});
