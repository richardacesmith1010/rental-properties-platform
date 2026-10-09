import { describe, expect, it } from "vitest";
import { computeFilteredKpis } from "@/components/dashboard/dashboard-kpi-loader";
import { computeActionItems } from "@/lib/action-items";
import { buildRentMetrics, type MonthWindow } from "@/lib/analytics";
import { getDashboardChargeStatus, type DashboardCharge, type DashboardKpis } from "@/lib/dashboard";
import { isCollectedOutsideDomus, tracksLateRent } from "@/lib/lease-collection";
import { getManagerChargeStatus, summarizeManagerLateCharges } from "@/lib/manager-dashboard";
import { getChargeUrgency } from "@/lib/rent-urgency";
import { getTenantChargeStatus } from "@/lib/tenant-payments";

const monthWindows: MonthWindow[] = [
  {
    key: "2026-10",
    label: "Oct 2026",
    startIso: "2026-10-01",
    endIso: "2026-10-31"
  }
];

const baseKpis: DashboardKpis = {
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
  outstandingAccountCount: 0,
  netCashFlowCents: 0
};

function dashboardCharge(overrides: Partial<DashboardCharge> = {}): DashboardCharge {
  const now = new Date();
  const dueDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
  return {
    id: "charge-1",
    leaseId: "lease-1",
    propertyId: "property-1",
    tenantProfileId: "tenant-1",
    dueDate,
    amountCents: 235000,
    status: "late",
    propertyName: "Domus House",
    unitNumber: "1",
    tenantName: "Tenant",
    category: "rent",
    ...overrides
  };
}

