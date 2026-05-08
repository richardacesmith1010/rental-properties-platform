import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PayRentCard, sortTenantChargesByUrgency } from "@/components/dashboard/pay-rent-card";
import { formatCurrency } from "@/lib/format";
import { calculateCardFee, formatCentsAsDollars } from "@/lib/payment-fees";

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
    const lateChargePayment = calculateCardFee(charges[1].amountCents);
    render(
      <PayRentCard
        charges={charges}
        onPayCharge={async () => {}}
        onPayWithACH={async () => {}}
        onRequestManualPaymentConfirmation={async () => ({ success: true })}
        chargesHref="/tenant?section=charges"
        onSetupAutopay={async () => ({ success: true })}
      />
    );

    expect(screen.getByText("Overdue")).toBeInTheDocument();
    expect(screen.getByText("Your Rent")).toBeInTheDocument();
    expect(screen.getByText(formatCurrency(charges[1].amountCents))).toBeInTheDocument();
    expect(screen.getByText("Roman Court")).toBeInTheDocument();
    expect(screen.getByText("Unit 2B")).toBeInTheDocument();
    expect(screen.getByText(`Includes ${formatCentsAsDollars(lateChargePayment.feeCents)} processing fee`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Pay ${formatCentsAsDollars(lateChargePayment.totalCents)}` })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Pay ${formatCentsAsDollars(charges[1].amountCents)}` })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enable Autopay" })).toBeInTheDocument();
    expect(screen.getByText("No extra fees")).toBeInTheDocument();
    expect(screen.getByText("FREE")).toBeInTheDocument();
  });

  it("shows the fee-inclusive card payment amount", () => {
    const payment = calculateCardFee(charges[0].amountCents);
    render(
      <PayRentCard
        charges={[charges[0]]}
        onPayCharge={async () => {}}
        onPayWithACH={async () => {}}
        onRequestManualPaymentConfirmation={async () => ({ success: true })}
        chargesHref="/tenant?section=charges"
      />
    );

    expect(
      screen.getByRole("button", {
        name: `Pay ${formatCentsAsDollars(payment.totalCents)}`
      })
    ).toBeInTheDocument();
  });

  it("shows the active autopay badge when enrollment is enabled", () => {
    render(
      <PayRentCard
        charges={[charges[0]]}
        onPayCharge={async () => {}}
        onPayWithACH={async () => {}}
        onRequestManualPaymentConfirmation={async () => ({ success: true })}
        chargesHref="/tenant?section=charges"
        autopayEnrollments={[
          {
            id: "enrollment-1",
            leaseId: "lease-1",
            propertyLabel: "Atlas House • 1A",
            last4: "4242",
            brand: "visa",
            paymentMethodType: "card",
            enabled: true,
            retryCount: 0
          }
        ]}
      />
    );

    expect(screen.getByText("Autopay is on")).toBeInTheDocument();
    expect(screen.getByText("Visa ending in 4242")).toBeInTheDocument();
  });

  it("shows the paused autopay message when enrollment is disabled", () => {
    render(
      <PayRentCard
        charges={[charges[0]]}
        onPayCharge={async () => {}}
        onPayWithACH={async () => {}}
        onRequestManualPaymentConfirmation={async () => ({ success: true })}
        chargesHref="/tenant?section=charges"
        autopayEnrollments={[
          {
            id: "enrollment-2",
            leaseId: "lease-1",
            propertyLabel: "Atlas House • 1A",
            last4: "1111",
            brand: "mastercard",
            paymentMethodType: "card",
            enabled: false,
            retryCount: 1
          }
        ]}
        onSetupAutopay={async () => ({ success: true })}
      />
    );

    expect(screen.getByText("Autopay paused — update your card to re-enable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update Card" })).toBeInTheDocument();
  });

  it("shows the all-set state when no charges are open", () => {
    render(
      <PayRentCard
        charges={[]}
        onPayCharge={async () => {}}
        onRequestManualPaymentConfirmation={async () => ({ success: true })}
        chargesHref="/tenant?section=charges"
        hasActiveLease
      />
    );

    expect(screen.getByText("You're all set")).toBeInTheDocument();
    expect(screen.getByText("No payments due right now")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View payment history" })).toHaveAttribute(
      "href",
      "/tenant?section=charges"
    );
  });

  it("shows the lease setup message when the tenant has no active lease", () => {
    render(
      <PayRentCard
        charges={[]}
        onPayCharge={async () => {}}
        onRequestManualPaymentConfirmation={async () => ({ success: true })}
        chargesHref="/tenant?section=charges"
        hasActiveLease={false}
      />
    );

    expect(screen.getByText("Your landlord hasn't set up your lease yet")).toBeInTheDocument();
    expect(screen.getByText("Once it's ready, your rent will show up here.")).toBeInTheDocument();
    expect(screen.queryByText("No payments due right now")).not.toBeInTheDocument();
  });
});
