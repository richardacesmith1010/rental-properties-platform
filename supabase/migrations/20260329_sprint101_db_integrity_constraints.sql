-- Sprint 101: database integrity constraints for charges and leases.
-- Discovered lease_status values in the codebase: active, expiring_soon, expired, terminated, renewed.

CREATE UNIQUE INDEX IF NOT EXISTS uq_rent_charges_lease_due_category
  ON rent_charges (lease_id, due_date, category)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_rent_charges_parent_late_fee
  ON rent_charges (parent_charge_id)
  WHERE parent_charge_id IS NOT NULL
    AND deleted_at IS NULL
    AND category = 'late_fee';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_lease_active_status_consistency'
      AND conrelid = 'leases'::regclass
  ) THEN
    ALTER TABLE leases
      ADD CONSTRAINT chk_lease_active_status_consistency
      CHECK (
        (active = true AND lease_status IN ('active', 'expiring_soon'))
        OR (active = false AND lease_status IN ('terminated', 'expired', 'renewed'))
      );
  END IF;
END $$;
