-- Sprint 114: track when an ACH payment record was reversed due to async failure
ALTER TABLE payments ADD COLUMN IF NOT EXISTS reversed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_payments_reversed_at
  ON payments (reversed_at)
  WHERE reversed_at IS NOT NULL;
