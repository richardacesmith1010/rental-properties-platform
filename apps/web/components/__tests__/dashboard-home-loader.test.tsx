import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDashboardHomeState } from "@/components/dashboard/dashboard-home-loader";

function DashboardHomeStateHarness() {
  const state = useDashboardHomeState(
    {
      activeAccountId: "account-1",
      stripeConnected: false,
      rentCollectionConnected: true,
      ownershipMembers: []
    } as never,
    {
      activeOwnershipAccount: null,
      safeManagerPayments: [],
      safeOwnershipAccounts: [{ id: "account-1" }],
      safePortfolio: { properties: [], units: [], leases: [], tenants: [] }
    } as never,
    {
      displayDashboardData: {
        charges: [],
        kpis: { collectedRentCents: 0, pendingRentCents: 0, overdueRentCents: 0 }
      },
      filteredPortfolio: { leases: [] },
      filteredTickets: [],
      isOwnerRole: true
    } as never
  );

  return <div>{state.ownerOnboarding.steps.map((step) => step.id).join(",")}</div>;
}

describe("useDashboardHomeState", () => {
  afterEach(() => vi.useRealTimers());
  it("does not include bank setup in the welcome checklist", () => {
    render(<DashboardHomeStateHarness />);

    expect(screen.getByText("profile,account,property,unit,lease")).toBeInTheDocument();
    expect(screen.queryByText(/bank/i)).not.toBeInTheDocument();
  });

  it("builds tiles and excludes outside-Domus rent from late rows", () => {
    function SummaryHarness() {
      const state = useDashboardHomeState(
        { inboxThreads: [{ id: "thread-1" }] } as never,
        {
          activeOwnershipAccount: null,
          safeOwnershipAccounts: [],
          safePortfolio: {
            properties: [{ id: "home-1" }, { id: "home-2" }],
            units: [{ propertyId: "home-1", occupied: true }],
            leases: [], tenants: []
          }
        } as never,
        {
          displayDashboardData: {
            charges: [
              { id: "late-in", leaseId: "lease-1", category: "rent", status: "late", dueDate: "2026-10-01", amountCents: 100000 },
              { id: "late-out", leaseId: "lease-2", category: "rent", status: "late", dueDate: "2026-10-01", amountCents: 90000, collectsOutsideDomus: true },
              { id: "next", leaseId: "lease-3", category: "rent", status: "pending", dueDate: "2026-11-01", amountCents: 120000 }
            ],
            kpis: { collectedRentCents: 200000, pendingRentCents: 120000, overdueRentCents: 100000 }
          },
          filteredPortfolio: { leases: [] }, filteredTickets: [{ status: "open" }], isOwnerRole: true
        } as never
      );
      const summary = state.homeActionItems;
      return <div>{summary.lateCharges.map((charge) => charge.id).join(",")}|{summary.homeCount}|{summary.rentedHomeCount}|{summary.dueCents}|{summary.newMessageCount}|{summary.openRepairCount}</div>;
    }

    render(<SummaryHarness />);
    expect(screen.getByText("late-in|2|1|420000|1|1")).toBeInTheDocument();
  });

  it.each([
    {
      name: "uses the earliest pending rent",
      charges: [{ id: "next", leaseId: "lease-1", category: "rent", status: "pending", dueDate: "2026-10-20", amountCents: 125000 }],
      leases: [{ id: "lease-1", active: true, startDate: "2026-01-01", endDate: "2027-12-31", dueDayOfMonth: 20, monthlyRentCents: 125000, tenantProfileId: "tenant-1", collectsOutsideDomus: false }],
      expected: "2026-10-20|125000|1"
    },
    {
      name: "uses the lease due day before rent exists",
      charges: [],
      leases: [{ id: "lease-1", active: true, startDate: "2026-01-01", endDate: "2027-12-31", dueDayOfMonth: 12, monthlyRentCents: 140000, tenantProfileId: "tenant-1", collectsOutsideDomus: false }],
      expected: "2026-10-12|140000|1"
    },
    {
      name: "skips rent collected outside Domus",
      charges: [],
      leases: [{ id: "lease-1", active: true, startDate: "2026-01-01", endDate: "2027-12-31", dueDayOfMonth: 12, monthlyRentCents: 140000, tenantProfileId: "tenant-1", collectsOutsideDomus: true }],
      expected: "none|0|0"
    },
    { name: "shows no rent without leases", charges: [], leases: [], expected: "none|0|0" }
  ])("$name", ({ charges, leases, expected }) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-04T12:00:00.000Z"));

    function SummaryHarness() {
      const state = useDashboardHomeState(
        {} as never,
        { activeOwnershipAccount: null, safeOwnershipAccounts: [], safePortfolio: { properties: [], units: [], leases, tenants: [] } } as never,
        { displayDashboardData: { charges, kpis: { collectedRentCents: 0, pendingRentCents: 0, overdueRentCents: 0 } }, filteredPortfolio: { leases }, filteredTickets: [], isOwnerRole: true } as never
      );
      const summary = state.homeActionItems;
      return <div>{summary.nextDueDate ?? "none"}|{summary.nextDueAmountCents}|{summary.nextDueTenantCount}</div>;
    }

    render(<SummaryHarness />);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});
