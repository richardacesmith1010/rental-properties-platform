import { afterEach, describe, expect, it, vi } from "vitest";
import { isNativeApp } from "@/lib/native-app";
import { isNativeAppServer } from "@/lib/native-app-server";

vi.mock("server-only", () => ({}));
const { requestHeaders } = vi.hoisted(() => ({ requestHeaders: vi.fn() }));
vi.mock("next/headers", () => ({ headers: requestHeaders }));

afterEach(() => vi.restoreAllMocks());

describe("native presentation detection", () => {
  it.each([
    ["Mozilla/5.0 DomusApp/1", true], ["DomusApp/2", true],
    ["Mozilla/5.0 Safari", false], ["DomusApp", false], [null, false], ["", false]
  ])("checks the supplied user agent %s", (userAgent, expected) => {
    expect(isNativeApp(userAgent)).toBe(expected);
  });

  it("uses navigator on the client", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("iPhone DomusApp/1");
    expect(isNativeApp()).toBe(true);
    expect(isNativeApp("Safari")).toBe(false);
  });

  it("returns false without a browser", () => {
    vi.stubGlobal("navigator", undefined);
    expect(isNativeApp()).toBe(false);
    vi.unstubAllGlobals();
  });

  it.each(["iPhone DomusApp/1", "Safari", null])("reads awaited request headers: %s", async (ua) => {
    requestHeaders.mockResolvedValue({ get: vi.fn().mockReturnValue(ua) });
    expect(await isNativeAppServer()).toBe(Boolean(ua?.includes("DomusApp/")));
  });
});
