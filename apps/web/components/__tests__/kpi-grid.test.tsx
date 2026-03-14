import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KpiGrid } from "@/components/dashboard/kpi-grid";

describe("KpiGrid", () => {
  const baseProps = {
    monthlyGrossRentCents: 425000,
    occupancy: 80,
    occupiedUnits: 8,
    totalUnits: 10,
    activeLeaseCount: 7,
    openMaintenanceCount: 3,
    highPriorityMaintenanceCount: 1,
    lateRentCents: 95000,
    lateAccountCount: 2
  };

  it("renders four KPI cards with the expected labels", () => {
    render(<KpiGrid {...baseProps} />);

    expect(screen.getByText("Monthly Gross Rent")).toBeInTheDocument();
    expect(screen.getByText("Occupancy")).toBeInTheDocument();
    expect(screen.getByText("Open Maintenance")).toBeInTheDocument();
    expect(screen.getByText("Late Rent")).toBeInTheDocument();
  });

  it("shows formatted currency for monthly gross rent", () => {
    render(<KpiGrid {...baseProps} />);

    expect(screen.getByText("$4,250")).toBeInTheDocument();
  });

  it("shows occupancy percentage", () => {
    render(<KpiGrid {...baseProps} />);

    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("8 of 10 units")).toBeInTheDocument();
  });

  it("shows the open maintenance count", () => {
    render(<KpiGrid {...baseProps} />);

    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("shows the late rent total and account count", () => {
    render(<KpiGrid {...baseProps} />);

    expect(screen.getByText("$950")).toBeInTheDocument();
    expect(screen.getByText("2 accounts")).toBeInTheDocument();
  });

  it("handles zero values gracefully", () => {
    render(
      <KpiGrid
        {...baseProps}
        monthlyGrossRentCents={0}
        occupancy={0}
        occupiedUnits={0}
        totalUnits={0}
        activeLeaseCount={0}
        openMaintenanceCount={0}
        highPriorityMaintenanceCount={0}
        lateRentCents={0}
        lateAccountCount={0}
      />
    );

    expect(screen.getAllByText("$0")).toHaveLength(2);
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.getByText("0 active leases")).toBeInTheDocument();
    expect(screen.getByText("0 high priority")).toBeInTheDocument();
    expect(screen.getByText("0 accounts")).toBeInTheDocument();
  });

  it("renders the high priority badge text", () => {
    render(<KpiGrid {...baseProps} highPriorityMaintenanceCount={4} />);

    expect(screen.getByText("4 high priority")).toBeInTheDocument();
  });

  it("renders the active lease count badge text", () => {
    render(<KpiGrid {...baseProps} activeLeaseCount={11} />);

    expect(screen.getByText("11 active leases")).toBeInTheDocument();
  });
});
