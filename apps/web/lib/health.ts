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
