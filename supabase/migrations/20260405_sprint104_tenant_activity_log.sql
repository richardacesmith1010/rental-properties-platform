CREATE TABLE IF NOT EXISTS tenant_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES units(id) ON DELETE SET NULL,
  lease_id uuid REFERENCES leases(id) ON DELETE SET NULL,
  activity_type text NOT NULL CHECK (activity_type IN ('infraction', 'notice', 'warning', 'note')),
  title text NOT NULL CHECK (char_length(title) > 0 AND char_length(title) <= 200),
  description text DEFAULT '',
  created_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_activity_tenant
  ON tenant_activity_log (tenant_profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_activity_property
  ON tenant_activity_log (property_id, created_at DESC);

ALTER TABLE tenant_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_activity_log_property_scoped ON tenant_activity_log
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM properties p
      JOIN ownership_account_members oam ON p.owner_account_id = oam.account_id
      WHERE p.id = tenant_activity_log.property_id
        AND oam.profile_id = auth.uid()
        AND oam.active = true
    )
    OR EXISTS (
      SELECT 1
      FROM property_managers pm
      WHERE pm.property_id = tenant_activity_log.property_id
        AND pm.manager_profile_id = auth.uid()
        AND pm.active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM properties p
      JOIN ownership_account_members oam ON p.owner_account_id = oam.account_id
      WHERE p.id = tenant_activity_log.property_id
        AND oam.profile_id = auth.uid()
        AND oam.active = true
    )
    OR EXISTS (
      SELECT 1
      FROM property_managers pm
      WHERE pm.property_id = tenant_activity_log.property_id
        AND pm.manager_profile_id = auth.uid()
        AND pm.active = true
    )
  );
