import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/dashboard/pay-rent-card", () => ({
  PayRentCard: () => <div>Pay rent</div>
}));
vi.mock("@/components/dashboard/use-time-of-day-greeting", () => ({
  useTimeOfDayGreeting: () => "Hello"
}));

import { TenantOverview } from "@/components/dashboard/tenant-overview";

describe("TenantOverview outside-Domus status", () => {
  afterEach(() => {
    vi.useRealTimers();
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
        onPayCharge={vi.fn()}
        onRequestManualPaymentConfirmation={vi.fn()}
      />
    );

    expect(screen.getByText(/You pay \$2,350 outside Domus/i)).toBeInTheDocument();
    expect(screen.queryByText(/overdue/i)).not.toBeInTheDocument();
  });
});
