import { loadStatementDownload, statementFilename } from "@/lib/owner-statement";
import { ownerStatementToCsv } from "@/lib/owner-statement-csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const result = await loadStatementDownload(request);
  if (!result.ok) return result.response;
  try {
    return new Response(ownerStatementToCsv(result.statement), { headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${statementFilename(result.statement, "csv")}"`,
      "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Owner statement CSV failed", error);
    return Response.json({ ok: false, error: "Could not make the statement. Please try again." }, { status: 500 });
  }
}
