import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getCurrentUserRole } from "@/lib/auth";
import { buildReceiptsExportFileName, getReceiptsPdfDataForYear } from "@/lib/pdf/pdf-data";
import { createReceiptPdfDocument } from "@/lib/pdf/receipt-template";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildPdfResponse(buffer: Buffer, filename: string) {
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store"
    }
  });
}

export async function GET(request: Request) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const role = await getCurrentUserRole(user.id);
  const searchParams = new URL(request.url).searchParams;
  const selectedYear = Number(searchParams.get("year") ?? new Date().getUTCFullYear());
  const year = Number.isFinite(selectedYear) ? selectedYear : new Date().getUTCFullYear();
  const result = await getReceiptsPdfDataForYear(user.id, role, year);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  const buffer = await renderToBuffer(
    createReceiptPdfDocument({
      receipts: result.data,
      exportLabel: `Receipts export ${year}`
    })
  );

  return buildPdfResponse(buffer, buildReceiptsExportFileName(year));
}
