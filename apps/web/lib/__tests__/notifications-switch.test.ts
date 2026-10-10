import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isNotificationRecipientAllowed,
  notificationAllowlist,
  notificationMode,
  notificationsEnabled
} from "@/lib/notifications-switch";

describe("notification modes", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each([undefined, "false", "TRUE", "1", " true"])("is off without a list and enabled=%s", (enabled) => {
    vi.stubEnv("DOMUS_NOTIFICATIONS_ALLOWLIST", "");
    if (enabled === undefined) delete process.env.DOMUS_NOTIFICATIONS_ENABLED;
    else vi.stubEnv("DOMUS_NOTIFICATIONS_ENABLED", enabled);
    expect(notificationMode()).toBe("off");
    expect(notificationsEnabled()).toBe(false);
  });

  it("is on only for exact true with no configured list", () => {
    vi.stubEnv("DOMUS_NOTIFICATIONS_ALLOWLIST", "   ");
    vi.stubEnv("DOMUS_NOTIFICATIONS_ENABLED", "true");
    expect(notificationMode()).toBe("on");
  });

  it.each(["true", "false", "TRUE"])("is test with a valid list and enabled=%s", (enabled) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("DOMUS_NOTIFICATIONS_ENABLED", enabled);
    vi.stubEnv("DOMUS_NOTIFICATIONS_ALLOWLIST", " A@Example.com ,a@example.com, bad, B@site.org ");
    expect(notificationAllowlist()).toEqual(["a@example.com", "b@site.org"]);
    expect(notificationMode()).toBe("test");
    expect(notificationsEnabled()).toBe(true);
  });

  it.each(["true", "false"])("fails closed for a malformed-only list with enabled=%s", (enabled) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("DOMUS_NOTIFICATIONS_ENABLED", enabled);
    vi.stubEnv("DOMUS_NOTIFICATIONS_ALLOWLIST", "invalid, @host.com, a@b");
    expect(notificationAllowlist()).toEqual([]);
    expect(notificationMode()).toBe("off");
  });

  it("allows only canonical list members in test mode", () => {
    expect(isNotificationRecipientAllowed("test", "A@EXAMPLE.COM", ["a@example.com"])).toBe(true);
    expect(isNotificationRecipientAllowed("test", "other@example.com", ["a@example.com"])).toBe(false);
    expect(isNotificationRecipientAllowed("test", null, ["a@example.com"])).toBe(false);
    expect(isNotificationRecipientAllowed("off", "a@example.com", ["a@example.com"])).toBe(false);
  });
  it("warns once when enabled and a valid allowlist are both configured", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("DOMUS_NOTIFICATIONS_ENABLED", "true");
    vi.stubEnv("DOMUS_NOTIFICATIONS_ALLOWLIST", "once@example.org");
    expect(notificationMode()).toBe("test");
    expect(notificationMode()).toBe("test");
    expect(warn).toHaveBeenCalledExactlyOnceWith("[notifications] both set: using test mode");
  });

  it("warns once and stays off for a malformed-only allowlist", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("DOMUS_NOTIFICATIONS_ENABLED", "true");
    vi.stubEnv("DOMUS_NOTIFICATIONS_ALLOWLIST", "malformed-only");
    expect(notificationMode()).toBe("off");
    expect(notificationMode()).toBe("off");
    expect(warn).toHaveBeenCalledExactlyOnceWith("[notifications] allowlist invalid: off");
  });

});
