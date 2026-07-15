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

function createRequest(authorization?: string) {
  return new NextRequest("http://localhost:3000/api/health/stripe", {
    headers: authorization ? { authorization } : undefined
  });
}

function createHealth(ok: boolean, error?: string): ServiceHealth {
  return {
    ok,
    latencyMs: 5,
    error
  };
}

function expectNoStore(response: Response) {
  expect(response.headers.get("cache-control")).toBe("no-store");
}

function expectHealthChecksNotCalled() {
  expect(checkStripeConnectEnabledMock).not.toHaveBeenCalled();
  expect(checkStripeWebhookRegisteredMock).not.toHaveBeenCalled();
  expect(checkResendConfiguredMock).not.toHaveBeenCalled();
}

describe("/api/health/stripe route", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, NODE_ENV: "test" };
    delete process.env.VERCEL_ENV;
    delete process.env.HEALTH_CHECK_SECRET;
    checkStripeConnectEnabledMock.mockResolvedValue(createHealth(true));
    checkStripeWebhookRegisteredMock.mockResolvedValue(createHealth(true));
    checkResendConfiguredMock.mockReturnValue(createHealth(true));
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
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
    expectNoStore(response);
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
    expectNoStore(response);
    expect(payload.ok).toBe(false);
    expect(payload.checks.webhookRegistered).toMatchObject({
      ok: false,
      error: "No active webhook endpoint registered for https://domusbase.com"
    });
  });

  it.each([
    ["production", "production"],
    ["preview", "preview"],
    ["unexpected", "qa"]
  ])("returns 503 when %s requests are protected and the secret is unset", async (_label, vercelEnv) => {
    process.env.VERCEL_ENV = vercelEnv;

    const response = await GET(createRequest());

    expect(response.status).toBe(503);
    expectNoStore(response);
    await expect(response.json()).resolves.toEqual({ error: "health check not configured" });
    expectHealthChecksNotCalled();
  });

  it("returns 503 when NODE_ENV is production and VERCEL_ENV is undefined with no secret", async () => {
    process.env = { ...process.env, NODE_ENV: "production" };

    const response = await GET(createRequest());

    expect(response.status).toBe(503);
    expectNoStore(response);
    await expect(response.json()).resolves.toEqual({ error: "health check not configured" });
    expectHealthChecksNotCalled();
  });

  it.each([
    ["missing header", undefined],
    ["wrong scheme", "Basic health-secret"],
    ["empty bearer", "Bearer"],
    ["extra material", "Bearer health-secret extra"],
    ["wrong bearer", "Bearer health-secrex"]
  ])("returns 401 for %s and does not invoke health checks", async (_label, authorization) => {
    process.env.VERCEL_ENV = "production";
    process.env.HEALTH_CHECK_SECRET = "health-secret";

    const response = await GET(createRequest(authorization));

    expect(response.status).toBe(401);
    expectNoStore(response);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expectHealthChecksNotCalled();
  });

  it("allows requests with the correct bearer token when a protected environment is configured", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.HEALTH_CHECK_SECRET = "health-secret";

    const response = await GET(createRequest("Bearer health-secret"));

    expect(response.status).toBe(200);
    expectNoStore(response);
    expect(checkStripeConnectEnabledMock).toHaveBeenCalledOnce();
    expect(checkStripeWebhookRegisteredMock).toHaveBeenCalledOnce();
    expect(checkResendConfiguredMock).toHaveBeenCalledOnce();
  });

  it.each([
    ["without a secret", undefined],
    ["with a secret", "health-secret"]
  ])("allows unauthenticated local dev requests %s", async (_label, secret) => {
    if (secret) {
      process.env.HEALTH_CHECK_SECRET = secret;
    }

    const response = await GET(createRequest());

    expect(response.status).toBe(200);
    expectNoStore(response);
    expect(checkStripeConnectEnabledMock).toHaveBeenCalledOnce();
    expect(checkStripeWebhookRegisteredMock).toHaveBeenCalledOnce();
    expect(checkResendConfiguredMock).toHaveBeenCalledOnce();
  });
});
