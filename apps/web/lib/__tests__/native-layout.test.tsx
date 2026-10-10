import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { LandingPage } from "@/components/marketing/landing-page";
import RootLayout, { metadata, viewport } from "@/app/layout";

const { native } = vi.hoisted(() => ({ native: vi.fn() }));
vi.mock("@/lib/native-app-server", () => ({ isNativeAppServer: native }));
vi.mock("next/font/google", () => ({ Inter: () => ({ variable: "inter" }) }));
vi.mock("@/app/actions/feedback", () => ({ submitFeedback: vi.fn() }));
vi.mock("@/components/help-menu", () => ({ HelpMenu: () => null }));
vi.mock("@/components/pwa/install-prompt", () => ({ InstallPromptBanner: () => null }));
vi.mock("@/components/theme-provider", () => ({ ThemeProvider: () => null }));
vi.mock("@/components/ui/sonner-provider", () => ({ SonnerProvider: () => null }));
vi.mock("@vercel/analytics/react", () => ({ Analytics: () => null }));

it.each([true, false])("sets the initial server HTML class only for native=%s", async (isNative) => {
  native.mockResolvedValue(isNative);
  const html = await RootLayout({ children: null });
  expect(html.type).toBe("html");
  expect(html.props.className).toBe(isNative ? "domus-native" : undefined);
});

it("exports light/dark theme colors and real install icons", () => {
  expect(viewport.themeColor).toEqual([
    { media: "(prefers-color-scheme: light)", color: "#FBFBF9" },
    { media: "(prefers-color-scheme: dark)", color: "#121316" }
  ]);
  expect(metadata.icons).toMatchObject({ apple: { url: "/icons/apple-touch-icon.png", sizes: "180x180" } });
  const manifest = JSON.parse(readFileSync(path.resolve("public/manifest.json"), "utf8"));
  expect(manifest.theme_color).toBe("#FBFBF9");
  expect(manifest.icons.map((icon: { sizes: string; purpose: string }) => [icon.sizes, icon.purpose]))
    .toEqual([["192x192", "any"], ["512x512", "any"], ["512x512", "maskable"]]);
  for (const icon of manifest.icons) {
    const png = readFileSync(path.resolve("public", icon.src.slice(1)));
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`).toBe(icon.sizes);
  }
});

it("insets only landing and login beneath native status bars", () => {
  const css = readFileSync(path.resolve("app/globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const nativeRules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selector, body]) => selector.includes(".domus-native") && body.includes("padding"));
  expect(nativeRules).toHaveLength(1);
  const [, selector, body] = nativeRules[0];
  expect(selector.trim().split(/,\s*/)).toEqual([
    ".domus-native .domus-landing-header", ".domus-native .domus-login-page"
  ]);
  expect(body.trim()).toBe("padding-top: env(safe-area-inset-top);");
  const landing = LandingPage();
  expect(landing.props.children[0].type).toBe("header");
  expect(landing.props.children[0].props.className.split(" ")).toContain("domus-landing-header");
  for (const file of ["app/tenant/page.tsx", "components/dashboard/dashboard-layout.tsx"]) {
    const source = readFileSync(path.resolve(file), "utf8");
    expect(source).toContain("<MobileTopBar");
    expect(source).not.toMatch(/domus-(login-page|landing-header)|safe-area-inset-top/);
  }
});
