import { expect, test, type Page } from "@playwright/test";
import { loginAsRole } from "./helpers";

export type RgbaColor = {
  r: number;
  g: number;
  b: number;
  a: number;
};

export function parseCssColor(value: string): RgbaColor | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "transparent") {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  const srgbMatch = normalized.match(/^color\(srgb\s+([^)]*)\)$/);
  if (srgbMatch) {
    const [channelsPart, alphaPart] = srgbMatch[1].split("/").map((part) => part.trim());
    const channels = channelsPart.split(/\s+/).map(Number);
    const alpha = alphaPart === undefined ? 1 : Number(alphaPart);
    if (channels.length !== 3 || channels.some(Number.isNaN) || Number.isNaN(alpha)) {
      return null;
    }
    return {
      r: Math.min(1, Math.max(0, channels[0])),
      g: Math.min(1, Math.max(0, channels[1])),
      b: Math.min(1, Math.max(0, channels[2])),
      a: Math.min(1, Math.max(0, alpha))
    };
  }

  const rgbMatch = normalized.match(/^rgba?\(([^)]*)\)$/);
  if (!rgbMatch) {
    return null;
  }

  const [channelsPart, slashAlpha] = rgbMatch[1].split("/").map((part) => part.trim());
  const commaParts = channelsPart.includes(",")
    ? channelsPart.split(",").map((part) => part.trim())
    : channelsPart.split(/\s+/);
  let alphaPart: string | undefined = slashAlpha;
  if (commaParts.length === 4 && alphaPart === undefined) {
    alphaPart = commaParts.pop();
  }
  if (commaParts.length !== 3) {
    return null;
  }

  const parseChannel = (channel: string) =>
    channel.endsWith("%") ? Number(channel.slice(0, -1)) / 100 : Number(channel) / 255;
  const parseAlpha = (alpha: string | undefined) => {
    if (alpha === undefined) return 1;
    return alpha.endsWith("%") ? Number(alpha.slice(0, -1)) / 100 : Number(alpha);
  };
  const channels = commaParts.map(parseChannel);
  const alpha = parseAlpha(alphaPart);
  if (channels.some(Number.isNaN) || Number.isNaN(alpha)) {
    return null;
  }
  return {
    r: Math.min(1, Math.max(0, channels[0])),
    g: Math.min(1, Math.max(0, channels[1])),
    b: Math.min(1, Math.max(0, channels[2])),
    a: Math.min(1, Math.max(0, alpha))
  };
}

export function compositeColors(foreground: RgbaColor, background: RgbaColor): RgbaColor {
  const alpha = foreground.a + background.a * (1 - foreground.a);
  if (alpha === 0) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  return {
    r: (foreground.r * foreground.a + background.r * background.a * (1 - foreground.a)) / alpha,
    g: (foreground.g * foreground.a + background.g * background.a * (1 - foreground.a)) / alpha,
    b: (foreground.b * foreground.a + background.b * background.a * (1 - foreground.a)) / alpha,
    a: alpha
  };
}

export function relativeLuminance(color: RgbaColor): number {
  const linearize = (channel: number) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  return 0.2126 * linearize(color.r) + 0.7152 * linearize(color.g) + 0.0722 * linearize(color.b);
}

export function contrastRatio(first: RgbaColor, second: RgbaColor): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

test.describe("theme contrast math", () => {
  test("white on white has a 1:1 contrast ratio", () => {
    const white = parseCssColor("rgb(255, 255, 255)");
    expect(white).not.toBeNull();
    expect(contrastRatio(white!, white!)).toBeCloseTo(1, 5);
  });

  test("black on white has a 21:1 contrast ratio", () => {
    const black = parseCssColor("rgb(0 0 0)");
    const white = parseCssColor("rgb(255 255 255)");
    expect(contrastRatio(black!, white!)).toBeCloseTo(21, 5);
  });

  test("parses rgba alpha", () => {
    expect(parseCssColor("rgba(255, 0, 128, 0.5)")).toEqual({ r: 1, g: 0, b: 128 / 255, a: 0.5 });
  });

  test("parses color(srgb) channels as zero-to-one values", () => {
    expect(parseCssColor("color(srgb 1 1 1 / 0.94)")).toEqual({ r: 1, g: 1, b: 1, a: 0.94 });
  });

  test("composites half-transparent black over white", () => {
    const result = compositeColors({ r: 0, g: 0, b: 0, a: 0.5 }, { r: 1, g: 1, b: 1, a: 1 });
    expect(result).toEqual({ r: 0.5, g: 0.5, b: 0.5, a: 1 });
  });
});

