import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncConnection } from "@/lib/bank-feed/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  const query = await admin.from("bank_connections").select("id")
    .in("status", ["ok", "error"]).or(`last_synced_at.is.null,last_synced_at.lt.${cutoff}`);
  if (query.error) return NextResponse.json({ error: "Bank sync unavailable" }, { status: 500 });
  let synced = 0;
  let failed = 0;
  for (const connection of query.data || []) {
    try { if (await syncConnection(connection.id)) synced++; }
    catch { failed++; console.error("bank_cron_connection_failed"); }
  }
  return NextResponse.json({ synced, failed });
}
