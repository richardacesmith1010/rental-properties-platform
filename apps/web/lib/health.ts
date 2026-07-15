import { getEnvStatus } from "@/lib/env";
import {
  buildExpressAccountParams,
  buildExpressAccountRequestBody,
  getDefaultExpressAccountBusinessProfileUrl
} from "@/lib/stripe-connect";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ServiceHealth {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export interface HealthResponsePayload {
  ok: boolean;
  services: {
    supabase: ServiceHealth;
    stripe: ServiceHealth;
  };
  env: ReturnType<typeof getEnvStatus>;
  timestamp: string;
}

const STRIPE_CONNECT_CHECK_CACHE_TTL_MS = 60 * 60 * 1000;
const STRIPE_CONNECT_ERROR_MAX_CHARS = 200;
const STRIPE_CONNECT_PROBE_CLEANUP_ERROR = "Stripe Connect probe cleanup could not be confirmed";

let stripeConnectCheckCache:
  | {
      checkedAt: number;
      secretKey: string;
      result: Omit<ServiceHealth, "latencyMs"> & { latencyMs: number };
    }
  | null = null;

function truncateStripeMessage(message: string, limit = STRIPE_CONNECT_ERROR_MAX_CHARS): string {
  if (message.length <= limit) {
    return message;
  }

  return `${message.slice(0, limit - 1).trimEnd()}…`;
}

async function readStripeErrorMessage(response: Pick<Response, "text">): Promise<string> {
  const text = await response.text();

  try {
    const parsed = JSON.parse(text) as {
      error?: {
        message?: string;
      };
    };
    const message = parsed.error?.message;

    if (typeof message === "string" && message.length > 0) {
      return truncateStripeMessage(message);
    }
  } catch {
    // Fall back to the raw body when Stripe did not return JSON.
  }

  return truncateStripeMessage(text);
}

function formatStripeConnectProbeCleanupError(error: unknown): string {
  if (error instanceof Error) {
    return truncateStripeMessage(error.message);
  }

  return "Unknown error";
}

async function confirmStripeConnectProbeDeletion(secretKey: string, accountId: string): Promise<boolean> {
  try {
    const deleteResponse = await fetch(`https://api.stripe.com/v1/accounts/${accountId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${secretKey}`
      },
      cache: "no-store"
    });

    if (!deleteResponse.ok) {
      console.error(
        "[health] failed to confirm deletion of Stripe Connect probe account",
        accountId,
        deleteResponse.status,
        await readStripeErrorMessage(deleteResponse)
      );
      return false;
    }

    const json = (await deleteResponse.json()) as {
      deleted?: boolean;
    };

    if (json.deleted !== true) {
      console.error(
        "[health] failed to confirm deletion of Stripe Connect probe account",
        accountId,
        "deleted flag missing or false"
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error(
      "[health] failed to confirm deletion of Stripe Connect probe account",
      accountId,
      formatStripeConnectProbeCleanupError(error)
    );
    return false;
  }
}

function getCachedStripeConnectResult(secretKey: string): ServiceHealth | null {
  if (!stripeConnectCheckCache) {
    return null;
  }

  if (stripeConnectCheckCache.secretKey !== secretKey) {
    return null;
  }

  if (Date.now() - stripeConnectCheckCache.checkedAt >= STRIPE_CONNECT_CHECK_CACHE_TTL_MS) {
    return null;
  }

  return {
    ...stripeConnectCheckCache.result,
    latencyMs: 0
  };
}

function setCachedStripeConnectResult(secretKey: string, result: ServiceHealth): ServiceHealth {
  stripeConnectCheckCache = {
    checkedAt: Date.now(),
    secretKey,
    result
  };

  return result;
}

export function resetStripeConnectCheckCache(): void {
  stripeConnectCheckCache = null;
}

export async function checkSupabase(): Promise<ServiceHealth> {
  const start = Date.now();

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("profiles").select("id").limit(1);

    return {
      ok: !error,
      latencyMs: Date.now() - start,
      error: error?.message
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

export async function checkStripe(): Promise<ServiceHealth> {
  const start = Date.now();
  const key = process.env.STRIPE_SECRET_KEY;

  if (!key) {
    return {
      ok: false,
      latencyMs: 0,
      error: "STRIPE_SECRET_KEY not set"
    };
  }

  try {
    const response = await fetch("https://api.stripe.com/v1/balance", {
      headers: {
        Authorization: `Bearer ${key}`
      },
      cache: "no-store"
    });

    return {
      ok: response.ok,
      latencyMs: Date.now() - start,
      error: response.ok ? undefined : `HTTP ${response.status}`
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

/**
 * Read-only Stripe signals can be false-green here: both GET /v1/accounts and
 * account.capabilities.transfers can succeed while live connected-account
 * creation is still blocked during Connect review. A probe create/delete is the
 * only trustworthy signal for whether onboarding can actually start.
 */
export async function checkStripeConnectEnabled(): Promise<ServiceHealth> {
  const key = process.env.STRIPE_SECRET_KEY;

  if (!key) {
    return {
      ok: false,
      latencyMs: 0,
      error: "STRIPE_SECRET_KEY not set"
    };
  }

  const cached = getCachedStripeConnectResult(key);
  if (cached) {
    return cached;
  }

  const start = Date.now();
  let probeAccountId: string | null = null;
  let result: ServiceHealth = {
    ok: false,
    latencyMs: 0,
    error: "Stripe Connect probe failed"
  };

  try {
    const params = buildExpressAccountParams(getDefaultExpressAccountBusinessProfileUrl());
    const body = buildExpressAccountRequestBody(params);

    const response = await fetch("https://api.stripe.com/v1/accounts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: body.toString(),
      cache: "no-store"
    });

    if (!response.ok) {
      result = {
        ok: false,
        latencyMs: Date.now() - start,
        error: await readStripeErrorMessage(response)
      };
    } else {
      const json = (await response.json()) as { id?: string };
      probeAccountId = typeof json.id === "string" && json.id.length > 0 ? json.id : null;

      if (!probeAccountId) {
        result = {
          ok: false,
          latencyMs: Date.now() - start,
          error: "Stripe did not return a probe account ID"
        };
      } else {
        result = {
          ok: true,
          latencyMs: Date.now() - start
        };
      }
    }
  } catch (error) {
    result = {
      ok: false,
      latencyMs: Date.now() - start,
      error: formatStripeConnectProbeCleanupError(error)
    };
  } finally {
    if (probeAccountId) {
      const cleanupConfirmed = await confirmStripeConnectProbeDeletion(key, probeAccountId);
      if (!cleanupConfirmed) {
        result = {
          ok: false,
          latencyMs: Date.now() - start,
          error: STRIPE_CONNECT_PROBE_CLEANUP_ERROR
        };
      }
    }
  }

  return setCachedStripeConnectResult(key, result);
}

/**
 * Verifies Stripe has an active webhook endpoint registered for our app host.
 */
export async function checkStripeWebhookRegistered(): Promise<ServiceHealth> {
  const start = Date.now();
  const key = process.env.STRIPE_SECRET_KEY;
  const expectedDomain = process.env.NEXT_PUBLIC_APP_URL;

  if (!key) {
    return {
      ok: false,
      latencyMs: 0,
      error: "STRIPE_SECRET_KEY not set"
    };
  }

  if (!expectedDomain) {
    return {
      ok: false,
      latencyMs: 0,
      error: "NEXT_PUBLIC_APP_URL not set"
    };
  }

  try {
    const expectedHost = new URL(expectedDomain).host;
    const response = await fetch("https://api.stripe.com/v1/webhook_endpoints?limit=20", {
      headers: {
        Authorization: `Bearer ${key}`
      },
      cache: "no-store"
    });

    if (!response.ok) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: `Stripe API error: HTTP ${response.status}`
      };
    }

    const json = (await response.json()) as {
      data?: Array<{ url: string; status?: string }>;
    };

    const matchingEndpoint = (json.data ?? []).find((endpoint) => {
      if (endpoint.status === "disabled") {
        return false;
      }

      try {
        return new URL(endpoint.url).host === expectedHost;
      } catch {
        return false;
      }
    });

    if (!matchingEndpoint) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: `No active webhook endpoint registered for ${expectedDomain}`
      };
    }

    return {
      ok: true,
      latencyMs: Date.now() - start
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

/**
 * Verifies the email provider is configured without making a network call.
 */
export function checkResendConfigured(): ServiceHealth {
  const missing: string[] = [];

  if (!process.env.RESEND_API_KEY) {
    missing.push("RESEND_API_KEY");
  }

  if (!process.env.RESEND_FROM_EMAIL) {
    missing.push("RESEND_FROM_EMAIL");
  }

  if (missing.length > 0) {
    return {
      ok: false,
      latencyMs: 0,
      error: `Missing env vars: ${missing.join(", ")}`
    };
  }

  return {
    ok: true,
    latencyMs: 0
  };
}

export function buildHealthPayload(params: {
  supabase: ServiceHealth;
  stripe: ServiceHealth;
  env?: ReturnType<typeof getEnvStatus>;
  timestamp?: string;
}): HealthResponsePayload {
  const env = params.env ?? getEnvStatus();
  const ok =
    params.supabase.ok &&
    params.stripe.ok &&
    env.NEXT_PUBLIC_SUPABASE_URL &&
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    env.SUPABASE_SERVICE_ROLE_KEY;

  return {
    ok,
    services: {
      supabase: params.supabase,
      stripe: params.stripe
    },
    env,
    timestamp: params.timestamp ?? new Date().toISOString()
  };
}
