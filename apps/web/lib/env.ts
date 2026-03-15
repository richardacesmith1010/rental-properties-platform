export function getEnvStatus() {
  return {
    NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    STRIPE_SECRET_KEY: Boolean(process.env.STRIPE_SECRET_KEY),
    STRIPE_WEBHOOK_SECRET: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    CRON_SECRET: Boolean(process.env.CRON_SECRET),
    PLAID_CLIENT_ID: Boolean(process.env.PLAID_CLIENT_ID),
    PLAID_SECRET: Boolean(process.env.PLAID_SECRET),
    PLAID_ENV: Boolean(process.env.PLAID_ENV)
  };
}
