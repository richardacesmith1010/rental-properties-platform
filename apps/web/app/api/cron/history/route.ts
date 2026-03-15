import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaError } from "@/lib/supabase-errors";

export const dynamic = "force-dynamic";

function getBearerToken(authHeader: string | null) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice("Bearer ".length).trim();
}

export async function GET(request: Request) {
  const configuredSecret = process.env.CRON_SECRET;
  const token =
    getBearerToken(request.headers.get("authorization")) ?? request.headers.get("x-cron-secret");

  if (!configuredSecret || token !== configuredSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const { data: runs, error } = await admin
      .from("cron_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(30);

    if (error) {
      if (isMissingSchemaError(error)) {
        return NextResponse.json({
          ok: true,
          runs: [],
          warning: "This feature requires a database update."
        });
      }

      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, runs: runs ?? [] });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to load cron history."
      },
      { status: 500 }
    );
  }
}
