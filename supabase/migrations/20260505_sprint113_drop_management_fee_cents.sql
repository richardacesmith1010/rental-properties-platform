-- Sprint 113: migrate legacy property management fees into manager payment configs

INSERT INTO manager_payment_configs (
  property_id,
  manager_profile_id,
  payment_type,
  flat_amount_cents,
  label,
  active
)
SELECT
  p.id AS property_id,
  pm.manager_profile_id,
  'flat' AS payment_type,
  p.management_fee_cents AS flat_amount_cents,
  'Property Management Fee' AS label,
  true AS active
FROM properties p
JOIN LATERAL (
  SELECT manager_profile_id
  FROM property_managers
  WHERE property_id = p.id
    AND active = true
  ORDER BY assigned_at DESC, manager_profile_id ASC
  LIMIT 1
) pm ON TRUE
WHERE p.management_fee_cents IS NOT NULL
  AND p.management_fee_cents > 0
  AND NOT EXISTS (
    SELECT 1
    FROM manager_payment_configs mpc
    WHERE mpc.property_id = p.id
      AND mpc.active = true
  )
ON CONFLICT (property_id, manager_profile_id) DO UPDATE
SET
  payment_type = EXCLUDED.payment_type,
  percentage_rate = NULL,
  flat_amount_cents = EXCLUDED.flat_amount_cents,
  base_rent_cents = NULL,
  label = EXCLUDED.label,
  active = EXCLUDED.active,
  updated_at = now();

ALTER TABLE properties DROP COLUMN IF EXISTS management_fee_cents;
