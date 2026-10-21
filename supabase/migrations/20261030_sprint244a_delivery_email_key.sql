alter table public.notification_deliveries
  add column if not exists email_key text,
  add column if not exists claim_token uuid,
  add column if not exists first_attempt_at timestamptz,
  add column if not exists email_request_body text;

-- Rollback:
-- alter table public.notification_deliveries
--   drop column if exists email_request_body,
--   drop column if exists first_attempt_at,
--   drop column if exists claim_token,
--   drop column if exists email_key;
