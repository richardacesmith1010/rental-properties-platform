import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ selects: [] as Array<[string, string]> }));
vi.mock("@/lib/property-access", () => ({
  getAdministeredPropertyIds: async () => ["home-1"], getAdministeredPropertyIdsForAccount: async () => ["home-1"]
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({
  from: (table: string) => {
    const result = { data: table === "units" ? [{ id: "unit-1", property_id: "home-1" }]
      : table === "maintenance_tickets" ? [{ priority: "high", status: "resolved",
        created_at: "2026-01-01T00:00:00Z", resolved_at: "2026-01-04T00:00:00Z", actual_cost_cents: 25000 }]
        : [], error: null };
    const query = {
      select: (columns: string) => { mocks.selects.push([table, columns]); return query; },
      in: () => query, gte: () => query, lte: () => query, then: (resolve: (value: typeof result) => unknown) => resolve(result)
    };
    return query;
  }
}) }));

import { getOwnerAnalyticsData } from "@/lib/analytics-loader";

describe("getOwnerAnalyticsData maintenance query", () => {
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
