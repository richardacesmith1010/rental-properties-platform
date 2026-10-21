create unique index if not exists notification_deliveries_email_once
  on public.notification_deliveries (notification_id, channel, coalesce(email_key, ''))
  where channel = 'email';

-- Rollback:
-- drop index if exists notification_deliveries_email_once;
