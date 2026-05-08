import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { ServiceHealth } from "@/lib/health";

const checkStripeConnectEnabledMock = vi.hoisted(() => vi.fn());
const checkStripeWebhookRegisteredMock = vi.hoisted(() => vi.fn());
const checkResendConfiguredMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/health", () => ({
  checkStripeConnectEnabled: checkStripeConnectEnabledMock,
  checkStripeWebhookRegistered: checkStripeWebhookRegisteredMock,
  checkResendConfigured: checkResendConfiguredMock
}));

import { GET } from "@/app/api/health/stripe/route";

function createRequest(token?: string) {
  return new NextRequest("http://localhost:3000/api/health/stripe", {
    headers: token ? { authorization: `Bearer ${token}` } : undefined
  });
}

function createHealth(ok: boolean, error?: string): ServiceHealth {
  return {
    ok,
    latencyMs: 5,
    error
  };
}

describe("/api/health/stripe route", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    checkStripeConnectEnabledMock.mockResolvedValue(createHealth(true));
    checkStripeWebhookRegisteredMock.mockResolvedValue(createHealth(true));
    checkResendConfiguredMock.mockReturnValue(createHealth(true));
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns 200 when all checks pass", async () => {
    const response = await GET(createRequest());
    const payload = (await response.json()) as {
      ok: boolean;
      checks: {
        connectEnabled: ServiceHealth;
        webhookRegistered: ServiceHealth;
        resendConfigured: ServiceHealth;
      };
      timestamp: string;
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.checks.connectEnabled.ok).toBe(true);
    expect(payload.checks.webhookRegistered.ok).toBe(true);
    expect(payload.checks.resendConfigured.ok).toBe(true);
    expect(typeof payload.timestamp).toBe("string");
  });

  it("returns 503 and exposes the failing check when one check fails", async () => {
    checkStripeWebhookRegisteredMock.mockResolvedValue(
      createHealth(false, "No active webhook endpoint registered for https://domusbase.com")
    );

    const response = await GET(createRequest());
    const payload = (await response.json()) as {
      ok: boolean;
      checks: {
        webhookRegistered: ServiceHealth;
      };
    };

    expect(response.status).toBe(503);
    expect(payload.ok).toBe(false);
    expect(payload.checks.webhookRegistered).toMatchObject({
      ok: false,
      error: "No active webhook endpoint registered for https://domusbase.com"
    });
  });

  it("returns 401 when a health check secret is set and no auth header is provided", async () => {
    process.env.HEALTH_CHECK_SECRET = "health-secret";

    const response = await GET(createRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(checkStripeConnectEnabledMock).not.toHaveBeenCalled();
    expect(checkStripeWebhookRegisteredMock).not.toHaveBeenCalled();
    expect(checkResendConfiguredMock).not.toHaveBeenCalled();
  });

  it("allows requests with the correct bearer token when a health check secret is set", async () => {
    process.env.HEALTH_CHECK_SECRET = "health-secret";

    const response = await GET(createRequest("health-secret"));

    expect(response.status).toBe(200);
    expect(checkStripeConnectEnabledMock).toHaveBeenCalledOnce();
    expect(checkStripeWebhookRegisteredMock).toHaveBeenCalledOnce();
    expect(checkResendConfiguredMock).toHaveBeenCalledOnce();
  });

  it("does not require auth when the health check secret is unset", async () => {
    delete process.env.HEALTH_CHECK_SECRET;

    const response = await GET(createRequest());

    expect(response.status).toBe(200);
    expect(checkStripeConnectEnabledMock).toHaveBeenCalledOnce();
    expect(checkStripeWebhookRegisteredMock).toHaveBeenCalledOnce();
    expect(checkResendConfiguredMock).toHaveBeenCalledOnce();
  });
});
