import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ filters: [] as string[] }));
vi.mock("@/lib/auth", () => ({ getCurrentUserRole: async () => "owner" }));
vi.mock("@/lib/property-access", () => ({ getOwnerMemberPropertyIds: async () => ["property-1"] }));
vi.mock("@/lib/reports-rent-roll", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reports-rent-roll")>();
  return { ...actual, getLeasesForScope: async () => ({
    context: { propertyIds: ["property-1"], propertyById: new Map([["property-1", {
      id: "property-1", name: "Forum House", addressLine1: "1 Main St", city: "Denver",
      state: "CO", postalCode: "80000"
    }]]), unitById: new Map([["unit-1", { propertyId: "property-1" }]]) },
    leases: [{ id: "lease-1", unit_id: "unit-1" }]
  }) };
});
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (table: string) => {
  const rows: Record<string, Array<Record<string, unknown>>> = {
    rent_charges: [{ id: "charge-1", lease_id: "lease-1", deleted_at: null }],
    payments: [
      { rent_charge_id: "charge-1", amount_cents: 10000, paid_at: "2026-10-05", reversed_at: "2026-10-06" },
      { rent_charge_id: "charge-1", amount_cents: 20000, paid_at: "2026-10-03", reversed_at: null }
    ], property_expenses: [], property_tax_years: []
  };
  const filters: Array<(row: Record<string, unknown>) => boolean> = [];
  const result = () => ({ data: (rows[table] ?? []).filter((row) => filters.every((filter) => filter(row))), error: null });
  const query = {
    select: () => query,
    in: (key: string, values: unknown[]) => { filters.push((row) => values.includes(row[key])); return query; },
    is: (key: string, value: unknown) => { if (table === "payments") state.filters.push(key);
      filters.push((row) => row[key] === value); return query; },
    eq: () => query, gte: () => query, lte: () => query,
    then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve)
  };
  return query;
} }) }));

import { getTaxSummaryReport } from "@/lib/reports-pnl";

describe("tax summary payment reversals", () => {
  it("counts only active payment income", async () => {
    state.filters = [];
    const result = await getTaxSummaryReport("owner-1", 2026);
    expect(result[0]?.totalRentalIncome).toBe(20000);
    expect(state.filters).toEqual(["reversed_at"]);
  });
});
