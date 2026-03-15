import { NextResponse } from "next/server";
import {
  detectExpiredLeases,
  generateMonthlyChargesForAllOwnersWithClient,
  processAutopayCharges,
  sendDelinquencyEscalations,
  sendLeaseExpirationWarnings,
  sendRentDueReminders
} from "@/lib/charges";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type CronRunStatus = "running" | "success" | "partial_failure" | "failure";

type OperationStatus = "success" | "failed" | "skipped";

interface OperationResult {
  name: string;
  status: OperationStatus;
  result?: unknown;
  error?: string;
  durationMs: number;
}

function getBearerToken(authHeader: string | null) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice("Bearer ".length).trim();
}

async function runOperation(name: string, fn: () => Promise<unknown>): Promise<OperationResult> {
  const start = Date.now();

  try {
    const result = await fn();
    return {
      name,
      status: "success",
      result,
      durationMs: Date.now() - start
    };
  } catch (error) {
    console.error(`${name} failed:`, error);
    return {
      name,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - start
    };
  }
}

async function createCronRunRecord(startedAt: string): Promise<string | null> {
  try {
    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from("cron_runs")
      .insert({
        job_name: "generate-charges",
        started_at: startedAt,
        status: "running",
        operations: []
      })
      .select("id")
      .maybeSingle();

    if (error) {
      if (!isMissingSchemaError(error)) {
        console.error("createCronRunRecord error:", error);
      }
      return null;
    }

    return data?.id ?? null;
  } catch (error) {
    console.error("createCronRunRecord unexpected error:", error);
    return null;
  }
}

async function updateCronRunRecord(
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
      console.error("updateCronRunRecord error:", error);
    }
  } catch (error) {
    console.error("updateCronRunRecord unexpected error:", error);
  }
}

async function pruneCronRunHistory() {
  try {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const adminClient = createAdminClient();
    const { error } = await adminClient.from("cron_runs").delete().lt("started_at", cutoff);

    if (error && !isMissingSchemaError(error)) {
      console.error("pruneCronRunHistory error:", error);
    }
  } catch (error) {
    console.error("pruneCronRunHistory unexpected error:", error);
  }
}

function deriveCronRunStatus(operations: OperationResult[]): CronRunStatus {
  const failedCount = operations.filter((operation) => operation.status === "failed").length;

  if (failedCount === 0) {
    return "success";
  }

  if (failedCount === operations.length) {
    return "failure";
  }

  return "partial_failure";
}

function getLegacyOperationSummary(operation: OperationResult, fallback: string) {
  if (operation.status === "success") {
    return operation.result ?? fallback;
  }

  return fallback;
}

export async function GET(request: Request) {
  const configuredSecret = process.env.CRON_SECRET;
  const token =
    getBearerToken(request.headers.get("authorization")) ?? request.headers.get("x-cron-secret");

  if (!configuredSecret || token !== configuredSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date().toISOString();
  let cronRunId: string | null = null;

  try {
    const adminClient = createAdminClient();
    cronRunId = await createCronRunRecord(startedAt);

    const operations: OperationResult[] = [];

    operations.push(
      await runOperation("generate-charges", () =>
        generateMonthlyChargesForAllOwnersWithClient(adminClient)
      )
    );
    operations.push(await runOperation("process-autopay", () => processAutopayCharges(adminClient)));
    operations.push(
      await runOperation("detect-expired-leases", () => detectExpiredLeases(adminClient))
    );
    operations.push(
      await runOperation("lease-expiration-warnings", () => sendLeaseExpirationWarnings(adminClient))
    );
    operations.push(
      await runOperation("delinquency-escalations", () => sendDelinquencyEscalations(adminClient))
    );
    operations.push(
      await runOperation("rent-due-reminders", () => sendRentDueReminders(adminClient))
    );

    const status = deriveCronRunStatus(operations);
    const completedAt = new Date().toISOString();
    const failedCount = operations.filter((operation) => operation.status === "failed").length;

    await updateCronRunRecord(cronRunId, {
      completed_at: completedAt,
      status,
      operations,
      error: failedCount > 0 ? `${failedCount}/${operations.length} operations failed` : null
    });
    await pruneCronRunHistory();

    const [summaryOp, autopayOp, expirationOp, warningOp, delinquencyOp, reminderOp] = operations;

    return NextResponse.json({
      ok: status === "success",
      status,
      summary: getLegacyOperationSummary(summaryOp, "Charge generation failed"),
      autopaySummary: getLegacyOperationSummary(autopayOp, "Autopay failed"),
      expirationSummary: getLegacyOperationSummary(expirationOp, "Expired lease check failed"),
      warningSummary: getLegacyOperationSummary(warningOp, "Expiration warnings failed"),
      delinquencySummary: getLegacyOperationSummary(
        delinquencyOp,
        "Delinquency escalations failed"
      ),
      reminderSummary: getLegacyOperationSummary(reminderOp, "Reminders failed"),
      operations,
      startedAt,
      completedAt
    });
  } catch (error) {
    const completedAt = new Date().toISOString();

    await updateCronRunRecord(cronRunId, {
      completed_at: completedAt,
      status: "failure",
      operations: [],
      error: error instanceof Error ? error.message : "Cron charge generation failed."
    });

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Cron charge generation failed.",
        status: "failure",
        operations: [],
        startedAt,
        completedAt
      },
      { status: 500 }
    );
  }
}
