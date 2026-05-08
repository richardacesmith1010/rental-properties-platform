import { getEnvStatus } from "@/lib/env";
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
 * Detects whether Stripe Connect is enabled on the platform account.
 * Calls the non-destructive accounts list endpoint to confirm availability.
 */
export async function checkStripeConnectEnabled(): Promise<ServiceHealth> {
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
    const response = await fetch("https://api.stripe.com/v1/accounts?limit=1", {
      headers: {
        Authorization: `Bearer ${key}`
      },
      cache: "no-store"
    });

    if (response.ok) {
      return {
        ok: true,
        latencyMs: Date.now() - start
      };
    }

    const text = await response.text();
    if (/signed up for Connect/i.test(text)) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: "Stripe Connect not enabled — sign up at https://dashboard.stripe.com/connect"
      };
    }

    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: `Stripe API error: HTTP ${response.status}`
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