const REQUIRED_ENV_NAMES = [
  "APP_URL",
  "SMOKE_OWNER_EMAIL",
  "SMOKE_OWNER_PASSWORD",
  "SMOKE_MANAGER_EMAIL",
  "SMOKE_MANAGER_PASSWORD",
  "SMOKE_TENANT_EMAIL",
  "SMOKE_TENANT_PASSWORD"
] as const;

const OWNER_SECTIONS = [
  "Overview",
  "Charges",
  "Payments",
  "Maintenance",
  "Leasing Hub",
  "Applications",
  "Manager Payments",
  "Inbox",
  "Notifications",
  "Activity",
  "Ownership",
  "Invitations",
  "Documents",
  "Vendors",
  "Expenses",
  "Analytics",
  "Operations",
  "Portfolio",
  "Units",
  "Leases",
  "Tenants"
] as const;

const DEFAULT_OWNER_SECTIONS = ["Units", "Leases", "Expenses", "Operations", "Documents", "Leasing Hub"];
const DEFAULT_MANAGER_SECTIONS = ["Vendors", "Maintenance"];
const TENANT_VIEWS = ["/tenant", "/tenant?section=notifications", "/settings"];
const FULL_MODE = process.env.SMOKE_THEME_FULL === "1";

type SmokeRole = "Owner" | "Manager" | "Tenant";
type Theme = "light" | "dark";
type ContrastFinding = {
  kind: "near-invisible text" | "light box in dark theme";
  element: string;
  foreground?: string;
  background: string;
  ratio?: number;
};

function getMissingEnvNames() {
  return REQUIRED_ENV_NAMES.filter((name) => !process.env[name]?.trim());
}

async function configureTheme(page: Page, theme: Theme) {
  await page.emulateMedia({ colorScheme: theme });
  await page.addInitScript((selectedTheme) => {
    window.localStorage.setItem("domus-theme", selectedTheme);
  }, theme);
}

async function waitForView(page: Page) {
  await expect(page.locator("main")).toBeVisible({ timeout: 6_000 });
  await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => {});
}

