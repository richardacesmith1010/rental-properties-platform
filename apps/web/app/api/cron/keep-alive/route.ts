import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const start = Date.now();
  const { error, count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true });
  const durationMs = Date.now() - start;

  if (error) {
    console.error(`[keep-alive] Failed after ${durationMs}ms:`, error);
    return NextResponse.json(
      { ok: false, error: error.message, durationMs },
      { status: 500 }
    );
  }

  console.log(`[keep-alive] OK in ${durationMs}ms (profiles count: ${count})`);
  return NextResponse.json({ ok: true, durationMs, profileCount: count });
}
