import { NextResponse } from "next/server";
import { buildHealthPayload, checkStripe, checkSupabase } from "@/lib/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const [supabase, stripe] = await Promise.all([checkSupabase(), checkStripe()]);
  const payload = buildHealthPayload({ supabase, stripe });

  return NextResponse.json(payload, {
    status: payload.ok ? 200 : 503
  });
}
