import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createAdminClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock
}));

import { GET } from "@/app/api/health/route";
import {
  buildHealthPayload,
  checkStripe,
  checkSupabase,
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
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      STRIPE_SECRET_KEY: "sk_test_123"
    };
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
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

  it("buildHealthPayload marks the response unhealthy when critical env vars are missing", () => {
    const payload = buildHealthPayload({
      supabase: { ok: true, latencyMs: 10 },
      stripe: { ok: true, latencyMs: 20 },
      env: {
        NEXT_PUBLIC_SUPABASE_URL: true,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: false,
        SUPABASE_SERVICE_ROLE_KEY: true,
        STRIPE_SECRET_KEY: true,
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: true,
        STRIPE_WEBHOOK_SECRET: true,
        CRON_SECRET: true,
        RESEND_API_KEY: true,
        RESEND_FROM_EMAIL: true,
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
