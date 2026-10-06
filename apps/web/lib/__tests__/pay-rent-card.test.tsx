import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PayRentCard, sortTenantChargesByUrgency } from "@/components/dashboard/pay-rent-card";
import { formatCurrency } from "@/lib/format";
import { calculateCardFee, formatCentsAsDollars } from "@/lib/payment-fees";

const paymentStatus = vi.hoisted(() => ({ pending: false }));
const formDispatches = vi.hoisted(() => [] as Array<(data: FormData) => Promise<void>>);

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  const React = await import("react");
  return {
    ...actual,
    useFormState: (action: (prev: unknown, data: FormData) => Promise<unknown>, initial: unknown) => {
      const [state, setState] = React.useState(initial);
      const dispatch = async (data: FormData) => setState(await action(state, data));
      formDispatches.push(dispatch);
      return [state, dispatch] as const;
    },
    useFormStatus: () => ({ pending: paymentStatus.pending, data: null, method: "post", action: null })
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

  it("calls both pay actions and shows returned errors under their buttons", async () => {
    const onPayCharge = vi.fn(async () => ({ success: false, error: "Card pay failed." }));
    const onPayWithACH = vi.fn(async () => ({ success: false, error: "Bank pay failed." }));
    formDispatches.length = 0;
    const { container } = render(
      <PayRentCard
        charges={[charges[0]]}
        onPayCharge={onPayCharge}
        onPayWithACH={onPayWithACH}
        onRequestManualPaymentConfirmation={async () => ({ success: true })}
        chargesHref="/tenant?section=charges"
      />
    );
    const forms = Array.from(container.querySelectorAll("form"));
    forms[0].addEventListener("submit", (event) => {
      event.preventDefault();
      void formDispatches[1](new FormData(forms[0]));
    });
    forms[1].addEventListener("submit", (event) => {
      event.preventDefault();
      void formDispatches[0](new FormData(forms[1]));
    });
    fireEvent.submit(forms[0]);
    fireEvent.submit(forms[1]);
    await waitFor(() => {
      expect(onPayCharge).toHaveBeenCalledOnce();
      expect(onPayWithACH).toHaveBeenCalledOnce();
      expect(screen.getByText("Bank pay failed.")).toHaveAttribute("role", "alert");
      expect(screen.getByText("Card pay failed.")).toHaveAttribute("role", "alert");
    });
    expect(onPayCharge).toHaveBeenCalledWith(null, expect.any(FormData));
  });

  it("shows a pending label while opening checkout", () => {
    paymentStatus.pending = true;
    render(
      <PayRentCard
        charges={[charges[0]]}
        onPayCharge={async () => null}
        onPayWithACH={async () => null}
        onRequestManualPaymentConfirmation={async () => null}
        chargesHref="/tenant?section=charges"
      />
    );
    expect(screen.getAllByText("Opening payment…")).toHaveLength(2);
    paymentStatus.pending = false;
  });

  it("shows the receipt in Domus copy", () => {
    render(
      <PayRentCard
        charges={[charges[0]]}
        onPayCharge={async () => null}
        onRequestManualPaymentConfirmation={async () => null}
        chargesHref="/tenant?section=charges"
      />
    );
    expect(screen.getByText("Your receipt will be in Domus after you pay.")).toBeInTheDocument();
  });

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
        onPayCharge={async () => ({ success: true })}
        onPayWithACH={async () => ({ success: true })}
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
    expect(screen.getByText(`Card fee: ${formatCentsAsDollars(lateChargePayment.feeCents)}. Total today: ${formatCentsAsDollars(lateChargePayment.totalCents)}.`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Pay ${formatCentsAsDollars(lateChargePayment.totalCents)}` })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Pay ${formatCentsAsDollars(charges[1].amountCents)}` })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enable Autopay" })).toBeInTheDocument();
    expect(screen.getByText(`No processing fee. Pay ${formatCentsAsDollars(charges[1].amountCents)} total.`)).toBeInTheDocument();
    expect(screen.getByText("Recommended · Free")).toBeInTheDocument();
  });

  it("shows the fee-inclusive card payment amount", () => {
    const payment = calculateCardFee(charges[0].amountCents);
    render(
      <PayRentCard
        charges={[charges[0]]}
        onPayCharge={async () => ({ success: true })}
        onPayWithACH={async () => ({ success: true })}
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
        onPayCharge={async () => ({ success: true })}
        onPayWithACH={async () => ({ success: true })}
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
        onPayCharge={async () => ({ success: true })}
        onPayWithACH={async () => ({ success: true })}
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

    expect(screen.getByText("Autopay paused — update your card to turn it back on")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update Card" })).toBeInTheDocument();
  });

  it("shows the all-set state when no charges are open", () => {
    render(
      <PayRentCard
        charges={[]}
        onPayCharge={async () => ({ success: true })}
        onRequestManualPaymentConfirmation={async () => ({ success: true })}
        chargesHref="/tenant?section=charges"
        hasActiveLease
      />
    );

    expect(screen.getByText("You're all set")).toBeInTheDocument();
    expect(screen.getByText("No payments due right now")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View past payments" })).toHaveAttribute(
      "href",
      "/tenant?section=charges"
    );
  });

  it("shows the lease setup message when the tenant has no active lease", () => {
    render(
      <PayRentCard
        charges={[]}
        onPayCharge={async () => ({ success: true })}
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
