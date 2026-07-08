-- Sprint 125: self-sustaining keep-alive inside Supabase (no Vercel dependency)
--
-- Context: the project auto-paused after ~2 months because the Vercel
-- keep-alive cron (Sprint 106, /api/cron/keep-alive) never fired — Vercel
-- Hobby-plan crons are unreliable and CLI credentials had expired, so
-- nothing was generating API activity. This migration moves the heartbeat
-- INTO the database: pg_cron fires hourly, pg_net makes an async HTTP GET
-- to the app's public /api/health endpoint, which queries Supabase via the
-- service role -> genuine REST activity -> the free-tier inactivity pause
-- can never trigger while the app itself is up.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- cron.schedule upserts by job name, so re-running this migration is safe.
SELECT cron.schedule(
  'domus-keepalive-health-ping',
  '0 * * * *', -- hourly, on the hour
  $$
  SELECT net.http_get(
    url := 'https://domusbase.com/api/health',
    timeout_milliseconds := 10000
  );
  $$
);
