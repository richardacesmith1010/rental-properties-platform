import { afterEach, describe, expect, it, vi } from "vitest";
import { buildInvoiceEmail, sendInvoiceEmail } from "@/lib/invoice-email";

describe("invoice email", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("builds a subject with the invoice number and amount", () => {
    const result = buildInvoiceEmail({
      managerName: "Morgan Manager",
      managerEmail: "manager@example.com",
      ownerName: "Courtney Smith",
      ownerEmail: "owner@example.com",
      amount: "$211.50",
      description: "Property Management Fee",
      propertyName: "Oak Street Duplex",
      invoiceNumber: "INV-20260321-ABC123",
      date: "Mar 21, 2026",
      invoiceUrl: "https://domusbase.com/api/pdf/invoice/payment-1",
      status: "pending"
    });

    expect(result.subject).toContain("INV-20260321-ABC123");
    expect(result.subject).toContain("$211.50");
  });

  it("includes the manager name, description, and amount in the HTML body", () => {
    const result = buildInvoiceEmail({
      managerName: "Morgan Manager",
      managerEmail: "manager@example.com",
      ownerName: "Courtney Smith",
      ownerEmail: "owner@example.com",
      amount: "$211.50",
      description: "Property Management Fee",
      propertyName: "Oak Street Duplex",
      invoiceNumber: "INV-20260321-ABC123",
      date: "Mar 21, 2026",
      invoiceUrl: "https://domusbase.com/api/pdf/invoice/payment-1",
      status: "pending"
    });

    expect(result.html).toContain("Morgan Manager");
    expect(result.html).toContain("Property Management Fee");
    expect(result.html).toContain("$211.50");
    expect(result.html).toContain("Oak Street Duplex");
  });

  it("returns false when resend configuration is missing", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("RESEND_FROM_EMAIL", "");

    const sent = await sendInvoiceEmail({
      managerName: "Morgan Manager",
      managerEmail: "manager@example.com",
      ownerName: "Courtney Smith",
      ownerEmail: "owner@example.com",
      amount: "$211.50",
      description: "Property Management Fee",
      propertyName: "Oak Street Duplex",
      invoiceNumber: "INV-20260321-ABC123",
      date: "Mar 21, 2026",
      invoiceUrl: "https://domusbase.com/api/pdf/invoice/payment-1",
      status: "pending",
      attachmentFileName: "invoice.pdf",
      attachmentContentBase64: "cGRm"
    });

    expect(sent).toBe(false);
  });

  it("returns false when Resend rejects the invoice email", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "noreply@domusbase.com");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    const sent = await sendInvoiceEmail({
      managerName: "Morgan Manager",
      managerEmail: "manager@example.com",
      ownerName: "Courtney Smith",
      ownerEmail: "owner@example.com",
      amount: "$211.50",
      description: "Property Management Fee",
      propertyName: "Oak Street Duplex",
      invoiceNumber: "INV-20260321-ABC123",
      date: "Mar 21, 2026",
      invoiceUrl: "https://domusbase.com/api/pdf/invoice/payment-1",
      status: "pending",
      attachmentFileName: "invoice.pdf",
      attachmentContentBase64: "cGRm"
    });

    expect(sent).toBe(false);
  });
});
