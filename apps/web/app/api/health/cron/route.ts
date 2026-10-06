import { NextResponse } from "next/server";
import { buildCronHealthPayload, CRON_HEALTH_JOBS, type CronRunForHealth } from "@/lib/cron-health";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };
const unavailable = { ok: false, error: "Cron health check unavailable." };

export async function GET() {
  try {
    const admin = createAdminClient();
    const results = await Promise.all(
      CRON_HEALTH_JOBS.map((job) =>
        admin
          .from("cron_runs")
          .select("job_name,status,completed_at")
          .eq("job_name", job)
          .eq("status", "success")
          .order("completed_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      )
    );

    if (results.some((result) => result.error)) {
      return NextResponse.json(unavailable, { status: 503, headers });
    }

    const runs = results.flatMap((result) => (result.data ? [result.data as CronRunForHealth] : []));
    const payload = buildCronHealthPayload(runs);
    return NextResponse.json(payload, { status: payload.ok ? 200 : 503, headers });
  } catch {
    return NextResponse.json(unavailable, { status: 503, headers });
  }
}