async function openDashboardSection(page: Page, label: string): Promise<boolean> {
  const paletteTrigger = page.getByText("Search navigation", { exact: false }).first();
  if (await paletteTrigger.isVisible().catch(() => false)) {
    await paletteTrigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 3_000 });
    const input = dialog.getByRole("combobox");
    await input.fill(label);
    const option = dialog.getByRole("option", { name: new RegExp(`^${escapeRegExp(label)}(?:\\s|$)`, "i") }).first();
    const optionAppeared = await option
      .waitFor({ state: "visible", timeout: 1_500 })
      .then(() => true)
      .catch(() => false);
    if (!optionAppeared) {
      await page.keyboard.press("Escape");
      return false;
    }
    await input.press("Enter");
    await expect(dialog).toBeHidden({ timeout: 3_000 });
  } else {
    const navigation = page.getByRole("navigation", { name: "Main navigation" });
    const item = navigation.getByRole("button", { name: new RegExp(`^${escapeRegExp(label)}(?:\\s|$)`, "i") }).first();
    if (!(await item.isVisible().catch(() => false))) {
      return false;
    }
    await item.click();
  }
  await waitForView(page);
  return true;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function scanThemeContrast(page: Page, theme: Theme): Promise<ContrastFinding[]> {
  return page.evaluate(
    ({ activeTheme, textThreshold, lightBoxLuminance }) => {
      type Color = { r: number; g: number; b: number; a: number };
      type Finding = {
        kind: "near-invisible text" | "light box in dark theme";
        element: string;
        foreground?: string;
        background: string;
        ratio?: number;
      };

      const parseColor = (value: string): Color | null => {
        const normalized = value.trim().toLowerCase();
        if (normalized === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
        const srgb = normalized.match(/^color\(srgb\s+([^)]*)\)$/);
        if (srgb) {
          const [channelsPart, alphaPart] = srgb[1].split("/").map((part) => part.trim());
          const channels = channelsPart.split(/\s+/).map(Number);
          const alpha = alphaPart === undefined ? 1 : Number(alphaPart);
          if (channels.length !== 3 || channels.some(Number.isNaN) || Number.isNaN(alpha)) return null;
          return { r: channels[0], g: channels[1], b: channels[2], a: alpha };
        }
        const rgb = normalized.match(/^rgba?\(([^)]*)\)$/);
        if (!rgb) return null;
        const [channelsPart, slashAlpha] = rgb[1].split("/").map((part) => part.trim());
        const parts = channelsPart.includes(",")
          ? channelsPart.split(",").map((part) => part.trim())
          : channelsPart.split(/\s+/);
        let alphaPart: string | undefined = slashAlpha;
        if (parts.length === 4 && alphaPart === undefined) alphaPart = parts.pop();
        if (parts.length !== 3) return null;
        const channels = parts.map((part) =>
          part.endsWith("%") ? Number(part.slice(0, -1)) / 100 : Number(part) / 255
        );
        const alpha = alphaPart === undefined
          ? 1
          : alphaPart.endsWith("%")
            ? Number(alphaPart.slice(0, -1)) / 100
            : Number(alphaPart);
        if (channels.some(Number.isNaN) || Number.isNaN(alpha)) return null;
        return { r: channels[0], g: channels[1], b: channels[2], a: alpha };
      };
      const composite = (foreground: Color, background: Color): Color => {
        const alpha = foreground.a + background.a * (1 - foreground.a);
        if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 };
        return {
          r: (foreground.r * foreground.a + background.r * background.a * (1 - foreground.a)) / alpha,
          g: (foreground.g * foreground.a + background.g * background.a * (1 - foreground.a)) / alpha,
          b: (foreground.b * foreground.a + background.b * background.a * (1 - foreground.a)) / alpha,
          a: alpha
        };
      };
      const luminance = (color: Color) => {
        const linearize = (channel: number) =>
          channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        return 0.2126 * linearize(color.r) + 0.7152 * linearize(color.g) + 0.0722 * linearize(color.b);
      };
      const contrast = (first: Color, second: Color) => {
        const lighter = Math.max(luminance(first), luminance(second));
        const darker = Math.min(luminance(first), luminance(second));
        return (lighter + 0.05) / (darker + 0.05);
      };
      const formatColor = (color: Color) =>
        `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${color.a.toFixed(2)})`;
      const isSrOnly = (element: Element) =>
        Array.from(element.classList).some((className) => className === "sr-only") || Boolean(element.closest(".sr-only"));
      const isVisible = (element: Element) => {
        if (isSrOnly(element)) return false;
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        let current: Element | null = element;
        while (current) {
          const style = getComputedStyle(current);
          if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
          current = current.parentElement;
        }
        return true;
      };
      const bodyBackground = () => {
        const parsed = parseColor(getComputedStyle(document.body).backgroundColor);
        if (parsed && parsed.a > 0) return composite(parsed, { r: 1, g: 1, b: 1, a: 1 });
        return { r: 1, g: 1, b: 1, a: 1 };
      };
      const effectiveBackground = (element: Element) => {
        let result: Color = { r: 0, g: 0, b: 0, a: 0 };
        let current: Element | null = element;
        while (current) {
          const background = parseColor(getComputedStyle(current).backgroundColor);
          if (background && background.a > 0) result = composite(result, background);
          if (result.a >= 0.999) return result;
          current = current.parentElement;
        }
        return composite(result, bodyBackground());
      };
      const descriptor = (element: Element, text?: string) => {
        const snippet = text?.replace(/\s+/g, " ").trim().slice(0, 80);
        if (snippet) return `text=\"${snippet}\"`;
        const className = typeof element.className === "string" ? element.className.trim().replace(/\s+/g, " ") : "";
        return className ? `${element.tagName.toLowerCase()}.${className.slice(0, 100)}` : element.tagName.toLowerCase();
      };

      const roots = Array.from(document.querySelectorAll("main, [role='dialog']"));
      const elements = Array.from(new Set(roots.flatMap((root) => [root, ...Array.from(root.querySelectorAll("*"))])));
      const findings: Finding[] = [];
      for (const element of elements) {
        if (!isVisible(element)) continue;
        const directText = Array.from(element.childNodes)
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent ?? "")
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        if (directText) {
          const rawForeground = parseColor(getComputedStyle(element).color);
          const background = effectiveBackground(element);
          if (rawForeground) {
            const foreground = composite(rawForeground, background);
            const ratio = contrast(foreground, background);
            if (ratio < textThreshold) {
              findings.push({
                kind: "near-invisible text",
                element: descriptor(element, directText),
                foreground: formatColor(foreground),
                background: formatColor(background),
                ratio
              });
            }
          }
        }

        if (activeTheme === "dark") {
          const rect = element.getBoundingClientRect();
          const ownBackground = parseColor(getComputedStyle(element).backgroundColor);
          if (
            rect.width >= 60 &&
            rect.height >= 18 &&
            ownBackground &&
            ownBackground.a > 0.5 &&
            luminance(ownBackground) > lightBoxLuminance
          ) {
            findings.push({
              kind: "light box in dark theme",
              element: descriptor(element),
              background: formatColor(ownBackground)
            });
          }
        }
      }
      return findings;
    },
    { activeTheme: theme, textThreshold: 2, lightBoxLuminance: 0.8 }
  );
}

