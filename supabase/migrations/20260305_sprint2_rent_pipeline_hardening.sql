-- Sprint 2: Rent Pipeline Hardening
-- Adds grace period, late fee config, charge categorization, and lease lifecycle status

-- 1. Lease-level grace period and late fee configuration
ALTER TABLE leases ADD COLUMN IF NOT EXISTS grace_period_days int NOT NULL DEFAULT 5;
ALTER TABLE leases ADD COLUMN IF NOT EXISTS late_fee_cents int NOT NULL DEFAULT 0;

-- 2. Charge categorization (rent vs late_fee)
ALTER TABLE rent_charges ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'rent';
ALTER TABLE rent_charges ADD COLUMN IF NOT EXISTS parent_charge_id uuid REFERENCES rent_charges(id) ON DELETE SET NULL;

-- Add check constraint for category values
DO $$ BEGIN
  ALTER TABLE rent_charges ADD CONSTRAINT rent_charges_category_check CHECK (category IN ('rent', 'late_fee'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Lease lifecycle status
ALTER TABLE leases ADD COLUMN IF NOT EXISTS lease_status text NOT NULL DEFAULT 'active';

DO $$ BEGIN
  ALTER TABLE leases ADD CONSTRAINT leases_lease_status_check CHECK (lease_status IN ('active', 'expiring_soon', 'expired', 'terminated', 'renewed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Index for efficient late-fee lookups (find late fees by parent charge)
CREATE INDEX IF NOT EXISTS idx_rent_charges_parent_charge_id ON rent_charges (parent_charge_id) WHERE parent_charge_id IS NOT NULL;

-- 5. Index for lease status lifecycle queries
CREATE INDEX IF NOT EXISTS idx_leases_lease_status ON leases (lease_status) WHERE active = true;
