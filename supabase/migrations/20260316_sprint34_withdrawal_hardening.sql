-- Sprint 34: Withdrawal Hardening — Add executing/failed statuses + stripe_transfer_id

-- Expand the status CHECK constraint to include 'executing' and 'failed' states
ALTER TABLE withdrawal_requests DROP CONSTRAINT IF EXISTS withdrawal_requests_status_check;
ALTER TABLE withdrawal_requests ADD CONSTRAINT withdrawal_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'completed', 'executing', 'failed'));

-- Persist Stripe transfer reference for audit trail
ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS stripe_transfer_id text;
