import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KpiGrid } from "@/components/dashboard/kpi-grid";

describe("KpiGrid", () => {
  const baseProps = {
    kpis: {
      monthlyGrossRentCents: 425000,
      activeLeaseCount: 7,
      occupiedUnits: 8,
      totalUnits: 10,
      openMaintenanceCount: 3,
      highPriorityMaintenanceCount: 1,
      lateRentCents: 95000,
      lateAccountCount: 2,
      collectedRentCents: 320000,
      pendingRentCents: 85000,
      overdueRentCents: 20000,
      collectionRate: 75.294,
      outstandingCents: 105000,
      outstandingAccountCount: 2,
      netCashFlowCents: 0
    },
    occupancy: 80,
    netCashFlowCents: 185000,
    revenueTrend: "up" as const,
    occupancyTrend: "flat" as const,
    collectionTrend: "down" as const
  };

  it("renders six KPI cards with the expected labels", () => {
    render(<KpiGrid {...baseProps} />);

    expect(screen.getByText("Monthly Revenue")).toBeInTheDocument();
    expect(screen.getByText("Occupancy")).toBeInTheDocument();
    expect(screen.getByText("Rent Collection")).toBeInTheDocument();
    expect(screen.getByText("Outstanding")).toBeInTheDocument();
    expect(screen.getByText("Open Tickets")).toBeInTheDocument();
    expect(screen.getByText("Net Cash Flow")).toBeInTheDocument();
  });

  it("shows formatted currency for monthly revenue and outstanding balances", () => {
    render(<KpiGrid {...baseProps} />);

    expect(screen.getByText("$4,250")).toBeInTheDocument();
    expect(screen.getByText("$1,050")).toBeInTheDocument();
  });

  it("shows occupancy percentage and unit subtitle", () => {
    render(<KpiGrid {...baseProps} />);

    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("8/10 units")).toBeInTheDocument();
  });

  it("shows rent collection percent and collected-vs-due subtitle", () => {
    render(<KpiGrid {...baseProps} />);

    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("$3,200 of $4,250")).toBeInTheDocument();
  });

  it("shows the open maintenance count and urgency subtitle", () => {
    render(<KpiGrid {...baseProps} />);

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("1 high priority")).toBeInTheDocument();
  });

  it("shows signed cash flow values", () => {
    const { rerender } = render(<KpiGrid {...baseProps} netCashFlowCents={185000} />);
    expect(screen.getByText("+$1,850")).toBeInTheDocument();
    expect(screen.getByText("YTD Profit")).toBeInTheDocument();

    rerender(<KpiGrid {...baseProps} netCashFlowCents={-220000} />);
    expect(screen.getByText("-$2,200")).toBeInTheDocument();
    expect(screen.getByText("YTD Loss")).toBeInTheDocument();
  });

  it("renders trend arrows when trend data is provided", () => {
    render(<KpiGrid {...baseProps} />);

    expect(screen.getByText("↑")).toBeInTheDocument();
    expect(screen.getByText("→")).toBeInTheDocument();
    expect(screen.getByText("↓")).toBeInTheDocument();
  });

  it("handles zero values gracefully", () => {
    render(
      <KpiGrid
        {...baseProps}
        kpis={{
          ...baseProps.kpis,
          monthlyGrossRentCents: 0,
          activeLeaseCount: 0,
          occupiedUnits: 0,
          totalUnits: 0,
          openMaintenanceCount: 0,
          highPriorityMaintenanceCount: 0,
          lateRentCents: 0,
          lateAccountCount: 0,
          collectedRentCents: 0,
          pendingRentCents: 0,
          overdueRentCents: 0,
          collectionRate: 0,
          outstandingCents: 0,
          outstandingAccountCount: 0
        }}
        occupancy={0}
        netCashFlowCents={0}
        revenueTrend={null}
        occupancyTrend={null}
        collectionTrend={null}
      />
    );

    expect(screen.getByText("$0 of $0")).toBeInTheDocument();
    expect(screen.getAllByText("0%")).toHaveLength(2);
    expect(screen.getByText("0 active leases")).toBeInTheDocument();
    expect(screen.getByText("No urgent issues")).toBeInTheDocument();
    expect(screen.getByText("0 accounts")).toBeInTheDocument();
    expect(screen.getByText("+$0")).toBeInTheDocument();
  });
});
