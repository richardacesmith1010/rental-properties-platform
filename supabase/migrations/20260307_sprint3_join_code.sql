-- Sprint 3: Add join code to ownership accounts for LLC member sharing
ALTER TABLE ownership_accounts
  ADD COLUMN join_code text UNIQUE;

CREATE INDEX idx_ownership_accounts_join_code
  ON ownership_accounts (join_code)
  WHERE join_code IS NOT NULL;
