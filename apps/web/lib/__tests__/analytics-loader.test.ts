import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ selects: [] as Array<[string, string]>,
  rows: {} as Record<string, Array<Record<string, unknown>>>, paymentFilters: [] as string[] }));
vi.mock("@/lib/property-access", () => ({
  getAdministeredPropertyIds: async () => ["home-1"], getAdministeredPropertyIdsForAccount: async () => ["home-1"]
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({
  from: (table: string) => {
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    const result = () => ({ data: (mocks.rows[table] ?? (table === "units"
      ? [{ id: "unit-1", property_id: "home-1" }]
      : table === "maintenance_tickets" ? [{ property_id: "home-1", priority: "high", status: "resolved",
        created_at: "2026-01-01T00:00:00Z", resolved_at: "2026-01-04T00:00:00Z", actual_cost_cents: 25000 }]
        : [])).filter((row) => filters.every((filter) => filter(row))), error: null });
    const query = {
      select: (columns: string) => { mocks.selects.push([table, columns]); return query; },
      in: (key: string, ids: unknown[]) => { filters.push((row) => ids.includes(row[key])); return query; },
      is: (key: string, value: unknown) => { if (table === "payments") mocks.paymentFilters.push(key);
        filters.push((row) => row[key] === value); return query; },
      gte: () => query, lte: () => query,
      then: (resolve: (value: ReturnType<typeof result>) => unknown) => resolve(result())
    };
    return query;
  }
}) }));

import { getOwnerAnalyticsData } from "@/lib/analytics-loader";

describe("getOwnerAnalyticsData maintenance query", () => {
  beforeEach(() => { mocks.rows = {}; mocks.paymentFilters = []; });
  it("ignores reversed payments when averaging days to payment", async () => {
    mocks.paymentFilters = [];
    mocks.rows = {
      leases: [{ id: "lease-1", unit_id: "unit-1", start_date: "2026-01-01", end_date: "2026-12-31",
        collects_outside_domus: false }],
      rent_charges: [{ id: "charge-1", lease_id: "lease-1", due_date: "2026-01-01",
        amount_cents: 10000, status: "paid", category: "rent", deleted_at: null }],
      payments: [
        { rent_charge_id: "charge-1", paid_at: "2026-01-01T00:00:00Z", reversed_at: "2026-01-04" },
        { rent_charge_id: "charge-1", paid_at: "2026-01-04T00:00:00Z", reversed_at: null }
      ]
    };
    const result = await getOwnerAnalyticsData("owner-1");
    expect(mocks.paymentFilters).toEqual(["reversed_at"]);
    expect(result.summaryKpis.avgDaysToPayment).toBe(3);
    mocks.rows = {};
  });
  it("selects live maintenance columns and returns repair stats from tickets", async () => {
    mocks.selects.length = 0;
    const result = await getOwnerAnalyticsData("owner-1");
    const select = mocks.selects.find(([table]) => table === "maintenance_tickets")?.[1];
    expect(select).toBe("priority, status, created_at, resolved_at, actual_cost_cents");
    expect(select).not.toContain("updated_at");
    expect(result.maintenanceMetrics.find((metric) => metric.priority === "high"))
      .toMatchObject({ totalTickets: 1, resolvedTickets: 1, avgResolutionDays: 3 });
  });
});
