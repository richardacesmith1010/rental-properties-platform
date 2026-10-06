import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TenantRentCard } from "@/components/dashboard/tenant-rent-card";

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

const baseProps = {
  charges: [{ id: "1", leaseId: "lease", propertyId: "property", propertyLabel: "Home", propertyName: "Home", unitNumber: "1", dueDate: "2026-10-01", amountCents: 100, status: "late" as const }],
  rentDueDate: "2026-10-01",
  rentAmountCents: 100,
  lastPaidAt: null,
  onPayCharge: vi.fn(),
  onPayWithACH: vi.fn(),
  onRequestManualPaymentConfirmation: vi.fn(),
  onSetupAutopay: vi.fn()
};

describe("TenantRentCard", () => {
  it.each([
    ["not_ready", "Online pay isn't on yet"],
    ["outside", "You pay your landlord outside Domus."],
    ["paid", "Paid Oct 1, 2026. Thank you!"],
    ["not_posted", "You can pay once it's posted."]
  ] as const)("renders the %s state", (payState, copy) => {
    render(<TenantRentCard {...baseProps} payState={payState} lastPaidAt={payState === "paid" ? "2026-10-01" : null} />);
    expect(screen.getByText(copy)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pay rent" })).not.toBeInTheDocument();
  });

  it("reveals payment methods after Pay rent", () => {
    render(<TenantRentCard {...baseProps} payState="can_pay" />);
    expect(screen.getByText("$1")).toBeInTheDocument();
    expect(screen.queryByText("Bank account")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pay rent" }));
    expect(screen.getByText("Bank account")).toBeInTheDocument();
  });

  it("submits pay from the revealed form and shows the returned error", async () => {
    formDispatches.length = 0;
    const onPayCharge = vi.fn(async () => ({ success: false, error: "Card pay failed." }));
    const { container } = render(
      <TenantRentCard {...baseProps} payState="can_pay" onPayCharge={onPayCharge} />
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
  });

  it("shows pending pay labels after opening payment options", () => {
    paymentStatus.pending = true;
    render(<TenantRentCard {...baseProps} payState="can_pay" />);
    fireEvent.click(screen.getByRole("button", { name: "Pay rent" }));
    expect(screen.getAllByText("Opening payment…")).toHaveLength(2);
    paymentStatus.pending = false;
  });

  it("explains when there is no lease without showing zero rent", () => {
    render(<TenantRentCard {...baseProps} payState="no_lease" rentAmountCents={null} charges={[]} />);
    expect(screen.getByText("Your lease isn't set up yet")).toBeInTheDocument();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
  });

  it("totals multiple unpaid months and only shows a late-fee warning when needed", () => {
    const charges = [baseProps.charges[0], { ...baseProps.charges[0], id: "2", amountCents: 250 }];
    const { rerender } = render(<TenantRentCard {...baseProps} charges={charges} payState="can_pay" lateFeeCents={500} />);
    expect(screen.getByText("$3.50 · 2 months")).toBeInTheDocument();
    expect(screen.getByText("A $5 late fee may apply.")).toBeInTheDocument();
    rerender(<TenantRentCard {...baseProps} charges={charges} payState="can_pay" lateFeeCents={0} />);
    expect(screen.queryByText(/late fee may apply/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/charges?/i)).not.toBeInTheDocument();
  });

  it.each(["not_ready", "outside"] as const)("totals unpaid months when pay state is %s", (payState) => {
    const charges = [baseProps.charges[0], { ...baseProps.charges[0], id: "2", amountCents: 250, dueDate: "2026-11-01" }];
    render(<TenantRentCard {...baseProps} charges={charges} payState={payState} />);
    expect(screen.getByText("$3.50 · 2 months")).toBeInTheDocument();
    expect(screen.getByText(/due Oct 1/)).toBeInTheDocument();
  });
});