describe("outside-Domus collection rules", () => {
  it("tracks late rent for ordinary and client homes only", () => {
    expect(tracksLateRent({ collects_outside_domus: false })).toBe(true);
    expect(tracksLateRent({ collects_outside_domus: true, clientHome: false })).toBe(false);
    expect(tracksLateRent({ collects_outside_domus: true, clientHome: true })).toBe(true);
    expect(tracksLateRent({ collectsOutsideDomus: true, client_home: true })).toBe(true);
  });

  it("keeps client rent late across manager, KPIs, analytics, action items and urgency", () => {
    const lease = { collects_outside_domus: true, clientHome: true };
    expect(getDashboardChargeStatus("late", lease)).toBe("late");
    expect(getManagerChargeStatus("late", lease)).toBe("late");
    expect(summarizeManagerLateCharges(
      [{ lease_id: "client", amount_cents: 235000 }], new Map([["client", lease]])
    )).toEqual({ lateRentCents: 235000, lateAccountCount: 1 });
    const charge = dashboardCharge({ collectsOutsideDomus: true, clientHome: true });
    const kpis = computeFilteredKpis({
      baseKpis, charges: [charge], tickets: [],
      portfolio: { properties: [], units: [], leases: [], tenants: [] }, netCashFlowCents: 0
    });
    expect(kpis.lateRentCents).toBe(235000);
    expect(computeActionItems({
      charges: [charge], tickets: [], managerPayments: [], leases: [],
      pendingInvitations: [], newFeedbackCount: 0,
      today: new Date("2026-10-10T12:00:00.000Z")
    }).some((item) => item.kind === "overdue_charge")).toBe(true);
    expect(buildRentMetrics([{
      id: "charge-1", lease_id: "client", due_date: "2026-10-01",
      amount_cents: 235000, status: "late", category: "rent"
    }], monthWindows, "2026-01-01", "2026-10", new Map([["client", lease]]))
      .rentMetrics[0]?.lateCents).toBe(235000);
    expect(getChargeUrgency({
      status: "late", dueDate: "2026-10-01", collectsOutsideDomus: true, clientHome: true
    }, new Date("2026-10-10T12:00:00.000Z")).level).toBe("overdue");
  });
  it("recognizes database and DTO lease shapes", () => {
    expect(isCollectedOutsideDomus({ collects_outside_domus: true })).toBe(true);
    expect(isCollectedOutsideDomus({ collectsOutsideDomus: true })).toBe(true);
    expect(isCollectedOutsideDomus({ collects_outside_domus: false })).toBe(false);
    expect(isCollectedOutsideDomus(undefined)).toBe(false);
  });

  it("normalizes historical late status for dashboard display without changing outstanding totals", () => {
    const displayStatus = getDashboardChargeStatus("late", {
      collects_outside_domus: true
    });
    expect(displayStatus).toBe("pending");

    const ordinary = computeFilteredKpis({
      baseKpis,
      charges: [dashboardCharge()],
      tickets: [],
      portfolio: { properties: [], units: [], leases: [], tenants: [] },
      netCashFlowCents: 0
    });
    const outsideDomus = computeFilteredKpis({
      baseKpis,
      charges: [dashboardCharge({ status: displayStatus, collectsOutsideDomus: true })],
      tickets: [],
      portfolio: { properties: [], units: [], leases: [], tenants: [] },
      netCashFlowCents: 0
    });

    expect(outsideDomus.overdueRentCents).toBe(0);
    expect(outsideDomus.lateRentCents).toBe(0);
    expect(outsideDomus.outstandingCents).toBe(ordinary.outstandingCents);
    expect(outsideDomus.outstandingAccountCount).toBe(ordinary.outstandingAccountCount);
    expect(outsideDomus.pendingRentCents + outsideDomus.overdueRentCents).toBe(
      ordinary.pendingRentCents + ordinary.overdueRentCents
    );
    expect(outsideDomus.collectedRentCents).toBe(ordinary.collectedRentCents);
  });

  it("excludes flagged leases from manager late KPIs and displays them as pending", () => {
    const leases = new Map([
      ["lease-outside", { collects_outside_domus: true }],
      ["lease-domus", { collects_outside_domus: false }]
    ]);
    const summary = summarizeManagerLateCharges(
      [
        { lease_id: "lease-outside", amount_cents: 235000 },
        { lease_id: "lease-domus", amount_cents: 150000 }
      ],
      leases
    );

    expect(summary).toEqual({ lateRentCents: 150000, lateAccountCount: 1 });
    expect(getManagerChargeStatus("late", leases.get("lease-outside"))).toBe("pending");
    expect(getManagerChargeStatus("late", leases.get("lease-domus"))).toBe("late");
  });

  it("removes flagged historical late charges from action items", () => {
    const items = computeActionItems({
      charges: [dashboardCharge({ collectsOutsideDomus: true })],
      tickets: [],
      managerPayments: [],
      leases: [],
      pendingInvitations: [],
      newFeedbackCount: 0,
      today: new Date("2026-10-10T12:00:00.000Z")
    });

    expect(items.find((item) => item.kind === "overdue_charge")).toBeUndefined();
  });

  it("keeps analytics due and collected amounts identical while excluding flagged late amounts", () => {
    const charges = [
      {
        id: "charge-paid",
        lease_id: "lease-outside",
        due_date: "2026-10-01",
        amount_cents: 100000,
        status: "paid" as const,
        category: "rent"
      },
      {
        id: "charge-late",
        lease_id: "lease-outside",
        due_date: "2026-10-01",
        amount_cents: 135000,
        status: "late" as const,
        category: "rent"
      }
    ];
    const ordinary = buildRentMetrics(charges, monthWindows, "2026-01-01", "2026-10");
    const outsideDomus = buildRentMetrics(
      charges,
      monthWindows,
      "2026-01-01",
      "2026-10",
      new Map([["lease-outside", { collects_outside_domus: true }]])
    );

    expect(outsideDomus.rentMetrics[0]?.lateCents).toBe(0);
    expect(outsideDomus.rentMetrics[0]?.dueCents).toBe(ordinary.rentMetrics[0]?.dueCents);
    expect(outsideDomus.rentMetrics[0]?.collectedCents).toBe(
      ordinary.rentMetrics[0]?.collectedCents
    );
    expect(outsideDomus.collectionRate).toBe(ordinary.collectionRate);
  });

  it("keeps flagged past-due tenant charges plain pending and not overdue", () => {
    const lease = { collects_outside_domus: true };
    expect(getTenantChargeStatus("late", lease)).toBe("pending");
    expect(
      getChargeUrgency(
        {
          status: "pending",
          dueDate: "2026-10-01",
          collectsOutsideDomus: true
        },
        new Date("2026-10-10T12:00:00.000Z")
      )
    ).toEqual({ level: "none", daysUntilDue: -9 });
  });
});
