import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncConnection } from "@/lib/bank-feed/sync";
import { verifyPlaidWebhook } from "@/lib/bank-feed/webhook-verification";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!await verifyPlaidWebhook(rawBody, request.headers.get("Plaid-Verification"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let event: { webhook_type?: string; webhook_code?: string; item_id?: string;
    error?: { error_code?: string } };
  try { event = JSON.parse(rawBody); }
  catch { return NextResponse.json({ received: true }); }
  if (!event.item_id) return NextResponse.json({ received: true });
  const admin = createAdminClient();
  const found = await admin.from("bank_connections").select("id,status")
    .eq("plaid_item_id", event.item_id).maybeSingle();
  if (found.error) {
    console.error("plaid_webhook_connection_lookup");
    return NextResponse.json({ error: "Sync unavailable" }, { status: 500 });
  }
  if (!found.data) {
    console.info("plaid_webhook_unknown_item");
    return NextResponse.json({ received: true });
  }
  const connection = found.data;
  if (event.webhook_type === "TRANSACTIONS" && event.webhook_code === "SYNC_UPDATES_AVAILABLE") {
    if (connection.status === "ok" || connection.status === "error") {
      try { await syncConnection(connection.id); }
      catch { console.error("plaid_webhook_sync"); }
    }
  } else if (event.webhook_type === "ITEM") {
    const revoke = event.webhook_code === "USER_PERMISSION_REVOKED";
    const relink = (event.webhook_code === "ERROR" && event.error?.error_code === "ITEM_LOGIN_REQUIRED")
      || event.webhook_code === "PENDING_EXPIRATION" || event.webhook_code === "PENDING_DISCONNECT";
    if (revoke || relink) {
      const updated = await admin.from("bank_connections")
        .update({ status: revoke ? "revoked" : "needs_login" })
        .eq("id", connection.id).neq("status", "revoked");
      if (updated.error) console.error("plaid_webhook_status");
    }
  }
  return NextResponse.json({ received: true });
}
