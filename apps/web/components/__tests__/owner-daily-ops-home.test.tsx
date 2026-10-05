import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OwnerDailyOpsHome } from "@/components/dashboard/owner-daily-ops-home";

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return { ...actual, useFormState: () => [null, vi.fn()] as const, useFormStatus: () => ({ pending: false }) };
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/dashboard/financial-overview-panel", () => ({
  FinancialOverviewPanel: () => <div>Financial details</div>
}));

const financialOverview = {
  accountId: null, plaidConnected: false, bankName: null, bankMask: null,
  balanceCents: null, balanceUpdatedAt: null, monthlyCollectedCents: 0,
  monthlyOutstandingCents: 0, monthlyExpensesCents: 0, netIncomeCents: 0,
  ytdIncomeCents: 0, ytdExpensesCents: 0, collectionRate: 0
};

const summary = {
  lateCharges: [{
    id: "charge-1", leaseId: "lease-1", propertyId: "property-1",
    dueDate: "2026-10-01", amountCents: 120000, status: "late" as const,
    propertyName: "Forum House", unitNumber: "1A", tenantName: "Maya Bell",
    category: "rent" as const
  }],
  openRepairCount: 0, newMessageCount: 0, collectedCents: 300000,
  dueCents: 500000, homeCount: 2, rentedHomeCount: 1,
  nextDueDate: "2026-11-01", nextDueAmountCents: 240000, nextDueTenantCount: 2
};

describe("OwnerDailyOpsHome", () => {
  it("shows one bank card only when setup is needed", () => {
    const { rerender } = render(
      <OwnerDailyOpsHome bankState={{ status: "not_started", href: "/connect/onboard" }} summary={summary} onOpenSection={vi.fn()} financialOverview={financialOverview} />
    );
    expect(screen.getAllByText("Connect your bank to get paid")).toHaveLength(1);

    rerender(<OwnerDailyOpsHome bankState={{ status: "connected", href: "/connect/onboard" }} summary={summary} onOpenSection={vi.fn()} financialOverview={financialOverview} />);
    expect(screen.queryByText("Connect your bank to get paid")).not.toBeInTheDocument();
  });

  it("renders late rent actions and summary tiles", async () => {
    const reminder = vi.fn(async () => ({ success: true as const }));
    render(
      <OwnerDailyOpsHome bankState={{ status: "connected", href: "/connect/onboard" }} summary={summary} onOpenSection={vi.fn()} onSendBatchPaymentReminder={reminder} onRecordManualPayment={vi.fn()} financialOverview={financialOverview} />
    );

    expect(screen.getByText("Maya Bell owes $1,200")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send reminder" }));
    await waitFor(() => expect(reminder).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Mark as paid" }));
    expect(screen.getByRole("button", { name: "Save Payment" })).toBeInTheDocument();
    expect(screen.getByText("$3,000 of $5,000")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 rented")).toBeInTheDocument();
    expect(screen.getByText("$2,400 from 2 tenants")).toBeInTheDocument();
    expect(screen.getByText("No open repairs. No new messages.")).toBeInTheDocument();
  });

  it("handles a zero-home portfolio", () => {
    render(<OwnerDailyOpsHome bankState={{ status: "connected", href: "/connect/onboard" }} summary={{ ...summary, lateCharges: [], homeCount: 0, rentedHomeCount: 0 }} onOpenSection={vi.fn()} financialOverview={financialOverview} />);
    expect(screen.getByText("0 of 0 rented")).toBeInTheDocument();
  });
});
