export function getEnvStatus() {
  return {
    NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    STRIPE_SECRET_KEY: Boolean(process.env.STRIPE_SECRET_KEY),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
    STRIPE_WEBHOOK_SECRET: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    CRON_SECRET: Boolean(process.env.CRON_SECRET),
    RESEND_API_KEY: Boolean(process.env.RESEND_API_KEY),
    RESEND_FROM_EMAIL: Boolean(process.env.RESEND_FROM_EMAIL),
    PLAID_CLIENT_ID: Boolean(process.env.PLAID_CLIENT_ID),
    PLAID_SECRET: Boolean(process.env.PLAID_SECRET),
    PLAID_ENV: Boolean(process.env.PLAID_ENV)
  };
}

export function isStripeConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  );
}

export interface EnvSummaryGroup {
  configured: boolean;
  vars: Record<string, boolean>;
  mode?: "test" | "live";
}

export interface EnvSummary {
  supabase: EnvSummaryGroup;
  stripe: EnvSummaryGroup;
  email: EnvSummaryGroup;
  plaid: EnvSummaryGroup;
  cron: EnvSummaryGroup;
}

export function getEnvSummary(): EnvSummary {
  return {
    supabase: {
      configured: Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
          process.env.SUPABASE_SERVICE_ROLE_KEY
      ),
      vars: {
        NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
        NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
        SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
      }
    },
    stripe: {
      configured: Boolean(
        process.env.STRIPE_SECRET_KEY && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
      ),
      mode: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test_")
        ? "test"
        : "live",
      vars: {
        STRIPE_SECRET_KEY: Boolean(process.env.STRIPE_SECRET_KEY),
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
        STRIPE_WEBHOOK_SECRET: Boolean(process.env.STRIPE_WEBHOOK_SECRET)
      }
    },
    email: {
      configured: Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL),
      vars: {
        RESEND_API_KEY: Boolean(process.env.RESEND_API_KEY),
        RESEND_FROM_EMAIL: Boolean(process.env.RESEND_FROM_EMAIL)
      }
    },
    plaid: {
      configured: Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET),
      vars: {
        PLAID_CLIENT_ID: Boolean(process.env.PLAID_CLIENT_ID),
        PLAID_SECRET: Boolean(process.env.PLAID_SECRET),
        PLAID_ENV: Boolean(process.env.PLAID_ENV)
      }
    },
    cron: {
      configured: Boolean(process.env.CRON_SECRET),
      vars: {
        CRON_SECRET: Boolean(process.env.CRON_SECRET)
      }
    }
  };
}
