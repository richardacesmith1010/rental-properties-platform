import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/components/dashboard/use-time-of-day-greeting", () => ({
  useTimeOfDayGreeting: () => "Hello"
}));

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
    useFormStatus: () => ({ pending: paymentStatus.pending })
  };
});

import { TenantOverview } from "@/components/dashboard/tenant-overview";

describe("TenantOverview outside-Domus status", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("explains the missing lease without showing zero rent", () => {
    render(
      <TenantOverview
        userName="Resident"
        charges={[]}
        nextCharge={null}
        lease={null}
        openTicketCount={0}
        payState="no_lease"
        onPayCharge={async () => null}
        onRequestManualPaymentConfirmation={async () => null}
      />
    );
    expect(screen.getByText("Your lease isn't set up yet")).toBeInTheDocument();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
  });

  it("submits pay from the overview and displays an error and pending label", async () => {
    formDispatches.length = 0;
    const onPayCharge = vi.fn(async () => ({ success: false, error: "Card pay failed." }));
    const charge = {
      id: "rent-1", leaseId: "lease-1", propertyId: "property-1", propertyLabel: "Home",
      propertyName: "Home", unitNumber: "1", dueDate: "2026-10-01",
      amountCents: 125000, status: "pending" as const
    };
    const { container, rerender } = render(
      <TenantOverview
        userName="Resident" charges={[charge]} nextCharge={null} lease={null}
        openTicketCount={0} payState="can_pay" onPayCharge={onPayCharge}
        onPayWithACH={async () => null} onRequestManualPaymentConfirmation={async () => null}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Pay rent" }));
    const cardForm = Array.from(container.querySelectorAll("form"))[1];
    cardForm.addEventListener("submit", (event) => {
      event.preventDefault();
      void formDispatches[0](new FormData(cardForm));
    });
    fireEvent.submit(cardForm);
    await waitFor(() => {
      expect(onPayCharge).toHaveBeenCalledOnce();
      expect(screen.getByRole("alert")).toHaveTextContent("Card pay failed.");
    });
    paymentStatus.pending = true;
    rerender(
      <TenantOverview
        userName="Resident" charges={[charge]} nextCharge={null} lease={null}
        openTicketCount={0} payState="can_pay" onPayCharge={onPayCharge}
        onPayWithACH={async () => null} onRequestManualPaymentConfirmation={async () => null}
      />
    );
    expect(screen.getAllByText("Opening payment…")).toHaveLength(2);
    paymentStatus.pending = false;
  });

  it("shows a past-due flagged charge as due without overdue language", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T12:00:00.000Z"));
    const charge = {
      id: "charge-1",
      leaseId: "lease-1",
      propertyId: "property-1",
      propertyLabel: "Domus House • Unit 1",
      propertyName: "Domus House",
      unitNumber: "1",
      dueDate: "2026-10-01",
      amountCents: 235000,
      status: "pending" as const,
      collectsOutsideDomus: true
    };

    render(
      <TenantOverview
        userName="Resident"
        charges={[charge]}
        nextCharge={{ amountCents: charge.amountCents, dueDate: charge.dueDate }}
        lease={null}
        openTicketCount={0}
        payState="outside"
        onPayCharge={vi.fn()}
        onRequestManualPaymentConfirmation={vi.fn()}
      />
    );

    expect(screen.getByText("You pay your landlord outside Domus.")).toBeInTheDocument();
    expect(screen.queryByText(/overdue/i)).not.toBeInTheDocument();
  });
});
