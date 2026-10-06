import { isMissingSchemaError } from "@/lib/supabase-errors";
import { createAdminClient } from "@/lib/supabase/admin";

export type CronRunStatus = "running" | "success" | "partial_failure" | "failure";

type OperationStatus = "success" | "failed" | "skipped";

interface OperationResult {
  name: string;
  status: OperationStatus;
  result?: unknown;
  error?: string;
  durationMs: number;
}

export async function createCronRunRecord(jobName: string, startedAt: string): Promise<string | null> {
  try {
    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from("cron_runs")
      .insert({
        job_name: jobName,
        started_at: startedAt,
        status: "running",
        operations: []
      })
      .select("id")
      .maybeSingle();

    if (error) {
      if (!isMissingSchemaError(error)) {
        console.error("createCronRunRecord error");
      }
      return null;
    }

    return data?.id ?? null;
  } catch {
    console.error("createCronRunRecord unexpected error");
    return null;
  }
}

export async function updateCronRunRecord(
  id: string | null,
  values: {
    completed_at: string;
    status: CronRunStatus;
    operations: OperationResult[];
    error: string | null;
  }
) {
  if (!id) {
    return;
  }

  try {
    const adminClient = createAdminClient();
    const { error } = await adminClient.from("cron_runs").update(values).eq("id", id);

    if (error && !isMissingSchemaError(error)) {
      console.error("updateCronRunRecord error");
    }
  } catch {
    console.error("updateCronRunRecord unexpected error");
  }
}
