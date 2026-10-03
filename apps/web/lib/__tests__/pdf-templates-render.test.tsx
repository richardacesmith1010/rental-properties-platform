import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import { createInvoicePdfDocument } from "@/lib/pdf/invoice-template";
import { createLeaseSummaryPdfDocument } from "@/lib/pdf/lease-summary-template";
import { createManagerInvoicePdfDocument } from "@/lib/pdf/manager-invoice-template";
import { createReceiptPdfDocument } from "@/lib/pdf/receipt-template";

const receipt = {
  receiptNumber: "DOM-12345678",
  tenantName: "Aurelia Tenant",
  propertyName: "Forum Apartments",
  propertyAddress: "100 Forum Way, Denver, CO 80202",
  unitLabel: "Unit 7",
  amountFormatted: "$1,850.00",
  dueDate: "October 1, 2026",
  paidDate: "October 1, 2026 at 9:30 AM",
  paymentMethod: "Card",
  leaseLabel: "January 1, 2026 - December 31, 2026",
  categoryLabel: "Rent",
  referenceNote: "October rent",
  generatedAt: "October 2, 2026 at 10:00 AM"
};

const leaseSummary = {
  leaseNumber: "LEASE-12345678",
  tenantName: "Aurelia Tenant",
  tenantEmail: "tenant@example.com",
  propertyName: "Forum Apartments",
  propertyAddress: "100 Forum Way, Denver, CO 80202",
  unitLabel: "Unit 7",
  monthlyRentFormatted: "$1,850.00",
  depositFormatted: "$1,850.00",
  dueDayLabel: "1st of each month",
  gracePeriodLabel: "5 days",
  lateFeeFormatted: "$75.00",
  leasePeriodLabel: "January 1, 2026 - December 31, 2026",
  leaseStatusLabel: "Active",
  generatedAt: "October 2, 2026 at 10:00 AM"
};

const invoice = {
  invoiceNumber: "INV-20261002-123456",
  invoiceDate: "October 2, 2026",
  fromName: "Marcus Manager",
  fromEmail: "manager@example.com",
  toName: "Olivia Owner",
  toEmail: "owner@example.com",
  propertyName: "Forum Apartments",
  propertyAddress: "100 Forum Way, Denver, CO 80202",
  lineItems: [{ description: "Property management", amount: "$185.00" }],
  totalFormatted: "$185.00",
  category: "Management fee",
  status: "paid",
  notes: "Thank you.",
  generatedAt: "October 2, 2026 at 10:00 AM"
};

describe("PDF templates", () => {
  it.each([
    ["receipt", createReceiptPdfDocument({ receipts: [receipt] })],
    ["invoice", createInvoicePdfDocument({ invoice })],
    ["lease summary", createLeaseSummaryPdfDocument({ data: leaseSummary })],
    ["manager invoice", createManagerInvoicePdfDocument({ invoice })]
  ])("renders the %s template to a non-empty PDF buffer", async (_name, document) => {
    const buffer = await renderToBuffer(document);

    expect(buffer.byteLength).toBeGreaterThan(0);
  });
});
