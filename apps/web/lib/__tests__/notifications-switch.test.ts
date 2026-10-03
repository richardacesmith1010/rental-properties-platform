import { afterEach, describe, expect, it, vi } from "vitest";
import { notificationsEnabled } from "@/lib/notifications-switch";

describe("notificationsEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("enables notifications only for the exact value true", () => {
    vi.stubEnv("DOMUS_NOTIFICATIONS_ENABLED", "true");
    expect(notificationsEnabled()).toBe(true);
  });

  it.each([undefined, "false", "TRUE", "TRUE ", "1", " true"])(
    "keeps notifications off for %s",
    (value) => {
      if (value === undefined) {
        delete process.env.DOMUS_NOTIFICATIONS_ENABLED;
      } else {
        vi.stubEnv("DOMUS_NOTIFICATIONS_ENABLED", value);
      }

      expect(notificationsEnabled()).toBe(false);
    }
  );
});
