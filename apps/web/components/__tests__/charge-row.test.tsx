import { render, screen } from "@testing-library/react";
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

function renderCharge(isTenantView: boolean) {
  return render(
    <ChargeRow
      charge={charge}
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
  it("does not render tenant payment controls in an owner or manager view", () => {
    renderCharge(false);

    expect(screen.queryByRole("button", { name: /pay/i })).not.toBeInTheDocument();
  });

  it("keeps card and bank payment controls in the tenant view", () => {
    renderCharge(true);

    expect(screen.getByRole("button", { name: "Pay $1,030.18" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pay $1,000.00" })).toBeInTheDocument();
  });
});
