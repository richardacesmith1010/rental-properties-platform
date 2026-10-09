import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useDashboardKpiData } from "@/components/dashboard/dashboard-kpi-loader";
import type { PortfolioData, PropertyListItem } from "@/lib/portfolio";

const homes: PropertyListItem[] = ["a", "b", "c"].map((id) => ({
  id, name: id, addressLine1: id, city: "Denver", state: "CO", postalCode: "80201",
  ownerAccountId: id === "c" ? "owner" : "client", ownerAccountName: id === "c" ? "Owner" : "Client",
  ownerAccountIsClient: id !== "c", managementFeeCents: 0, unitCount: 1, active: true
}));
const portfolio: PortfolioData = {
  properties: homes,
  units: homes.map((home) => ({ id: `u-${home.id}`, propertyId: home.id, propertyName: home.name,
    unitNumber: "1", bedrooms: 1, bathrooms: 1, monthlyRentCents: 100, squareFeet: null,
    occupied: true, active: true })),
  leases: [], tenants: []
};
const charges = homes.map((home) => ({ propertyId: home.id, status: "late", amountCents: 100,
  category: "rent", dueDate: "2026-01-01", leaseId: `l-${home.id}`,
  collectsOutsideDomus: true, clientHome: home.ownerAccountIsClient }));
const tickets = homes.map((home) => ({ propertyId: home.id, status: "open", priority: "high" }));

function renderScope(role: "manager" | "owner", initialPropertyId?: string, initialAccountId?: string) {
  const props = { initialPropertyId, initialAccountId } as never;
  const params = {
    safePortfolio: portfolio, safeTickets: tickets, safeVendors: [], safeInboxThreads: [],
    safeNotifications: [], safeCapabilities: { leasingPipelineEnabled: false, ownershipEnabled: false },
    safeManagerPaymentManagers: [],
    safeDashboardData: { profileRole: role, charges, kpis: {} },
    safeExpenses: { expenses: [], pnlByProperty: homes.map((home) => ({ propertyId: home.id, netCents: 10 })) },
    safeAnalytics: { enabled: false, summaryKpis: { netIncomeCentsYtd: 30 } }
  } as never;
  return renderHook(() => useDashboardKpiData(props, params));
}

describe("dashboard home scope", () => {
  beforeEach(() => window.history.replaceState(null, "", "/manager?section=charges"));

  it("counts only client outside-Domus late rent in the manager nav badge", () => {
    const { result } = renderScope("manager");
    expect(result.current.chargeBadgeCount).toBe(2);
  });

  it("filters manager portfolio, charges, tickets, KPIs and cash flow by account or home", () => {
    const { result } = renderScope("manager");
    act(() => result.current.selectScope("account:client"));
    expect(result.current.filteredPortfolio.properties.map((home) => home.id)).toEqual(["a", "b"]);
    expect(result.current.filteredTickets).toHaveLength(2);
    expect(result.current.displayDashboardData.charges).toHaveLength(2);
    expect(result.current.displayDashboardData.kpis.totalUnits).toBe(2);
    expect(result.current.displayDashboardData.kpis.netCashFlowCents).toBe(20);
    expect(result.current.selectedPropertySummary?.property).toMatchObject({ name: "Client", address: undefined });
    expect(window.location.search).toBe("?section=charges&account=client");
    window.history.replaceState(null, "", "/manager?section=leases&account=client");
    expect(window.location.search).toBe("?section=leases&account=client");
    act(() => result.current.selectScope("property:c"));
    expect(result.current.filteredPortfolio.properties.map((home) => home.id)).toEqual(["c"]);
    expect(result.current.displayDashboardData.charges).toHaveLength(1);
    expect(window.location.search).toBe("?section=leases&property=c");
    act(() => result.current.selectScope(""));
    expect(result.current.filteredPortfolio.properties).toHaveLength(3);
    expect(window.location.search).toBe("?section=leases");
  });

  it("preserves owner property-only filtering and URL behavior", () => {
    const { result } = renderScope("owner", "a");
    expect(result.current.filteredPortfolio.properties.map((home) => home.id)).toEqual(["a"]);
    expect(result.current.filteredTickets).toHaveLength(1);
    expect(result.current.displayDashboardData.charges).toHaveLength(1);
    expect(result.current.displayDashboardData.kpis.totalUnits).toBe(1);
    act(() => result.current.selectProperty("b"));
    expect(window.location.search).toBe("?section=charges&property=b");
  });

  it("restores account selection and clears stale ids", () => {
    window.history.replaceState(null, "", "/manager?section=charges&account=client");
    const selected = renderScope("manager", null as never, "client");
    expect(selected.result.current.selectedScopeValue).toBe("account:client");
    selected.unmount();
    window.history.replaceState(null, "", "/manager?section=charges&account=stale");
    const stale = renderScope("manager", undefined, "stale");
    expect(stale.result.current.selectedScopeValue).toBe("");
    expect(window.location.search).toBe("?section=charges");
  });
});
