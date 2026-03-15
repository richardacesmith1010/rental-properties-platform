-- Sprint 39: Cron run observability
CREATE TABLE IF NOT EXISTS cron_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL DEFAULT 'generate-charges',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL CHECK (status IN ('running', 'success', 'partial_failure', 'failure')),
  operations jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cron_runs_started_at ON cron_runs (started_at DESC);

ALTER TABLE cron_runs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE cron_runs IS 'Stores cron job execution history for operational monitoring. Auto-prune rows older than 90 days.';
