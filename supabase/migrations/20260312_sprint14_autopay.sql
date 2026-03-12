-- Sprint 14: Tenant Autopay
-- Applied via Supabase MCP on 2026-03-12

-- Stripe Customer ID for tenants (needed for saved payment methods)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;

-- Autopay enrollment per lease
CREATE TABLE IF NOT EXISTS autopay_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id uuid NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  tenant_profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stripe_payment_method_id text NOT NULL,
  payment_method_type text NOT NULL DEFAULT 'card',
  last4 text NOT NULL,
  brand text,
  enabled boolean NOT NULL DEFAULT true,
  retry_count integer NOT NULL DEFAULT 0,
  last_failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(lease_id)
);

-- RLS: tenant can see/manage their own enrollments
ALTER TABLE autopay_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants can view own enrollments"
  ON autopay_enrollments FOR SELECT
  USING (tenant_profile_id = auth.uid());

CREATE POLICY "Tenants can insert own enrollments"
  ON autopay_enrollments FOR INSERT
  WITH CHECK (tenant_profile_id = auth.uid());

CREATE POLICY "Tenants can update own enrollments"
  ON autopay_enrollments FOR UPDATE
  USING (tenant_profile_id = auth.uid());

CREATE POLICY "Tenants can delete own enrollments"
  ON autopay_enrollments FOR DELETE
  USING (tenant_profile_id = auth.uid());

-- Service role needs full access for cron/webhook operations
CREATE POLICY "Service role full access on autopay_enrollments"
  ON autopay_enrollments FOR ALL
  USING (auth.role() = 'service_role');
