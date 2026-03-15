BEGIN;

CREATE TABLE IF NOT EXISTS account_rename_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ownership_account_id uuid NOT NULL REFERENCES ownership_accounts(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  proposed_name text NOT NULL,
  current_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  votes_required integer NOT NULL DEFAULT 1,
  votes_received integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS account_rename_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES account_rename_requests(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vote text NOT NULL CHECK (vote IN ('approve', 'reject')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(request_id, voter_id)
);

CREATE TABLE IF NOT EXISTS account_delete_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ownership_account_id uuid NOT NULL REFERENCES ownership_accounts(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  votes_required integer NOT NULL DEFAULT 1,
  votes_received integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS account_delete_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES account_delete_requests(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vote text NOT NULL CHECK (vote IN ('approve', 'reject')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(request_id, voter_id)
);

CREATE INDEX IF NOT EXISTS idx_account_rename_requests_account ON account_rename_requests(ownership_account_id);
CREATE INDEX IF NOT EXISTS idx_account_rename_requests_status ON account_rename_requests(status);
CREATE INDEX IF NOT EXISTS idx_account_rename_votes_request ON account_rename_votes(request_id);
CREATE INDEX IF NOT EXISTS idx_account_delete_requests_account ON account_delete_requests(ownership_account_id);
CREATE INDEX IF NOT EXISTS idx_account_delete_requests_status ON account_delete_requests(status);
CREATE INDEX IF NOT EXISTS idx_account_delete_votes_request ON account_delete_votes(request_id);

ALTER TABLE account_rename_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_rename_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_delete_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_delete_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view rename requests" ON account_rename_requests;
CREATE POLICY "Members can view rename requests" ON account_rename_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM ownership_account_members
      WHERE account_id = ownership_account_id
        AND profile_id = auth.uid()
        AND active = true
    )
  );

DROP POLICY IF EXISTS "Owner members can create rename requests" ON account_rename_requests;
CREATE POLICY "Owner members can create rename requests" ON account_rename_requests
  FOR INSERT WITH CHECK (
    requested_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM ownership_account_members
      WHERE account_id = ownership_account_id
        AND profile_id = auth.uid()
        AND active = true
        AND member_role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Members can view rename votes" ON account_rename_votes;
CREATE POLICY "Members can view rename votes" ON account_rename_votes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM account_rename_requests r
      JOIN ownership_account_members m ON m.account_id = r.ownership_account_id
      WHERE r.id = request_id
        AND m.profile_id = auth.uid()
        AND m.active = true
    )
  );

DROP POLICY IF EXISTS "Active members can vote on renames" ON account_rename_votes;
CREATE POLICY "Active members can vote on renames" ON account_rename_votes
  FOR INSERT WITH CHECK (
    voter_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM account_rename_requests r
      JOIN ownership_account_members m ON m.account_id = r.ownership_account_id
      WHERE r.id = request_id
        AND m.profile_id = auth.uid()
        AND m.active = true
    )
  );

DROP POLICY IF EXISTS "Members can view delete requests" ON account_delete_requests;
CREATE POLICY "Members can view delete requests" ON account_delete_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM ownership_account_members
      WHERE account_id = ownership_account_id
        AND profile_id = auth.uid()
        AND active = true
    )
  );

DROP POLICY IF EXISTS "Owner members can create delete requests" ON account_delete_requests;
CREATE POLICY "Owner members can create delete requests" ON account_delete_requests
  FOR INSERT WITH CHECK (
    requested_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM ownership_account_members
      WHERE account_id = ownership_account_id
        AND profile_id = auth.uid()
        AND active = true
        AND member_role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Members can view delete votes" ON account_delete_votes;
CREATE POLICY "Members can view delete votes" ON account_delete_votes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM account_delete_requests r
      JOIN ownership_account_members m ON m.account_id = r.ownership_account_id
      WHERE r.id = request_id
        AND m.profile_id = auth.uid()
        AND m.active = true
    )
  );

DROP POLICY IF EXISTS "Active members can vote on deletes" ON account_delete_votes;
CREATE POLICY "Active members can vote on deletes" ON account_delete_votes
  FOR INSERT WITH CHECK (
    voter_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM account_delete_requests r
      JOIN ownership_account_members m ON m.account_id = r.ownership_account_id
      WHERE r.id = request_id
        AND m.profile_id = auth.uid()
        AND m.active = true
    )
  );

DROP POLICY IF EXISTS "Requester can cancel rename request" ON account_rename_requests;
CREATE POLICY "Requester can cancel rename request" ON account_rename_requests
  FOR UPDATE USING (requested_by = auth.uid() AND status = 'pending')
  WITH CHECK (status = 'cancelled');

DROP POLICY IF EXISTS "Requester can cancel delete request" ON account_delete_requests;
CREATE POLICY "Requester can cancel delete request" ON account_delete_requests
  FOR UPDATE USING (requested_by = auth.uid() AND status = 'pending')
  WITH CHECK (status = 'cancelled');

COMMIT;
