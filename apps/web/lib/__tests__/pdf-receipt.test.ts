import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.hoisted(() => vi.fn());
const getCurrentUserRoleMock = vi.hoisted(() => vi.fn());
const getReceiptPdfDataMock = vi.hoisted(() => vi.fn());
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

vi.mock("@/lib/pdf/pdf-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pdf/pdf-data")>();
  return {
    ...actual,
    getReceiptPdfData: getReceiptPdfDataMock
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

import { GET } from "@/app/api/pdf/receipt/[chargeId]/route";
import { buildReceiptNumber, buildReceiptPdfData } from "@/lib/pdf/pdf-data";

describe("receipt PDF helpers", () => {
  it("generates branded receipt numbers", () => {
    expect(buildReceiptNumber("abc12345def")).toBe("DOM-ABC12345");
  });

  it("formats receipt data for PDF rendering", () => {
    const result = buildReceiptPdfData({
      charge: {
        id: "charge-1",
        lease_id: "lease-1",
        due_date: "2026-03-01",
        amount_cents: 120000,
        category: "rent"
      },
      payment: {
        id: "payment-1",
        paid_at: "2026-03-02T10:00:00.000Z",
        amount_cents: 120000,
        method: "card",
        reference_note: "Stripe checkout"
      },
      lease: {
        id: "lease-1",
        tenant_profile_id: "tenant-1",
        unit_id: "unit-1",
        start_date: "2026-01-01",
        end_date: "2026-12-31",
        monthly_rent_cents: 120000,
        deposit_cents: 120000,
        due_day_of_month: 1,
        late_fee_cents: 10000,
        grace_period_days: 5,
        lease_status: "active"
      },
      unit: {
        id: "unit-1",
        unit_number: "2B",
        property_id: "property-1"
      },
      property: {
        id: "property-1",
        name: "Atlas House",
        address_line1: "123 Main St",
        city: "Denver",
        state: "CO",
        postal_code: "80202"
      },
      tenantProfile: {
        id: "tenant-1",
        full_name: "Jamie Tenant",
        email: "jamie@example.com"
      }
    });

    expect(result.receiptNumber).toBe("DOM-PAYMENT1");
    expect(result.amountFormatted).toBe("$1,200.00");
    expect(result.paymentMethod).toBe("Card");
    expect(result.propertyAddress).toBe("123 Main St, Denver, CO, 80202");
    expect(result.leaseLabel).toContain("2026");
  });
});

describe("receipt PDF route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 for unauthenticated requests", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const response = await GET(new Request("http://localhost/api/pdf/receipt/charge-1"), {
      params: { chargeId: "charge-1" }
    });

    expect(response.status).toBe(401);
  });

  it("returns 403 when the user is unauthorized", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    getCurrentUserRoleMock.mockResolvedValue("tenant");
    getReceiptPdfDataMock.mockResolvedValue({ ok: false, status: 403, error: "Forbidden." });

    const response = await GET(new Request("http://localhost/api/pdf/receipt/charge-1"), {
      params: { chargeId: "charge-1" }
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: "Forbidden." });
  });

  it("returns 404 when the receipt does not exist", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    getCurrentUserRoleMock.mockResolvedValue("tenant");
    getReceiptPdfDataMock.mockResolvedValue({ ok: false, status: 404, error: "Receipt not found." });

    const response = await GET(new Request("http://localhost/api/pdf/receipt/charge-1"), {
      params: { chargeId: "charge-1" }
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: "Receipt not found." });
  });

  it("returns a PDF download for authorized users", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    getCurrentUserRoleMock.mockResolvedValue("tenant");
    getReceiptPdfDataMock.mockResolvedValue({
      ok: true,
      data: {
        receiptNumber: "DOM-PAYMENT",
        tenantName: "Jamie Tenant",
        propertyName: "Atlas House",
        propertyAddress: "123 Main St, Denver, CO, 80202",
        unitLabel: "Unit 2B",
        amountFormatted: "$1,200.00",
        dueDate: "Mar 1, 2026",
        paidDate: "Mar 2, 2026",
        paymentMethod: "Card",
        leaseLabel: "Jan 1, 2026 - Dec 31, 2026",
        categoryLabel: "Rent",
        generatedAt: "Mar 2, 2026, 10:00 AM"
      }
    });
    renderToBufferMock.mockResolvedValue(Buffer.from("pdf-binary"));

    const response = await GET(new Request("http://localhost/api/pdf/receipt/charge-1"), {
      params: { chargeId: "charge-1" }
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toContain("domus-receipt-charge-1.pdf");
    expect(renderToBufferMock).toHaveBeenCalledTimes(1);
  });
});
