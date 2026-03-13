import { NextResponse } from "next/server";
import {
  detectExpiredLeases,
  generateMonthlyChargesForAllOwnersWithClient,
  processAutopayCharges,
  sendLeaseExpirationWarnings,
  sendRentDueReminders
} from "@/lib/charges";
import { createAdminClient } from "@/lib/supabase/admin";

function getBearerToken(authHeader: string | null) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice("Bearer ".length).trim();
}

export async function GET(request: Request) {
  const configuredSecret = process.env.CRON_SECRET;
  const token = getBearerToken(request.headers.get("authorization")) ?? request.headers.get("x-cron-secret");

  if (!configuredSecret || token !== configuredSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const adminClient = createAdminClient();
    const summary = await generateMonthlyChargesForAllOwnersWithClient(adminClient);
    let autopaySummary: string | { processed: number; succeeded: number; failed: number; skipped: number } = "Autopay skipped";
    let expirationSummary = "Expired lease check skipped";
    let warningSummary = "Expiration warnings skipped";
    let reminderSummary = "Reminders skipped";

    try {
      autopaySummary = await processAutopayCharges(adminClient);
    } catch (error) {
      console.error("Autopay processing failed:", error);
      autopaySummary = "Autopay failed";
    }

    try {
      expirationSummary = await detectExpiredLeases(adminClient);
    } catch (error) {
      console.error("Lease expiration detection failed:", error);
      expirationSummary = "Expired lease check failed";
    }

    try {
      warningSummary = await sendLeaseExpirationWarnings(adminClient);
    } catch (error) {
      console.error("Lease expiration warnings failed:", error);
      warningSummary = "Expiration warnings failed";
    }

    try {
      reminderSummary = await sendRentDueReminders(adminClient);
    } catch (error) {
      console.error("Rent due reminders failed:", error);
      reminderSummary = "Reminders failed";
    }

    return NextResponse.json({
      ok: true,
      summary,
      autopaySummary,
      expirationSummary,
      warningSummary,
      reminderSummary
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Cron charge generation failed."
      },
      { status: 500 }
    );
  }
}
