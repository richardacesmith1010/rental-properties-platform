import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getCurrentUserRole } from "@/lib/auth";
import { buildLeaseSummaryFileName, getLeaseSummaryPdfData } from "@/lib/pdf/pdf-data";
import { createLeaseSummaryPdfDocument } from "@/lib/pdf/lease-summary-template";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: {
    leaseId: string;
  };
}

function buildPdfResponse(buffer: Buffer, filename: string) {
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store"
    }
  });
}

export async function GET(_request: Request, { params }: RouteParams) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const role = await getCurrentUserRole(user.id);
  const result = await getLeaseSummaryPdfData(user.id, role, params.leaseId);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  const buffer = await renderToBuffer(createLeaseSummaryPdfDocument({ data: result.data }));

  return buildPdfResponse(buffer, buildLeaseSummaryFileName(params.leaseId));
}
