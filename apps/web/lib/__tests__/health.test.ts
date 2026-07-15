import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createAdminClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock
}));

import { GET } from "@/app/api/health/route";
import {
  buildHealthPayload,
  checkResendConfigured,
  checkStripe,
  checkStripeConnectEnabled,
  checkStripeWebhookRegistered,
  checkSupabase,
  resetStripeConnectCheckCache,
  type ServiceHealth
} from "@/lib/health";

function mockSupabaseSelect(error: { message: string } | null = null) {
  const limit = vi.fn().mockResolvedValue({ error });
  const select = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ select }));
  createAdminClientMock.mockReturnValue({ from });
  return { from, select, limit };
}

describe("health route", () => {
  const originalEnv = { ...process.env };
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    resetStripeConnectCheckCache();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      STRIPE_SECRET_KEY: "sk_test_123",
      NEXT_PUBLIC_APP_URL: "https://domusbase.com"
    };
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    resetStripeConnectCheckCache();
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns 200 when all services are reachable", async () => {
    mockSupabaseSelect(null);
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    const response = await GET();
    const payload = (await response.json()) as {
      ok: boolean;
      services: { supabase: ServiceHealth; stripe: ServiceHealth };
      timestamp: string;
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.services.supabase.ok).toBe(true);
    expect(payload.services.stripe.ok).toBe(true);
    expect(typeof payload.timestamp).toBe("string");
  });

  it("returns 503 when Supabase is unreachable", async () => {
    mockSupabaseSelect({ message: "database offline" });
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    const response = await GET();
    const payload = (await response.json()) as {
      ok: boolean;
      services: { supabase: ServiceHealth; stripe: ServiceHealth };
    };

    expect(response.status).toBe(503);
    expect(payload.ok).toBe(false);
    expect(payload.services.supabase).toMatchObject({
      ok: false,
      error: "database offline"
    });
  });

  it("returns 503 when the Stripe key is missing", async () => {
    mockSupabaseSelect(null);
    delete process.env.STRIPE_SECRET_KEY;

    const response = await GET();
    const payload = (await response.json()) as {
      ok: boolean;
      services: { stripe: ServiceHealth };
    };

    expect(response.status).toBe(503);
    expect(payload.ok).toBe(false);
    expect(payload.services.stripe).toMatchObject({
      ok: false,
      error: "STRIPE_SECRET_KEY not set"
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checks Stripe with the expected authorization header", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    await checkStripe();

    expect(fetchMock).toHaveBeenCalledWith("https://api.stripe.com/v1/balance", {
      headers: { Authorization: "Bearer sk_test_123" },
      cache: "no-store"
    });
  });

  it("returns an error payload when the admin client throws", async () => {
    createAdminClientMock.mockImplementation(() => {
      throw new Error("boom");
    });

    const result = await checkSupabase();

    expect(result.ok).toBe(false);
    expect(result.error).toBe("boom");
  });

  it("returns healthy only when the probe account can be created and deleted", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          id: "acct_probe_123"
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          deleted: true
        })
      });

    const result = await checkStripeConnectEnabled();

    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://api.stripe.com/v1/accounts", {
      method: "POST",
      headers: {
        Authorization: "Bearer sk_test_123",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: "type=express&country=US&capabilities%5Bcard_payments%5D%5Brequested%5D=true&capabilities%5Btransfers%5D%5Brequested%5D=true&business_profile%5Bmcc%5D=6513&business_profile%5Burl%5D=https%3A%2F%2Fdomusbase.com",
      cache: "no-store"
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://api.stripe.com/v1/accounts/acct_probe_123", {
      method: "DELETE",
      headers: {
        Authorization: "Bearer sk_test_123"
      },
      cache: "no-store"
    });
  });

  it("attempts cleanup from finally when a post-creation error is thrown", async () => {
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValueOnce(1000);
    nowSpy.mockImplementationOnce(() => {
      throw new Error("clock failed");
    });
    nowSpy.mockReturnValue(1100);

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          id: "acct_probe_finally"
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          deleted: true
        })
      });

    const result = await checkStripeConnectEnabled();

    expect(result.ok).toBe(false);
    expect(result.error).toContain("clock failed");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://api.stripe.com/v1/accounts/acct_probe_finally", {
      method: "DELETE",
      headers: {
        Authorization: "Bearer sk_test_123"
      },
      cache: "no-store"
    });
  });

  it("returns unhealthy with the Stripe message when probe account creation is blocked", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          error: {
            message: "You must complete your platform profile to use Connect and create live connected accounts"
          }
        })
      )
    });

    const result = await checkStripeConnectEnabled();

    expect(result.ok).toBe(false);
    expect(result.error).toContain("must complete your platform profile");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("returns unhealthy when probe cleanup cannot be confirmed and logs the orphaned account ID", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          id: "acct_probe_orphan"
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          deleted: false
        })
      });

    const result = await checkStripeConnectEnabled();

    expect(result).toMatchObject({
      ok: false,
      error: "Stripe Connect probe cleanup could not be confirmed"
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[health] failed to confirm deletion of Stripe Connect probe account",
      "acct_probe_orphan",
      "deleted flag missing or false"
    );
    expect(consoleErrorSpy.mock.calls.flat().join(" ")).not.toContain("sk_test_123");
  });

  it("returns the cached probe result for one hour without hitting Stripe again", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          id: "acct_probe_cached"
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          deleted: true
        })
      });

    const firstResult = await checkStripeConnectEnabled();
    const fetchCallCountAfterFirstResult = fetchMock.mock.calls.length;
    const secondResult = await checkStripeConnectEnabled();

    expect(firstResult.ok).toBe(true);
    expect(secondResult.ok).toBe(true);
    expect(fetchCallCountAfterFirstResult).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns the thrown message when the Connect probe fetch fails", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    const result = await checkStripeConnectEnabled();

    expect(result.ok).toBe(false);
    expect(result.error).toContain("network down");
  });

  it("returns a missing key error when the Connect probe has no Stripe secret", async () => {
    delete process.env.STRIPE_SECRET_KEY;

    const result = await checkStripeConnectEnabled();

    expect(result).toMatchObject({
      ok: false,
      latencyMs: 0,
      error: "STRIPE_SECRET_KEY not set"
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marks the probe unhealthy when the delete request throws", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          id: "acct_probe_delete_throw"
        })
      })
      .mockRejectedValueOnce(new Error("delete transport down"));

    const result = await checkStripeConnectEnabled();

    expect(result).toMatchObject({
      ok: false,
      error: "Stripe Connect probe cleanup could not be confirmed"
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[health] failed to confirm deletion of Stripe Connect probe account",
      "acct_probe_delete_throw",
      "delete transport down"
    );
  });

  it("returns healthy when Stripe has an active webhook on the configured host", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        data: [{ url: "https://domusbase.com/api/webhooks/stripe", status: "enabled" }]
      })
    });

    const result = await checkStripeWebhookRegistered();

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.stripe.com/v1/webhook_endpoints?limit=20",
      {
        headers: { Authorization: "Bearer sk_test_123" },
        cache: "no-store"
      }
    );
  });

  it("treats disabled webhook endpoints on the configured host as unhealthy", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        data: [{ url: "https://domusbase.com/api/webhooks/stripe", status: "disabled" }]
      })
    });

    const result = await checkStripeWebhookRegistered();

    expect(result.ok).toBe(false);
    expect(result.error).toContain("No active webhook endpoint");
  });

  it("returns unhealthy when no webhook endpoint matches the configured host", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        data: [{ url: "https://other.example.com/api/webhooks/stripe", status: "enabled" }]
      })
    });

    const result = await checkStripeWebhookRegistered();

    expect(result.ok).toBe(false);
    expect(result.error).toContain("No active webhook endpoint");
  });

  it("returns a missing URL error when the webhook check has no app URL configured", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;

    const result = await checkStripeWebhookRegistered();

    expect(result).toMatchObject({
      ok: false,
      latencyMs: 0,
      error: "NEXT_PUBLIC_APP_URL not set"
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns healthy when Resend is configured", () => {
    process.env.RESEND_API_KEY = "re_123";
    process.env.RESEND_FROM_EMAIL = "ops@domusbase.com";

    const result = checkResendConfigured();

    expect(result).toEqual({
      ok: true,
      latencyMs: 0
    });
  });

  it("reports the missing from address when only the Resend API key is set", () => {
    process.env.RESEND_API_KEY = "re_123";
    delete process.env.RESEND_FROM_EMAIL;

    const result = checkResendConfigured();

    expect(result.ok).toBe(false);
    expect(result.error).toContain("RESEND_FROM_EMAIL");
  });

  it("reports the missing Resend API key when only the from address is set", () => {
    delete process.env.RESEND_API_KEY;
    process.env.RESEND_FROM_EMAIL = "ops@domusbase.com";

    const result = checkResendConfigured();

    expect(result.ok).toBe(false);
    expect(result.error).toContain("RESEND_API_KEY");
  });

  it("reports all missing Resend env vars when neither is set", () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;

    const result = checkResendConfigured();

    expect(result.ok).toBe(false);
    expect(result.error).toContain("RESEND_API_KEY");
    expect(result.error).toContain("RESEND_FROM_EMAIL");
  });

  it("buildHealthPayload marks the response unhealthy when critical env vars are missing", () => {
    const payload = buildHealthPayload({
      supabase: { ok: true, latencyMs: 10 },
      stripe: { ok: true, latencyMs: 20 },
      env: {
        NEXT_PUBLIC_SUPABASE_URL: true,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: false,
        NEXT_PUBLIC_ENABLE_ANALYTICS: false,
        SUPABASE_SERVICE_ROLE_KEY: true,
        STRIPE_SECRET_KEY: true,
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: true,
        STRIPE_WEBHOOK_SECRET: true,
        CRON_SECRET: true,
        HEALTH_CHECK_SECRET: false,
        RESEND_API_KEY: true,
        RESEND_FROM_EMAIL: true,
        PLATFORM_ALERT_EMAIL: true,
        ANTHROPIC_API_KEY: true,
        PLAID_CLIENT_ID: true,
        PLAID_SECRET: true,
        PLAID_ENV: true
      },
      timestamp: "2026-03-15T00:00:00.000Z"
    });

    expect(payload.ok).toBe(false);
    expect(payload.timestamp).toBe("2026-03-15T00:00:00.000Z");
  });
});
