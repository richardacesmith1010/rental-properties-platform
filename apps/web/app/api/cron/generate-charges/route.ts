import { NextResponse } from "next/server";
import {
  generateMonthlyChargesForAllOwnersWithClient,
  processAutopayCharges,
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
    let reminderSummary = "Reminders skipped";

    try {
      autopaySummary = await processAutopayCharges(adminClient);
    } catch (error) {
      console.error("Autopay processing failed:", error);
      autopaySummary = "Autopay failed";
    }

    try {
      reminderSummary = await sendRentDueReminders(adminClient);
    } catch (error) {
      console.error("Rent due reminders failed:", error);
      reminderSummary = "Reminders failed";
    }

    return NextResponse.json({ ok: true, summary, autopaySummary, reminderSummary });
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
