-- Sprint 12: Stripe Connect columns

-- Owners/managers each have a Stripe Express connected account
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_account_id text,
  ADD COLUMN IF NOT EXISTS stripe_onboarding_complete boolean DEFAULT false;

-- Track transfer details on payments
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS stripe_transfer_id text,
  ADD COLUMN IF NOT EXISTS manager_transfer_id text,
  ADD COLUMN IF NOT EXISTS platform_fee_cents integer DEFAULT 0;

-- Per-property management fee (cents per month, paid to manager)
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS management_fee_cents integer DEFAULT 0;
