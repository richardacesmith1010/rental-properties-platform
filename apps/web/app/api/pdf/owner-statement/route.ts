import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { loadStatementDownload, statementFilename } from "@/lib/owner-statement";
import { OwnerStatementDocument } from "@/lib/pdf/owner-statement-template";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const result = await loadStatementDownload(request);
  if (!result.ok) return result.response;
  try {
    const document = createElement(OwnerStatementDocument, { statement: result.statement });
    const buffer = await renderToBuffer(document as Parameters<typeof renderToBuffer>[0]);
    return new Response(buffer, { headers: { "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${statementFilename(result.statement, "pdf")}"`,
      "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Owner statement PDF failed", error);
    return Response.json({ ok: false, error: "Could not make the statement. Please try again." }, { status: 500 });
  }
}
