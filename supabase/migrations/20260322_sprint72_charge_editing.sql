ALTER TABLE rent_charges ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE rent_charges ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE rent_charges DROP CONSTRAINT IF EXISTS rent_charges_status_check;
ALTER TABLE rent_charges ADD CONSTRAINT rent_charges_status_check
  CHECK (status IN ('pending', 'paid', 'late', 'waived'));

CREATE TABLE IF NOT EXISTS charge_edit_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_id UUID NOT NULL REFERENCES rent_charges(id) ON DELETE CASCADE,
  edited_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_charge_edit_history_charge_id
  ON charge_edit_history(charge_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rent_charges_deleted_at
  ON rent_charges(deleted_at);

ALTER TABLE charge_edit_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Property owners can view charge edits" ON charge_edit_history;
CREATE POLICY "Property owners can view charge edits" ON charge_edit_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM rent_charges rc
      JOIN leases l ON l.id = rc.lease_id
      JOIN units u ON u.id = l.unit_id
      JOIN properties p ON p.id = u.property_id
      WHERE rc.id = charge_id
        AND (
          p.owner_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM property_managers pm
            WHERE pm.property_id = p.id
              AND pm.profile_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "Property owners can insert charge edits" ON charge_edit_history;
CREATE POLICY "Property owners can insert charge edits" ON charge_edit_history
  FOR INSERT WITH CHECK (edited_by = auth.uid());
