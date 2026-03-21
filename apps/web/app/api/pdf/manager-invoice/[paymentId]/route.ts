import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getCurrentUserRole } from "@/lib/auth";
import {
  buildManagerInvoiceFileName
} from "@/lib/manager-payments";
import { getManagerInvoicePdfData } from "@/lib/manager-payments-data";
import { createManagerInvoicePdfDocument } from "@/lib/pdf/manager-invoice-template";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: {
    paymentId: string;
  };
}

function buildPdfResponse(buffer: Buffer, filename: string) {
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=\"${filename}\"`,
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
  const result = await getManagerInvoicePdfData({
    paymentId: params.paymentId,
    userId: user.id,
    role
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  const buffer = await renderToBuffer(
    createManagerInvoicePdfDocument({
      invoice: result.data
    })
  );

  return buildPdfResponse(buffer, buildManagerInvoiceFileName(params.paymentId));
}
