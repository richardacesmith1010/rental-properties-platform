BEGIN;

-- Distribution change requests
CREATE TABLE IF NOT EXISTS distribution_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ownership_account_id uuid NOT NULL REFERENCES ownership_accounts(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES profiles(id),
  current_config jsonb NOT NULL DEFAULT '{}',
  proposed_config jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  votes_required integer NOT NULL DEFAULT 1,
  votes_received integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX idx_dist_change_req_account ON distribution_change_requests(ownership_account_id);
CREATE INDEX idx_dist_change_req_status ON distribution_change_requests(status);

ALTER TABLE distribution_change_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view their account requests"
  ON distribution_change_requests FOR SELECT
  USING (
    ownership_account_id IN (
      SELECT account_id FROM ownership_account_members WHERE profile_id = auth.uid() AND active = true
    )
  );
CREATE POLICY "Members can insert requests for their accounts"
  ON distribution_change_requests FOR INSERT
  WITH CHECK (
    requested_by = auth.uid()
    AND ownership_account_id IN (
      SELECT account_id FROM ownership_account_members WHERE profile_id = auth.uid() AND active = true
    )
  );

-- Distribution change votes
CREATE TABLE IF NOT EXISTS distribution_change_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES distribution_change_requests(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL REFERENCES profiles(id),
  vote text NOT NULL CHECK (vote IN ('approve', 'reject')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(request_id, voter_id)
);

CREATE INDEX idx_dist_change_votes_request ON distribution_change_votes(request_id);

ALTER TABLE distribution_change_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view votes on their account requests"
  ON distribution_change_votes FOR SELECT
  USING (
    request_id IN (
      SELECT r.id FROM distribution_change_requests r
      JOIN ownership_account_members m ON m.account_id = r.ownership_account_id
      WHERE m.profile_id = auth.uid() AND m.active = true
    )
  );
CREATE POLICY "Members can insert their own vote"
  ON distribution_change_votes FOR INSERT
  WITH CHECK (voter_id = auth.uid());

-- Withdrawal requests
CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ownership_account_id uuid NOT NULL REFERENCES ownership_accounts(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES profiles(id),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'completed')),
  votes_required integer NOT NULL DEFAULT 1,
  votes_received integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX idx_withdrawal_req_account ON withdrawal_requests(ownership_account_id);
CREATE INDEX idx_withdrawal_req_status ON withdrawal_requests(status);

ALTER TABLE withdrawal_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view their account withdrawals"
  ON withdrawal_requests FOR SELECT
  USING (
    ownership_account_id IN (
      SELECT account_id FROM ownership_account_members WHERE profile_id = auth.uid() AND active = true
    )
  );
CREATE POLICY "Members can insert withdrawal requests"
  ON withdrawal_requests FOR INSERT
  WITH CHECK (
    requested_by = auth.uid()
    AND ownership_account_id IN (
      SELECT account_id FROM ownership_account_members WHERE profile_id = auth.uid() AND active = true
    )
  );

-- Withdrawal votes
CREATE TABLE IF NOT EXISTS withdrawal_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES withdrawal_requests(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL REFERENCES profiles(id),
  vote text NOT NULL CHECK (vote IN ('approve', 'reject')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(request_id, voter_id)
);

CREATE INDEX idx_withdrawal_votes_request ON withdrawal_votes(request_id);

ALTER TABLE withdrawal_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view votes on their account withdrawals"
  ON withdrawal_votes FOR SELECT
  USING (
    request_id IN (
      SELECT r.id FROM withdrawal_requests r
      JOIN ownership_account_members m ON m.account_id = r.ownership_account_id
      WHERE m.profile_id = auth.uid() AND m.active = true
    )
  );
CREATE POLICY "Members can insert their own vote"
  ON withdrawal_votes FOR INSERT
  WITH CHECK (voter_id = auth.uid());

COMMIT;
