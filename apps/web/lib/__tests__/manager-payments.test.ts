import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.hoisted(() => vi.fn());
const getCurrentUserRoleMock = vi.hoisted(() => vi.fn());
const getManagerInvoicePdfDataMock = vi.hoisted(() => vi.fn());
const renderToBufferMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      getUser: getUserMock
    }
  })
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUserRole: getCurrentUserRoleMock
}));

vi.mock("@/lib/manager-payments-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/manager-payments-data")>();
  return {
    ...actual,
    getManagerInvoicePdfData: getManagerInvoicePdfDataMock
  };
});

vi.mock("@react-pdf/renderer", () => ({
  renderToBuffer: renderToBufferMock,
  Document: "document",
  Page: "page",
  Text: "text",
  View: "view",
  StyleSheet: {
    create: <T,>(value: T) => value
  }
}));

import { GET } from "@/app/api/pdf/manager-invoice/[paymentId]/route";

describe("manager invoice PDF route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 for unauthenticated requests", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const response = await GET(new Request("http://localhost/api/pdf/manager-invoice/payment-1"), {
      params: { paymentId: "payment-1" }
    });

    expect(response.status).toBe(401);
  });

  it("returns 403 when the invoice is not accessible", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    getCurrentUserRoleMock.mockResolvedValue("manager");
    getManagerInvoicePdfDataMock.mockResolvedValue({
      ok: false,
      status: 403,
      error: "Forbidden."
    });

    const response = await GET(new Request("http://localhost/api/pdf/manager-invoice/payment-1"), {
      params: { paymentId: "payment-1" }
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: "Forbidden." });
  });

  it("returns 404 when the payment is missing", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    getCurrentUserRoleMock.mockResolvedValue("owner");
    getManagerInvoicePdfDataMock.mockResolvedValue({
      ok: false,
      status: 404,
      error: "Manager payment not found."
    });

    const response = await GET(new Request("http://localhost/api/pdf/manager-invoice/payment-1"), {
      params: { paymentId: "payment-1" }
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "Manager payment not found."
    });
  });

  it("returns a PDF download for authorized owners and managers", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    getCurrentUserRoleMock.mockResolvedValue("owner");
    getManagerInvoicePdfDataMock.mockResolvedValue({
      ok: true,
      data: {
        invoiceNumber: "INV-20260321-ABC123",
        invoiceDate: "Mar 21, 2026",
        fromName: "Owner One",
        fromEmail: "owner@example.com",
        toName: "Manager One",
        toEmail: "manager@example.com",
        propertyName: "Oak Street Duplex",
        propertyAddress: "123 Oak St, Denver, CO, 80202",
        lineItems: [
          {
            description: "Property Management Fee",
            amount: "$211.50"
          }
        ],
        totalFormatted: "$211.50",
        category: "Property Management Fee",
        status: "Pending",
        notes: "Monthly recurring payment.",
        generatedAt: "Mar 21, 2026, 12:00 PM"
      }
    });
    renderToBufferMock.mockResolvedValue(Buffer.from("pdf-binary"));

    const response = await GET(new Request("http://localhost/api/pdf/manager-invoice/payment-1"), {
      params: { paymentId: "payment-1" }
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toContain(
      "domus-manager-invoice-payment-1.pdf"
    );
    expect(renderToBufferMock).toHaveBeenCalledTimes(1);
  });
});
