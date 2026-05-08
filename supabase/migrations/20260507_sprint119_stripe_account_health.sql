-- Sprint 119: track Stripe Connect account health from a daily cron
ALTER TABLE ownership_accounts
  ADD COLUMN IF NOT EXISTS stripe_last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_status text;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_status text;

-- Partial indexes — only the unhealthy rows need to be findable cheaply
CREATE INDEX IF NOT EXISTS idx_ownership_accounts_stripe_unhealthy
  ON ownership_accounts (id)
  WHERE stripe_status IN ('restricted', 'missing');

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_unhealthy
  ON profiles (id)
  WHERE stripe_status IN ('restricted', 'missing');
