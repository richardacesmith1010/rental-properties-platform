import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeAccountHealth } from "@/lib/stripe";
import { createCronRunRecord, updateCronRunRecord } from "@/lib/cron-runs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Summary = {
  checked: number;
  active: number;
  restricted: number;
  missing: number;
  errored: number;
};

type StripeAccountTable = "ownership_accounts" | "profiles";

interface StripeAccountRow {
  id: string;
  stripe_account_id: string | null;
}

const STRIPE_ACCOUNT_TABLES: StripeAccountTable[] = ["ownership_accounts", "profiles"];

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date().toISOString();
  const runId = await createCronRunRecord("verify-stripe-accounts", startedAt);
  try {
    const admin = createAdminClient();
    const summary: Summary = {
      checked: 0,
      active: 0,
      restricted: 0,
      missing: 0,
      errored: 0
    };

    for (const table of STRIPE_ACCOUNT_TABLES) {
      const { data: rows, error } = await admin
        .from(table)
        .select("id, stripe_account_id")
        .not("stripe_account_id", "is", null);

      if (error) {
        console.error("verify-stripe-accounts read failed");
        summary.errored += 1;
        continue;
      }

      for (const row of (rows ?? []) as StripeAccountRow[]) {
        const accountId = row.stripe_account_id;
        if (!accountId) {
          continue;
        }

        summary.checked += 1;

        try {
          const health = await getStripeAccountHealth(accountId);
          const { error: updateError } = await admin
            .from(table)
            .update({
              stripe_status: health.status,
              stripe_last_verified_at: new Date().toISOString()
            })
            .eq("id", row.id);

          if (updateError) {
            console.error("verify-stripe-accounts update failed");
            summary.errored += 1;
            continue;
          }

          summary[health.status] += 1;
        } catch {
          console.error("verify-stripe-accounts check failed");
          summary.errored += 1;
        }
      }
    }

    console.log("[verify-stripe-accounts] summary:", summary);
    await updateCronRunRecord(runId, {
      completed_at: new Date().toISOString(),
      status: summary.errored > 0 ? "failure" : "success",
      operations: [],
      error: summary.errored > 0 ? "Stripe account verification failed." : null
    });
    return NextResponse.json({ ok: true, summary });
  } catch {
    await updateCronRunRecord(runId, {
      completed_at: new Date().toISOString(),
      status: "failure",
      operations: [],
      error: "Stripe account verification failed."
    });
    return NextResponse.json({ ok: false, error: "Stripe account verification failed." }, { status: 500 });
  }
}
