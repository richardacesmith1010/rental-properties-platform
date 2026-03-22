import { describe, expect, it } from "vitest";
import {
  buildExpenseCategoryMetrics,
  buildMaintenanceMetrics,
  buildOccupancyMetrics,
  buildRentMetrics,
  calculateOccupancyRate,
  formatAverageDaysToPayment,
  type MonthWindow
} from "../analytics";

const monthWindows: MonthWindow[] = [
  {
    key: "2026-01",
    label: "Jan 2026",
    startIso: "2026-01-01",
    endIso: "2026-01-31"
  },
  {
    key: "2026-02",
    label: "Feb 2026",
    startIso: "2026-02-01",
    endIso: "2026-02-28"
  }
];

describe("analytics transformations", () => {
  it("builds zeroed rent metrics for empty charges", () => {
    const result = buildRentMetrics([], monthWindows, "2026-01-01", "2026-02");

    expect(result.totalIncomeCentsYtd).toBe(0);
    expect(result.collectionRate).toBe(0);
    expect(result.rentMetrics).toEqual([
      { month: "Jan 2026", dueCents: 0, collectedCents: 0, lateCents: 0 },
      { month: "Feb 2026", dueCents: 0, collectedCents: 0, lateCents: 0 }
    ]);
  });

  it("aggregates due, collected, and late rent by month", () => {
    const result = buildRentMetrics(
      [
        {
          id: "charge-1",
          lease_id: "lease-1",
          due_date: "2026-01-05",
          amount_cents: 150000,
          status: "paid",
          category: "rent"
        },
        {
          id: "charge-2",
          lease_id: "lease-1",
          due_date: "2026-02-05",
          amount_cents: 150000,
          status: "late",
          category: "rent"
        }
      ],
      monthWindows,
      "2026-01-01",
      "2026-02"
    );

    expect(result.rentMetrics).toEqual([
      { month: "Jan 2026", dueCents: 150000, collectedCents: 150000, lateCents: 0 },
      { month: "Feb 2026", dueCents: 150000, collectedCents: 0, lateCents: 150000 }
    ]);
    expect(result.totalIncomeCentsYtd).toBe(150000);
    expect(result.collectionRate).toBe(0);
  });

  it("ignores non-rent categories in rent metric totals", () => {
    const result = buildRentMetrics(
      [
        {
          id: "charge-1",
          lease_id: "lease-1",
          due_date: "2026-01-05",
          amount_cents: 150000,
          status: "paid",
          category: "utility"
        }
      ],
      monthWindows,
      "2026-01-01",
      "2026-01"
    );

    expect(result.rentMetrics[0]).toEqual({
      month: "Jan 2026",
      dueCents: 0,
      collectedCents: 0,
      lateCents: 0
    });
    expect(result.totalIncomeCentsYtd).toBe(150000);
  });

  it("computes collection rate from the current month", () => {
    const result = buildRentMetrics(
      [
        {
          id: "charge-1",
          lease_id: "lease-1",
          due_date: "2026-02-01",
          amount_cents: 100000,
          status: "paid",
          category: "rent"
        },
        {
          id: "charge-2",
          lease_id: "lease-2",
          due_date: "2026-02-02",
          amount_cents: 50000,
          status: "late",
          category: "rent"
        }
      ],
      monthWindows,
      "2026-01-01",
      "2026-02"
    );

    expect(result.collectionRate).toBeCloseTo(66.666, 2);
  });

  it("ignores charges that fall outside the provided month windows", () => {
    const result = buildRentMetrics(
      [
        {
          id: "charge-1",
          lease_id: "lease-1",
          due_date: "2025-12-31",
          amount_cents: 150000,
          status: "paid",
          category: "rent"
        }
      ],
      monthWindows,
      "2026-01-01",
      "2026-01"
    );

    expect(result.rentMetrics).toEqual([
      { month: "Jan 2026", dueCents: 0, collectedCents: 0, lateCents: 0 },
      { month: "Feb 2026", dueCents: 0, collectedCents: 0, lateCents: 0 }
    ]);
    expect(result.totalIncomeCentsYtd).toBe(0);
  });

  it("returns zero collection rate when no current month key is provided", () => {
    const result = buildRentMetrics(
      [
        {
          id: "charge-1",
          lease_id: "lease-1",
          due_date: "2026-01-05",
          amount_cents: 100000,
          status: "paid",
          category: "rent"
        }
      ],
      monthWindows,
      "2026-01-01",
      null
    );

    expect(result.collectionRate).toBe(0);
  });

  it("aggregates expense totals by category and sorts descending", () => {
    const result = buildExpenseCategoryMetrics([
      {
        property_id: "property-1",
        category: "maintenance",
        amount_cents: 40000,
        expense_date: "2026-01-10"
      },
      {
        property_id: "property-1",
        category: "insurance",
        amount_cents: 90000,
        expense_date: "2026-01-20"
      },
      {
        property_id: "property-1",
        category: "maintenance",
        amount_cents: 10000,
        expense_date: "2026-02-03"
      }
    ]);

    expect(result.totalExpenseCentsYtd).toBe(140000);
    expect(result.expenseCategories).toEqual([
      { category: "insurance", totalCents: 90000 },
      { category: "maintenance", totalCents: 50000 }
    ]);
  });

  it("returns an empty expense breakdown when no expenses exist", () => {
    const result = buildExpenseCategoryMetrics([]);

    expect(result).toEqual({ expenseCategories: [], totalExpenseCentsYtd: 0 });
  });

  it("keeps tied expense categories in stable descending totals", () => {
    const result = buildExpenseCategoryMetrics([
      {
        property_id: "property-1",
        category: "maintenance",
        amount_cents: 5000,
        expense_date: "2026-01-10"
      },
      {
        property_id: "property-1",
        category: "insurance",
        amount_cents: 5000,
        expense_date: "2026-01-11"
      }
    ]);

    expect(result.expenseCategories.map((item) => item.totalCents)).toEqual([5000, 5000]);
  });

  it("calculates occupancy rate for partially occupied portfolios", () => {
    expect(calculateOccupancyRate(3, 4)).toBe(75);
  });

  it("returns zero occupancy when no units exist", () => {
    expect(calculateOccupancyRate(2, 0)).toBe(0);
  });

  it("formats empty average days to pay values as an em dash", () => {
    expect(formatAverageDaysToPayment(0)).toBe("—");
    expect(formatAverageDaysToPayment(null)).toBe("—");
  });

  it("formats positive average days to pay with a day suffix", () => {
    expect(formatAverageDaysToPayment(3.25)).toBe("3.3d");
  });

  it("builds occupancy metrics using overlapping leases and unique unit counts", () => {
    const result = buildOccupancyMetrics(
      monthWindows,
      [
        {
          id: "lease-1",
          unit_id: "unit-1",
          start_date: "2025-12-15",
          end_date: "2026-02-20"
        },
        {
          id: "lease-2",
          unit_id: "unit-1",
          start_date: "2026-01-01",
          end_date: "2026-01-31"
        },
        {
          id: "lease-3",
          unit_id: "unit-2",
          start_date: "2026-02-01",
          end_date: "2026-12-31"
        }
      ],
      4
    );

    expect(result).toEqual([
      { month: "Jan 2026", occupiedUnits: 1, totalUnits: 4, rate: 25 },
      { month: "Feb 2026", occupiedUnits: 2, totalUnits: 4, rate: 50 }
    ]);
  });

  it("builds maintenance metrics for open and resolved tickets", () => {
    const result = buildMaintenanceMetrics(
      [
        {
          priority: "high",
          status: "resolved",
          created_at: "2026-01-01T00:00:00.000Z",
          resolved_at: "2026-01-04T00:00:00.000Z",
          updated_at: "2026-01-04T00:00:00.000Z",
          actual_cost_cents: 25000
        },
        {
          priority: "high",
          status: "open",
          created_at: "2026-01-05T00:00:00.000Z",
          resolved_at: null,
          updated_at: "2026-01-05T00:00:00.000Z",
          actual_cost_cents: 10000
        }
      ],
      "2026-01-01"
    );

    expect(result.maintenanceCostCentsYtd).toBe(35000);
    expect(result.maintenanceMetrics.find((metric) => metric.priority === "high")).toEqual({
      priority: "high",
      totalTickets: 2,
      resolvedTickets: 1,
      avgResolutionDays: 3
    });
  });

  it("falls back unknown priorities into the low bucket", () => {
    const result = buildMaintenanceMetrics(
      [
        {
          priority: "emergency",
          status: "closed",
          created_at: "2026-01-01T00:00:00.000Z",
          resolved_at: "2026-01-02T00:00:00.000Z",
          updated_at: "2026-01-02T00:00:00.000Z",
          actual_cost_cents: 5000
        }
      ],
      "2026-01-01"
    );

    expect(result.maintenanceMetrics.find((metric) => metric.priority === "low")).toEqual({
      priority: "low",
      totalTickets: 1,
      resolvedTickets: 1,
      avgResolutionDays: 1
    });
  });

  it("ignores invalid resolution timelines when averaging maintenance duration", () => {
    const result = buildMaintenanceMetrics(
      [
        {
          priority: "medium",
          status: "resolved",
          created_at: "2026-01-05T00:00:00.000Z",
          resolved_at: "2026-01-04T00:00:00.000Z",
          updated_at: "2026-01-04T00:00:00.000Z",
          actual_cost_cents: 1000
        }
      ],
      "2026-01-01"
    );

    expect(result.maintenanceMetrics.find((metric) => metric.priority === "medium")).toEqual({
      priority: "medium",
      totalTickets: 1,
      resolvedTickets: 1,
      avgResolutionDays: 0
    });
  });

  it("only counts maintenance costs for tickets created in the current year", () => {
    const result = buildMaintenanceMetrics(
      [
        {
          priority: "low",
          status: "closed",
          created_at: "2025-12-31T00:00:00.000Z",
          resolved_at: "2026-01-02T00:00:00.000Z",
          updated_at: "2026-01-02T00:00:00.000Z",
          actual_cost_cents: 1500
        }
      ],
      "2026-01-01"
    );

    expect(result.maintenanceCostCentsYtd).toBe(0);
  });
});
