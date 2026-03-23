ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS notification_preferences JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS notifications_paused_until TIMESTAMPTZ;
