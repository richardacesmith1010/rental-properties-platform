-- Sprint 33: Plaid Integration — Add Plaid columns to ownership_accounts

ALTER TABLE ownership_accounts
  ADD COLUMN IF NOT EXISTS plaid_access_token text,
  ADD COLUMN IF NOT EXISTS plaid_item_id text,
  ADD COLUMN IF NOT EXISTS plaid_account_id text,
  ADD COLUMN IF NOT EXISTS plaid_bank_name text,
  ADD COLUMN IF NOT EXISTS plaid_bank_mask text,
  ADD COLUMN IF NOT EXISTS plaid_balance_cents integer,
  ADD COLUMN IF NOT EXISTS plaid_balance_updated_at timestamptz;

-- No new RLS needed — existing ownership_accounts policies cover these columns.
-- IMPORTANT: plaid_access_token must NEVER be selected in client-facing queries.
-- Only server actions via createAdminClient() should read it.
