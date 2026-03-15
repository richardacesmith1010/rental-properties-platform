BEGIN;

ALTER TABLE ownership_accounts
  ADD COLUMN IF NOT EXISTS stripe_account_id text,
  ADD COLUMN IF NOT EXISTS stripe_onboarding_complete boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS distribution_mode text NOT NULL DEFAULT 'retain'
    CHECK (distribution_mode IN ('retain', 'split_equal', 'split_custom'));

CREATE INDEX IF NOT EXISTS idx_ownership_accounts_stripe
  ON ownership_accounts(stripe_account_id)
  WHERE stripe_account_id IS NOT NULL;

ALTER TABLE ownership_account_members
  DROP CONSTRAINT IF EXISTS ownership_account_members_member_role_check;

ALTER TABLE ownership_account_members
  ADD CONSTRAINT ownership_account_members_member_role_check
  CHECK (member_role IN ('admin', 'owner', 'member', 'viewer'));

ALTER TABLE ownership_account_members
  ADD COLUMN IF NOT EXISTS distribution_pct numeric(5,2) DEFAULT NULL
    CHECK (distribution_pct IS NULL OR (distribution_pct >= 0 AND distribution_pct <= 100)),
  ADD COLUMN IF NOT EXISTS payout_stripe_account_id text DEFAULT NULL;

UPDATE ownership_accounts oa
SET
  stripe_account_id = p.stripe_account_id,
  stripe_onboarding_complete = COALESCE(p.stripe_onboarding_complete, false)
FROM profiles p
WHERE oa.created_by_profile_id = p.id
  AND oa.account_type = 'individual'
  AND oa.stripe_account_id IS NULL
  AND p.stripe_account_id IS NOT NULL;

COMMIT;
