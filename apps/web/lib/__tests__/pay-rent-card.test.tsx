import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PayRentCard, sortTenantChargesByUrgency } from "@/components/dashboard/pay-rent-card";
import { formatCurrency } from "@/lib/format";

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return {
    ...actual,
    useFormState: () => [null, async () => null] as const,
    useFormStatus: () => ({ pending: false, data: null, method: "post", action: null })
  };
});

describe("PayRentCard", () => {
  const charges = [
    {
      id: "charge-pending",
      leaseId: "lease-1",
      propertyId: "property-1",
      propertyLabel: "Atlas House • 1A",
      propertyName: "Atlas House",
      unitNumber: "1A",
      dueDate: "2026-04-01",
      amountCents: 235000,
      status: "pending" as const
    },
    {
      id: "charge-late",
      leaseId: "lease-2",
      propertyId: "property-2",
      propertyLabel: "Roman Court • 2B",
      propertyName: "Roman Court",
      unitNumber: "2B",
      dueDate: "2026-03-01",
      amountCents: 175000,
      status: "late" as const
    }
  ];

  it("sorts late charges ahead of pending charges", () => {
    const sorted = sortTenantChargesByUrgency(charges);

    expect(sorted[0]?.id).toBe("charge-late");
    expect(sorted[1]?.id).toBe("charge-pending");
  });

  it("shows the most urgent charge as the dominant payment card", () => {
    render(
      <PayRentCard
        charges={charges}
        onPayCharge={async () => {}}
        onRequestManualPaymentConfirmation={async () => ({ success: true })}
        chargesHref="/tenant?section=charges"
      />
    );

    expect(screen.getByText("Overdue")).toBeInTheDocument();
    expect(screen.getByText("Your Rent")).toBeInTheDocument();
    expect(screen.getByText(formatCurrency(charges[1].amountCents))).toBeInTheDocument();
    expect(screen.getByText("Roman Court")).toBeInTheDocument();
    expect(screen.getByText("Unit 2B")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /pay rent/i })).toBeInTheDocument();
  });

  it("formats the pay button label with the charge amount", () => {
    render(
      <PayRentCard
        charges={[charges[0]]}
        onPayCharge={async () => {}}
        onRequestManualPaymentConfirmation={async () => ({ success: true })}
        chargesHref="/tenant?section=charges"
      />
    );

    expect(
      screen.getByRole("button", {
        name: `Pay Rent — ${formatCurrency(charges[0].amountCents)}`
      })
    ).toBeInTheDocument();
  });

  it("shows the all-set state when no charges are open", () => {
    render(
      <PayRentCard
        charges={[]}
        onPayCharge={async () => {}}
        onRequestManualPaymentConfirmation={async () => ({ success: true })}
        chargesHref="/tenant?section=charges"
      />
    );

    expect(screen.getByText("You're all set")).toBeInTheDocument();
    expect(screen.getByText("No payments due right now")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View payment history" })).toHaveAttribute(
      "href",
      "/tenant?section=charges"
    );
  });
});
