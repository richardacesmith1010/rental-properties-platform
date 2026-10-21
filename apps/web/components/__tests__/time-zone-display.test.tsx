import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TenantRentCard } from "@/components/dashboard/tenant-rent-card";
import { ChargeRow, type ChargeRowData } from "@/components/dashboard/charge-row";
import { TenantActivityTimeline } from "@/components/dashboard/tenant-activity-timeline";
import { BankBalancesCard } from "@/components/bank-feed/bank-balances-card";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  useFormState: (action: unknown, initial: unknown) => [initial, action],
  useFormStatus: () => ({ pending: false })
}));

describe("Denver component display", () => {
  it("B3 renders paid rent from a full timestamp", () => {
    render(<TenantRentCard charges={[]} payState="paid" rentDueDate={null} rentAmountCents={100000}
      lastPaidAt="2026-10-02T16:00:00+00:00" onPayCharge={vi.fn()}
      onRequestManualPaymentConfirmation={vi.fn()} />);
    expect(screen.getByText("October rent")).toBeInTheDocument();
  });

  it("B4 shows the prior Denver day in the charge badge", () => {
    const charge: ChargeRowData = {
      id: "charge", propertyId: "home", dueDate: "2026-10-01", amountCents: 100000,
      status: "pending", category: "rent", tenantReportedPaidAt: "2026-10-21T03:00:00Z"
    };
    render(<ChargeRow charge={charge} last batchActionsEnabled={false} selected={false}
      onToggleSelection={vi.fn()} canModify={false} category="rent" isTenantView={false}
      paymentsAvailable={false} stripeConfigured={false} onPayCharge={vi.fn()}
      showManualPayment={false} manualFormOpen={false} manualPaymentAction={vi.fn()}
      isMutatingCharges={false} />);
    expect(screen.getByText(/Tenant says paid/).textContent).toContain("Tenant says paid · Oct 20");
  });

  it("B5 shows the Denver time in tenant activity", async () => {
    render(<TenantActivityTimeline tenantProfileId="tenant" propertyId="home" tenantName="Taylor"
      onLoadEntries={vi.fn().mockResolvedValue([{
        id: "entry", tenantProfileId: "tenant", propertyId: "home", activityType: "note",
        title: "Called", description: null, createdAt: "2026-10-21T04:37:00Z",
        createdBy: "owner", authorName: "Ace"
      }])} onCreateActivity={vi.fn()} />);
    expect((await screen.findByText("10:37 PM")).textContent).toEqual("10:37 PM");
  });

  it("B6 shows the Denver date for a bank balance", () => {
    render(<BankBalancesCard accounts={[{
      id: "bank", nickname: "Bank", source: "upload", balance_cents: 100,
      balance_as_of: "2026-10-21T03:00:00Z"
    }]} save={vi.fn()} />);
    expect(screen.getByText("as of Oct 20, 2026").textContent).toEqual("as of Oct 20, 2026");
  });
});
