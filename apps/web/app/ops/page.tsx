import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { OpsDashboard, type OpsCronRun } from "@/components/ops/ops-dashboard";
import { getEnvSummary } from "@/lib/env";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ops Status",
  description: "Operational readiness dashboard for Domus."
};

export default async function OpsPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();

  if (!profile || profile.role !== "owner") {
    redirect("/login");
  }

  const envSummary = getEnvSummary();
  let initialCronRuns: OpsCronRun[] = [];
  let cronWarning: string | null = null;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("cron_runs")
      .select("id, job_name, started_at, completed_at, status, operations, error")
      .order("started_at", { ascending: false })
      .limit(10);

    if (error) {
      if (isMissingSchemaError(error)) {
        cronWarning = "Cron history requires a database update.";
      } else {
        console.error("OpsPage cron history error:", error);
        cronWarning = "Unable to load cron history right now.";
      }
    } else {
      initialCronRuns = (data ?? []).map((run) => ({
        id: run.id,
        job_name: run.job_name,
        started_at: run.started_at,
        completed_at: run.completed_at,
        status: run.status,
        operations: Array.isArray(run.operations) ? run.operations : [],
        error: run.error ?? null
      }));
    }
  } catch (error) {
    console.error("OpsPage unexpected cron history error:", error);
    cronWarning = "Unable to load cron history right now.";
  }

  return (
    <OpsDashboard
      envSummary={envSummary}
      initialCronRuns={initialCronRuns}
      initialCronWarning={cronWarning}
    />
  );
}
