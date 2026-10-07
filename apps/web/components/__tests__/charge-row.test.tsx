import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChargeRow, type ChargeRowData } from "@/components/dashboard/charge-row";

vi.mock("@/components/shared/submit-button", () => ({
  SubmitButton: ({ children, title, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="submit" title={title} {...props}>{children}</button>
  )
}));

const charge: ChargeRowData = {
  id: "charge-1",
  propertyId: "property-1",
  dueDate: "2026-10-01",
  amountCents: 100000,
  status: "late",
  propertyName: "Forum House",
  unitNumber: "1A",
  tenantName: "Test Tenant",
  category: "rent"
};

function renderCharge(isTenantView: boolean, row: ChargeRowData = charge) {
  return render(
    <ChargeRow
      charge={row}
      last
      batchActionsEnabled={false}
      selected={false}
      onToggleSelection={vi.fn()}
      canModify={!isTenantView}
      category="rent"
      isTenantView={isTenantView}
      paymentsAvailable
      stripeConfigured
      onPayCharge={vi.fn()}
      onPayWithACH={vi.fn()}
      showManualPayment={false}
      manualFormOpen={false}
      manualPaymentAction={vi.fn()}
      isMutatingCharges={false}
    />
  );
}

describe("ChargeRow", () => {
  it("shows a report badge only on an unpaid owner row", () => {
    const reported = { ...charge, tenantReportedPaidAt: "2026-10-07T17:04:35Z" };
    renderCharge(false, reported);
    expect(screen.getByText("Tenant says paid · Oct 7")).toHaveAttribute(
      "title", "Your tenant says they paid. Check, then tap Mark paid."
    );
  });

  it("hides the report badge on paid and tenant rows", () => {
    const reported = { ...charge, tenantReportedPaidAt: "2026-10-07T17:04:35Z" };
    const { unmount } = renderCharge(false, { ...reported, status: "paid" });
    expect(screen.queryByText(/Tenant says paid/)).not.toBeInTheDocument();
    unmount();
    renderCharge(true, reported);
    expect(screen.queryByText(/Tenant says paid/)).not.toBeInTheDocument();
  });
  it("does not render tenant payment controls in an owner or manager view", () => {
    renderCharge(false);

    expect(screen.queryByRole("button", { name: /pay/i })).not.toBeInTheDocument();
  });

  it("keeps card and bank payment controls in the tenant view", () => {
    renderCharge(true);

    expect(screen.getByRole("button", { name: "Pay $1,030.18" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pay $1,000.00" })).toBeInTheDocument();
  });

  it("shows the owner rent actions and keeps Message in more", () => {
    const reminder = vi.fn();
    const message = vi.fn();
    render(
      <ChargeRow
        charge={charge}
        last
        batchActionsEnabled={false}
        selected={false}
        onToggleSelection={vi.fn()}
        canModify
        category="rent"
        isTenantView={false}
        ownerView
        paymentsAvailable
        stripeConfigured
        onPayCharge={vi.fn()}
        onPayWithACH={vi.fn()}
        showManualPayment
        manualFormOpen={false}
        onToggleManualPayment={vi.fn()}
        manualPaymentAction={vi.fn()}
        onSendReminder={reminder}
        onOpenMessage={message}
        onOpenEdit={vi.fn()}
        isMutatingCharges={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Remind" }));
    expect(reminder).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Mark paid" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Message Test Tenant/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open more payment actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Message" }));
    expect(message).toHaveBeenCalledOnce();
  });
});
