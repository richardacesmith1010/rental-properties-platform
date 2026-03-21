-- Sprint 62: manager payments + property wizard metadata

ALTER TABLE IF EXISTS properties
  ADD COLUMN IF NOT EXISTS property_type TEXT CHECK (
    property_type IN ('single_family', 'duplex', 'triplex', 'apartment', 'condo', 'townhouse')
  );

ALTER TABLE IF EXISTS units
  ADD COLUMN IF NOT EXISTS square_feet INTEGER CHECK (square_feet IS NULL OR square_feet >= 0);

CREATE TABLE IF NOT EXISTS manager_payment_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  manager_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('percentage', 'flat')),
  percentage_rate NUMERIC(5,2),
  flat_amount_cents INTEGER,
  base_rent_cents INTEGER,
  label TEXT NOT NULL DEFAULT 'Property Management Fee',
  frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('monthly', 'biweekly', 'weekly')),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(property_id, manager_profile_id),
  CHECK (
    (payment_type = 'percentage' AND percentage_rate IS NOT NULL) OR
    (payment_type = 'flat' AND flat_amount_cents IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS manager_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  manager_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  config_id UUID REFERENCES manager_payment_configs(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN ('commission', 'reimbursement', 'custom')),
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  paid_at TIMESTAMPTZ,
  invoice_number TEXT,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_manager_payment_configs_property ON manager_payment_configs(property_id);
CREATE INDEX IF NOT EXISTS idx_manager_payment_configs_manager ON manager_payment_configs(manager_profile_id);
CREATE INDEX IF NOT EXISTS idx_manager_payments_property ON manager_payments(property_id);
CREATE INDEX IF NOT EXISTS idx_manager_payments_manager ON manager_payments(manager_profile_id);
CREATE INDEX IF NOT EXISTS idx_manager_payments_status ON manager_payments(status);
CREATE INDEX IF NOT EXISTS idx_manager_payments_date ON manager_payments(payment_date);

ALTER TABLE manager_payment_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE manager_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Property owner can manage payment configs" ON manager_payment_configs;
CREATE POLICY "Property owner can manage payment configs" ON manager_payment_configs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_id AND p.owner_profile_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_id AND p.owner_profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Manager can view own payment configs" ON manager_payment_configs;
CREATE POLICY "Manager can view own payment configs" ON manager_payment_configs
  FOR SELECT USING (manager_profile_id = auth.uid());

DROP POLICY IF EXISTS "Property owner can manage payments" ON manager_payments;
CREATE POLICY "Property owner can manage payments" ON manager_payments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_id AND p.owner_profile_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_id AND p.owner_profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Manager can view own payments" ON manager_payments;
CREATE POLICY "Manager can view own payments" ON manager_payments
  FOR SELECT USING (manager_profile_id = auth.uid());
