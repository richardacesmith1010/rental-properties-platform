import { describe, expect, it, vi } from "vitest";
import {
  buildLeaseSummaryFileName, buildLeaseSummaryPdfData, buildReceiptFileName,
  buildReceiptNumber, buildReceiptPdfData, buildReceiptsExportFileName
} from "@/lib/pdf/pdf-data";

describe("PDF data original output", () => {
  it("locks every exported pure builder", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-07T18:30:00.000Z"));
    try {
      const base = {
        lease: {
          id: "lease-12345678", tenant_profile_id: "tenant-1", unit_id: "unit-1",
          start_date: "2026-11-01", end_date: "2027-10-31", monthly_rent_cents: 123456,
          deposit_cents: 0, due_day_of_month: 1, late_fee_cents: null,
          grace_period_days: null, lease_status: "active"
        },
        unit: { id: "unit-1", unit_number: "B", property_id: "property-1" },
        property: {
          id: "property-1", name: "Oak & Elm <House>", address_line1: "123 Oak St",
          city: "Denver", state: "CO", postal_code: "80203"
        },
        tenantProfile: {
          id: "tenant-1", full_name: "Alexandra & Morgan O'Connor-Smith with a Very Long Name",
          email: "alex@example.com"
        }
      };
      const receipt = {
        ...base,
        charge: { id: "charge-1", lease_id: base.lease.id, due_date: "2026-10-01",
          amount_cents: 123456, category: "late_fee" },
        payment: { id: "pay-12345678", paid_at: "2026-10-07T17:00:00.000Z",
          amount_cents: 123456, method: "ach", reference_note: "Rent & fees <paid>" }
      };
      expect({
        leaseSummaryFileName: buildLeaseSummaryFileName(base.lease.id),
        receiptFileName: buildReceiptFileName(receipt.charge.id),
        receiptNumber: buildReceiptNumber(receipt.payment.id),
        receiptNumberFallback: buildReceiptNumber("---"),
        receiptsExportFileName: buildReceiptsExportFileName(2026),
        leaseSummary: buildLeaseSummaryPdfData(base),
        receipt: buildReceiptPdfData(receipt),
        receiptOptionalAbsent: buildReceiptPdfData({
          ...receipt, tenantProfile: null,
          payment: { ...receipt.payment, amount_cents: 0, reference_note: null, method: "other" },
          charge: { ...receipt.charge, category: null },
          property: { ...base.property, address_line1: null, city: null, state: null, postal_code: null }
        })
      }).toMatchSnapshot();
    } finally {
      vi.useRealTimers();
    }
  });
});
