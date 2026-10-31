import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ rows: vi.fn(), getUser: vi.fn(), pdf: vi.fn(), data: vi.fn(), exported: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ auth: { getUser: m.getUser },
  from: (table: string) => table === "profiles" ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({
    data: { role: "tenant" }, error: null }) }) }) } : { select: m.rows } }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@react-pdf/renderer", () => ({ renderToBuffer: m.pdf }));
vi.mock("@/lib/pdf/pdf-data", () => ({ getReceiptPdfData: m.data, getReceiptsPdfDataForYear: m.data,
  getLeaseSummaryPdfData: m.data, buildReceiptFileName: () => "receipt.pdf", buildReceiptsExportFileName: () => "receipts.pdf",
  buildLeaseSummaryFileName: () => "lease.pdf" }));
vi.mock("@/lib/pdf/receipt-template", () => ({ createReceiptPdfDocument: () => null }));
vi.mock("@/lib/pdf/lease-summary-template", () => ({ createLeaseSummaryPdfDocument: () => null }));
vi.mock("@/lib/account-export", () => ({ buildAccountExport: m.exported }));
import { GET as exportData } from "@/app/api/account/export/route";
import { GET as receipt } from "@/app/api/pdf/receipt/[chargeId]/route";
import { GET as receipts } from "@/app/api/pdf/receipts/route";
import { GET as lease } from "@/app/api/pdf/lease-summary/[leaseId]/route";
import { resetRateLimitState } from "@/lib/rate-limit";
beforeEach(() => {
  vi.clearAllMocks(); resetRateLimitState();
  m.getUser.mockResolvedValue({ data: { user: { id: "p", email: "p@example.com", created_at: "2026-10-30T12:00:00Z" } }, error: null });
  m.rows.mockResolvedValue({ data: [], error: null }); m.pdf.mockResolvedValue(Buffer.from("pdf"));
  m.data.mockResolvedValue({ ok: true, data: {} }); m.exported.mockResolvedValue({ profile: "p" });
});
describe("data and PDF agreement exits", () => {
  it.each([
    ["account export", () => exportData()],
    ["receipt", () => receipt(new Request("https://domusbase.com"), { params: Promise.resolve({ chargeId: "charge" }) })],
    ["receipts", () => receipts(new Request("https://domusbase.com/api/pdf/receipts"))],
    ["lease summary", () => lease(new Request("https://domusbase.com"), { params: Promise.resolve({ leaseId: "lease" }) })]
  ] as const)("G12 %s works for a required account without reading agreements", async (_name, invoke) => {
    const result = await invoke(); expect(result.status).toEqual(200); expect(m.rows).not.toHaveBeenCalled();
  });
});
