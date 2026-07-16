import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
      displayDashboardData: { charges: [] },
      filteredPortfolio: { leases: [] },
      filteredTickets: [],
      isOwnerRole: true
    } as never
  );

  const bankStep = state.ownerOnboarding.steps.find((step) => step.id === "bank");
  return <div>{bankStep?.completed ? "complete" : "incomplete"}</div>;
}

describe("useDashboardHomeState", () => {
  it("marks the bank checklist step complete from rentCollectionConnected even when the profile flag is false", () => {
    render(<DashboardHomeStateHarness />);

    expect(screen.getByText("complete")).toBeInTheDocument();
  });
});
