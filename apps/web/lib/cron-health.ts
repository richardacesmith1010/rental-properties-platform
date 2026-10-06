export const CRON_HEALTH_JOBS = ["generate-charges", "verify-stripe-accounts"] as const;

export interface CronRunForHealth {
  job_name: string;
  status: string;
  completed_at: string | null;
}

const STALE_AFTER_HOURS = 26;
const HOUR_MS = 60 * 60 * 1000;

export function buildCronHealthPayload(runs: CronRunForHealth[], now = new Date()) {
  const nowMs = now.getTime();
  const jobs = CRON_HEALTH_JOBS.map((job) => {
    const latestSuccessMs = runs
      .filter((run) => run.job_name === job && run.status === "success" && run.completed_at)
      .reduce<number | null>((latest, run) => {
        const completedMs = Date.parse(run.completed_at!);
        return Number.isFinite(completedMs) && (latest === null || completedMs > latest) ? completedMs : latest;
      }, null);
    const ageHours = latestSuccessMs === null ? null : Math.max(0, (nowMs - latestSuccessMs) / HOUR_MS);

    return {
      job,
      lastSuccessAt: latestSuccessMs === null ? null : new Date(latestSuccessMs).toISOString(),
      ageHours,
      stale: ageHours === null || ageHours > STALE_AFTER_HOURS
    };
  });

  return { ok: jobs.every((job) => !job.stale), jobs };
}
