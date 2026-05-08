import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendPlatformAlert } from "@/lib/platform-alerts";

describe("sendPlatformAlert", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "noreply@domusbase.com");
    vi.stubEnv("PLATFORM_ALERT_EMAIL", "admin@example.com");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends email with the alert subject prefix", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendPlatformAlert({
      subject: "Test issue",
      body: "Body text",
      dedupeKey: "subject-prefix"
    });

    expect(result).toEqual({ sent: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"subject\":\"[Domus Platform Alert] Test issue\"")
      })
    );
  });

  it("dedupes within the one-hour window", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await sendPlatformAlert({
      subject: "X",
      body: "Y",
      dedupeKey: "dedupe-window"
    });
    const second = await sendPlatformAlert({
      subject: "X",
      body: "Y",
      dedupeKey: "dedupe-window"
    });

    expect(second).toEqual({ sent: false, reason: "deduped" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns no_recipient_configured when both recipient env vars are missing", async () => {
    vi.stubEnv("PLATFORM_ALERT_EMAIL", "");
    vi.stubEnv("RESEND_FROM_EMAIL", "");

    const result = await sendPlatformAlert({
      subject: "X",
      body: "Y",
      dedupeKey: "no-recipient"
    });

    expect(result).toEqual({ sent: false, reason: "no_recipient_configured" });
  });

  it("falls back to RESEND_FROM_EMAIL when PLATFORM_ALERT_EMAIL is unset", async () => {
    vi.stubEnv("PLATFORM_ALERT_EMAIL", "");
    vi.stubEnv("RESEND_FROM_EMAIL", "fallback@example.com");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendPlatformAlert({
      subject: "Fallback issue",
      body: "Fallback body",
      dedupeKey: "fallback-recipient"
    });

    expect(result).toEqual({ sent: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        body: expect.stringContaining("\"to\":[\"fallback@example.com\"]")
      })
    );
  });

  it("returns send_failed when Resend rejects the alert email", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({ message: "failure" })
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendPlatformAlert({
      subject: "Broken issue",
      body: "Broken body",
      dedupeKey: "send-failed"
    });

    expect(result).toEqual({ sent: false, reason: "send_failed" });
  });
});
