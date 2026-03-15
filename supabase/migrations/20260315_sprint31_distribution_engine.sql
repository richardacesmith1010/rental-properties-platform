BEGIN;

CREATE TABLE IF NOT EXISTS payment_distributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES ownership_accounts(id),
  member_profile_id uuid NOT NULL REFERENCES profiles(id),
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  distribution_pct numeric(5,2),
  stripe_transfer_id text,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'failed', 'pending')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_distributions_payment ON payment_distributions(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_distributions_member ON payment_distributions(member_profile_id);
CREATE INDEX IF NOT EXISTS idx_payment_distributions_account ON payment_distributions(account_id);

ALTER TABLE payment_distributions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payment_distributions'
      AND policyname = 'distributions_select_own'
  ) THEN
    CREATE POLICY "distributions_select_own" ON payment_distributions
      FOR SELECT USING (
        member_profile_id = auth.uid()
        OR account_id IN (
          SELECT account_id FROM ownership_account_members
          WHERE profile_id = auth.uid() AND active = true
        )
      );
  END IF;
END $$;

COMMIT;
