import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  ChargeRow,
  getChargeLabel,
  type ChargeRowData,
  type ChargeStatus
} from "@/components/dashboard/charge-row";

vi.mock("@/components/shared/submit-button", () => ({
  SubmitButton: ({ children, title, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="submit" title={title} {...props}>{children}</button>
  )
}));

const statuses: ChargeStatus[] = ["pending", "paid", "late", "waived"];

function makeCharge(status: ChargeStatus): ChargeRowData {
  return {
    id: `charge-${status}`,
    propertyId: "property-1",
    dueDate: "2026-10-01",
    amountCents: 100000,
    status,
    propertyName: "Forum House",
    unitNumber: "1A",
    tenantName: "Test Tenant",
    tenantEmail: "tenant@example.com",
    category: "rent"
  };
}

function renderCharge(status: ChargeStatus, canModify: boolean, manualFormOpen = false) {
  return render(
    <ChargeRow
      charge={makeCharge(status)}
      last
      batchActionsEnabled={false}
      selected={false}
      onToggleSelection={vi.fn()}
      canModify={canModify}
      category="rent"
      isTenantView={false}
      paymentsAvailable
      stripeConfigured
      onPayCharge={vi.fn()}
      onPayWithACH={vi.fn()}
      showManualPayment
      manualFormOpen={manualFormOpen}
      manualPaymentAction={vi.fn()}
      onToggleManualPayment={vi.fn()}
      onOpenEdit={vi.fn()}
      onWaive={vi.fn()}
      onDelete={vi.fn()}
      onOpenMessage={vi.fn()}
      onSendReminder={vi.fn()}
      ownerView
      isMutatingCharges={false}
    />
  );
}

describe("ChargeRow rendered output", () => {
  it.each(statuses)("matches the snapshot for %s without owner controls", (status) => {
    const { container } = renderCharge(status, false);
    expect(container.innerHTML).toMatchSnapshot(`${status} without owner controls`);
  });

  it.each(statuses)("matches the snapshot for %s with owner controls", (status) => {
    const { container } = renderCharge(status, true);
    expect(container.innerHTML).toMatchSnapshot(`${status} with owner controls`);
  });

  it("matches the opened more menu snapshot", () => {
    const { container } = renderCharge("pending", true);
    fireEvent.click(container.querySelector('button[aria-label="Open more payment actions"]')!);
    expect(container.innerHTML).toMatchSnapshot("opened more menu");
  });

  it("matches the opened manual payment form snapshot", () => {
    const { container } = renderCharge("pending", false, true);
    expect(container.innerHTML).toMatchSnapshot("opened manual payment form");
  });

  it("labels charges and statuses", () => {
    expect(getChargeLabel({ ...makeCharge("pending"), propertyLabel: "Custom label" })).toBe("Custom label");
    expect(getChargeLabel({ ...makeCharge("pending"), propertyName: undefined, unitNumber: undefined })).toBe(
      "Unknown Property • -"
    );
    for (const status of statuses) {
      expect(getChargeLabel(makeCharge(status))).toBe("Forum House • 1A");
    }
  });
});
