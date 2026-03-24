CREATE TABLE IF NOT EXISTS llc_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ownership_account_id UUID NOT NULL REFERENCES ownership_accounts(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token UUID NOT NULL DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_llc_invitations_unique_pending
  ON llc_invitations(ownership_account_id, email)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_llc_invitations_token
  ON llc_invitations(token)
  WHERE status = 'pending';

ALTER TABLE llc_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "LLC members can view invitations" ON llc_invitations
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM ownership_account_members m
      WHERE m.account_id = ownership_account_id
        AND m.profile_id = auth.uid()
        AND m.active = true
    )
  );

CREATE POLICY "LLC admins can create invitations" ON llc_invitations
  FOR INSERT WITH CHECK (
    invited_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM ownership_account_members m
      WHERE m.account_id = ownership_account_id
        AND m.profile_id = auth.uid()
        AND m.active = true
        AND m.member_role IN ('owner', 'admin')
    )
  );

CREATE POLICY "LLC admins can update invitations" ON llc_invitations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM ownership_account_members m
      WHERE m.account_id = ownership_account_id
        AND m.profile_id = auth.uid()
        AND m.active = true
        AND m.member_role IN ('owner', 'admin')
    )
  );
