import { describe, expect, it } from "vitest";
import {
  buildManagerInvoiceFileName,
  calculateCommission,
  calculateConfiguredManagerPaymentAmount,
  formatManagerPaymentCategory,
  generateInvoiceNumber
} from "../manager-payments";

describe("manager payment calculations", () => {
  it("calculates percentage commissions from base rent", () => {
    expect(calculateCommission(235000, 9)).toBe(21150);
  });

  it("rounds commission calculations to the nearest cent", () => {
    expect(calculateCommission(99999, 8.75)).toBe(8750);
  });

  it("derives configured payment amounts for percentage and flat configs", () => {
    expect(
      calculateConfiguredManagerPaymentAmount({
        paymentType: "percentage",
        percentageRate: 9,
        flatAmountCents: null,
        baseRentCents: 235000
      })
    ).toBe(21150);

    expect(
      calculateConfiguredManagerPaymentAmount({
        paymentType: "flat",
        percentageRate: null,
        flatAmountCents: 50000,
        baseRentCents: null
      })
    ).toBe(50000);
  });

  it("generates branded invoice numbers with the issue date and payment id prefix", () => {
    expect(generateInvoiceNumber("abc12345-def6", new Date("2026-03-21T12:00:00.000Z"))).toBe(
      "INV-20260321-ABC123"
    );
  });

  it("builds descriptive invoice filenames", () => {
    expect(buildManagerInvoiceFileName("payment-123")).toBe("domus-manager-invoice-payment-123.pdf");
  });

  it("formats manager payment categories for invoices and UI", () => {
    expect(formatManagerPaymentCategory("commission")).toBe("Property Management Fee");
    expect(formatManagerPaymentCategory("reimbursement")).toBe("Reimbursement");
    expect(formatManagerPaymentCategory("custom")).toBe("Custom Payment");
  });
});
