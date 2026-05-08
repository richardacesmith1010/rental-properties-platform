import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeAccountHealth } from "@/lib/stripe";

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
      console.error(`[verify-stripe-accounts] failed to read ${table}:`, error);
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
          console.error(
            `[verify-stripe-accounts] update ${table}.${row.id} failed:`,
            updateError
          );
          summary.errored += 1;
          continue;
        }

        summary[health.status] += 1;
      } catch (error) {
        console.error(
          `[verify-stripe-accounts] check ${table}.${row.id} (${accountId}) failed:`,
          error
        );
        summary.errored += 1;
      }
    }
  }

  console.log("[verify-stripe-accounts] summary:", summary);
  return NextResponse.json({ ok: true, summary });
}
