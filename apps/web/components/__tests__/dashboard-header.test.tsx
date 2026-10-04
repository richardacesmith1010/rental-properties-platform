import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import type { DashboardData } from "@/lib/dashboard";

vi.mock("@/components/ui/count-up", () => ({
  CountUp: ({ target, prefix = "", suffix = "" }: { target: number; prefix?: string; suffix?: string }) => (
    <span>{prefix}{target}{suffix}</span>
  )
}));

const kpis: DashboardData["kpis"] = {
  monthlyGrossRentCents: 500000,
  activeLeaseCount: 2,
  occupiedUnits: 2,
  totalUnits: 2,
  openMaintenanceCount: 0,
  highPriorityMaintenanceCount: 0,
  lateRentCents: 200,
  lateAccountCount: 1,
  collectedRentCents: 499800,
  pendingRentCents: 0,
  overdueRentCents: 200,
  collectionRate: 99.96,
  outstandingCents: 200,
  outstandingAccountCount: 1,
  netCashFlowCents: 0
};

describe("DashboardHeader", () => {
  it.each(["owner", "manager"] as const)("labels the %s late-lease KPI as tenants behind", (role) => {
    render(
      <DashboardHeader
        role={role}
        kpis={kpis}
        occupancy={100}
        propertyCount={1}
        userEmail="owner@example.com"
      />
    );

    expect(screen.getByText("Tenants behind")).toBeInTheDocument();
    expect(screen.queryByText("Overdue charges")).not.toBeInTheDocument();
    expect(screen.queryByText("Late accounts")).not.toBeInTheDocument();
  });
});
