import { NextResponse } from "next/server";
import { generateMonthlyChargesForAllOwnersWithClient } from "@/lib/charges";
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
    return NextResponse.json({ ok: true, summary });
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