function formatFailure(role: SmokeRole, theme: Theme, view: string, findings: ContrastFinding[]) {
  const examples = findings.slice(0, 5).map((finding) => {
    const ratio = finding.ratio === undefined ? "" : `, ratio=${finding.ratio.toFixed(2)}`;
    const foreground = finding.foreground ? `, foreground=${finding.foreground}` : "";
    return `- ${finding.kind}: ${finding.element}${foreground}, background=${finding.background}${ratio}`;
  });
  return `${role} | ${theme} | ${view}: ${findings.length} theme contrast finding(s)\n${examples.join("\n")}`;
}

async function assertView(page: Page, role: SmokeRole, theme: Theme, view: string) {
  const findings = await scanThemeContrast(page, theme);
  expect(findings, formatFailure(role, theme, view, findings)).toEqual([]);
}

test.describe("authenticated theme contrast smoke", () => {
  test.describe.configure({ mode: "serial", retries: 0 });

  const missingEnvNames = getMissingEnvNames();
  test.skip(
    missingEnvNames.length > 0,
    `Missing required smoke env vars: ${missingEnvNames.join(", ")}`
  );

  const themes: Theme[] = FULL_MODE ? ["dark", "light"] : ["dark"];
  for (const theme of themes) {
    test(`Owner ${theme} theme views have no severe contrast findings`, async ({ page }) => {
      await configureTheme(page, theme);
      const loggedIn = await loginAsRole(
        page,
        "Owner",
        process.env.SMOKE_OWNER_EMAIL ?? "",
        process.env.SMOKE_OWNER_PASSWORD ?? ""
      );
      expect(loggedIn).toBeTruthy();
      await waitForView(page);
      await assertView(page, "Owner", theme, "home");

      const sections = FULL_MODE ? OWNER_SECTIONS : DEFAULT_OWNER_SECTIONS;
      for (const section of sections) {
        if (section === "Overview") continue;
        if (await openDashboardSection(page, section)) {
          await assertView(page, "Owner", theme, section);
        }
      }
    });
  }

  if (!FULL_MODE) {
    test("Owner light theme home has no severe contrast findings", async ({ page }) => {
      await configureTheme(page, "light");
      const loggedIn = await loginAsRole(
        page,
        "Owner",
        process.env.SMOKE_OWNER_EMAIL ?? "",
        process.env.SMOKE_OWNER_PASSWORD ?? ""
      );
      expect(loggedIn).toBeTruthy();
      await waitForView(page);
      await assertView(page, "Owner", "light", "home");
    });
  }

  for (const theme of themes) {
    test(`Manager ${theme} theme views have no severe contrast findings`, async ({ page }) => {
      await configureTheme(page, theme);
      const loggedIn = await loginAsRole(
        page,
        "Manager",
        process.env.SMOKE_MANAGER_EMAIL ?? "",
        process.env.SMOKE_MANAGER_PASSWORD ?? ""
      );
      expect(loggedIn).toBeTruthy();
      await waitForView(page);
      await assertView(page, "Manager", theme, "home");
      if (!FULL_MODE) {
        for (const section of DEFAULT_MANAGER_SECTIONS) {
          if (await openDashboardSection(page, section)) {
            await assertView(page, "Manager", theme, section);
          }
        }
      }
    });
  }

  for (const theme of themes) {
    test(`Tenant ${theme} theme views have no severe contrast findings`, async ({ page }) => {
      await configureTheme(page, theme);
      const loggedIn = await loginAsRole(
        page,
        "Tenant",
        process.env.SMOKE_TENANT_EMAIL ?? "",
        process.env.SMOKE_TENANT_PASSWORD ?? ""
      );
      expect(loggedIn).toBeTruthy();
      for (const path of TENANT_VIEWS) {
        await page.goto(path);
        await waitForView(page);
        await assertView(page, "Tenant", theme, path);
      }
    });
  }

  if (!FULL_MODE) {
    test("Tenant light theme home has no severe contrast findings", async ({ page }) => {
      await configureTheme(page, "light");
      const loggedIn = await loginAsRole(
        page,
        "Tenant",
        process.env.SMOKE_TENANT_EMAIL ?? "",
        process.env.SMOKE_TENANT_PASSWORD ?? ""
      );
      expect(loggedIn).toBeTruthy();
      await page.goto("/tenant");
      await waitForView(page);
      await assertView(page, "Tenant", "light", "/tenant");
    });
  }
});
