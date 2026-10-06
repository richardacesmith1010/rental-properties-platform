import { describe, expect, it } from "vitest";
import { buildCronHealthPayload, type CronRunForHealth } from "@/lib/cron-health";

const now = new Date("2026-10-06T13:30:00.000Z");

function runs(hoursAgo: number, status = "success"): CronRunForHealth[] {
  return ["generate-charges", "verify-stripe-accounts"].map((job_name) => ({
    job_name,
    status,
    completed_at: new Date(now.getTime() - hoursAgo * 60 * 60 * 1000).toISOString()
  }));
}

describe("cron health freshness", () => {
  it("reports fresh successful runs", () => {
    const payload = buildCronHealthPayload(runs(1), now);
    expect(payload.ok).toBe(true);
    expect(payload.jobs.every((job) => job.stale === false && job.ageHours === 1)).toBe(true);
  });

  it("keeps 25 hour runs fresh", () => {
    expect(buildCronHealthPayload(runs(25), now).jobs.every((job) => !job.stale)).toBe(true);
  });

  it("marks 27 hour runs stale", () => {
    const payload = buildCronHealthPayload(runs(27), now);
    expect(payload.ok).toBe(false);
    expect(payload.jobs.every((job) => job.stale && job.ageHours === 27)).toBe(true);
  });

  it("marks jobs with no runs stale", () => {
    const payload = buildCronHealthPayload([], now);
    expect(payload.ok).toBe(false);
    expect(payload.jobs.every((job) => job.stale && job.lastSuccessAt === null && job.ageHours === null)).toBe(true);
  });

  it("does not count failed-only runs as successful", () => {
    const payload = buildCronHealthPayload(runs(1, "failure"), now);
    expect(payload.ok).toBe(false);
    expect(payload.jobs.every((job) => job.stale && job.lastSuccessAt === null)).toBe(true);
  });
});
