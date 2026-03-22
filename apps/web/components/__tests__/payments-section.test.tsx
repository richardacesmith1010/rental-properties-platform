import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PaymentsSection } from "@/components/dashboard/payments-section";

describe("PaymentsSection", () => {
  const payments = [
    {
      id: "payment-1",
      amountCents: 175000,
      paidAt: "2026-03-05T14:00:00.000Z",
      method: "ach",
      propertyName: "Atlas House",
      unitNumber: "1A",
      chargeDueDate: "2026-03-01"
    }
  ];

  it("renders the payment list when payments exist", () => {
    render(<PaymentsSection payments={payments} />);

    expect(screen.getByText("$1,750")).toBeInTheDocument();
  });

  it("shows the empty state when no payments exist", () => {
    render(<PaymentsSection payments={[]} />);

    expect(screen.getByText("No payments recorded yet")).toBeInTheDocument();
  });

  it("shows the formatted payment amount", () => {
    render(<PaymentsSection payments={payments} />);

    expect(screen.getByText("$1,750")).toBeInTheDocument();
  });

  it("shows payment method and property context", () => {
    render(<PaymentsSection payments={payments} />);

    expect(screen.getByText("ACH")).toBeInTheDocument();
    expect(screen.getByText("Atlas House • 1A")).toBeInTheDocument();
  });

  it("shows the associated charge due date when present", () => {
    render(<PaymentsSection payments={payments} />);

    expect(screen.getByText(/Charge due/)).toBeInTheDocument();
  });
});
