function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function warnEnv(name: string): string | undefined {
  const value = process.env[name];
  if (!value && typeof window === "undefined") {
    console.warn(`[env] Warning: ${name} is not set. Related features will be unavailable.`);
  }
  return value ?? undefined;
}

export function validateEnv() {
  return {
    NEXT_PUBLIC_SUPABASE_URL: requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    SUPABASE_SERVICE_ROLE_KEY: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    STRIPE_SECRET_KEY: warnEnv("STRIPE_SECRET_KEY"),
    STRIPE_WEBHOOK_SECRET: warnEnv("STRIPE_WEBHOOK_SECRET"),
    CRON_SECRET: warnEnv("CRON_SECRET")
  };
}

export function getEnvStatus() {
  return {
    NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    STRIPE_SECRET_KEY: Boolean(process.env.STRIPE_SECRET_KEY),
    STRIPE_WEBHOOK_SECRET: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    CRON_SECRET: Boolean(process.env.CRON_SECRET)
  };
}
