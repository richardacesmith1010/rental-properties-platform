import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult = { data: Array<Record<string, unknown>> | null; error: { code: string; message: string } | null };
type QueryResolver = (table: string, columns: string, filters: Array<[string, string, unknown]>) => QueryResult;

const dataMocks = vi.hoisted(() => ({
  getAdministeredProperties: vi.fn(),
  getAdministeredPropertyIds: vi.fn(),
  getAdministeredPropertyIdsForAccount: vi.fn(),
  getManagerFeesForProperties: vi.fn(),
  resolve: vi.fn<QueryResolver>()
}));

function createQueryBuilder(table: string, columns: string) {
  const filters: Array<[string, string, unknown]> = [];
  const execute = () => dataMocks.resolve(table, columns, filters);
  const builder = {
    eq(column: string, value: unknown) {
      filters.push(["eq", column, value]);
      return builder;
    },
    gte(column: string, value: unknown) {
      filters.push(["gte", column, value]);
      return builder;
    },
    in(column: string, value: unknown[]) {
      filters.push(["in", column, value]);
      return builder;
    },
    is(column: string, value: unknown) {
      filters.push(["is", column, value]);
      return builder;
    },
    limit() {
      return builder;
    },
    order() {
      return builder;
    },
    async single() {
      const result = execute();
      return { data: result.data?.[0] ?? null, error: result.error };
    },
    then<TResult1 = QueryResult, TResult2 = never>(
      onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) {
      return Promise.resolve(execute()).then(onfulfilled, onrejected);
    }
  };
  return builder;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: (columns: string) => createQueryBuilder(table, columns)
    })
  })
}));
vi.mock("@/lib/property-access", () => ({
  getAdministeredProperties: dataMocks.getAdministeredProperties,
  getAdministeredPropertyIds: dataMocks.getAdministeredPropertyIds,
  getAdministeredPropertyIdsForAccount: dataMocks.getAdministeredPropertyIdsForAccount
}));
vi.mock("@/lib/payment-fees", () => ({
  getManagerFeesForProperties: dataMocks.getManagerFeesForProperties
}));

import { getDashboardData } from "@/lib/dashboard";
import { getPortfolioData } from "@/lib/portfolio";

const ok = (data: Array<Record<string, unknown>> = []): QueryResult => ({ data, error: null });
const missing = (): QueryResult => ({
  data: null,
  error: { code: "42703", message: "column does not exist" }
});

describe("getDashboardData output preservation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dataMocks.getManagerFeesForProperties.mockResolvedValue(new Map());
  });

  it("keeps the tenant short-circuit even when property IDs are supplied", async () => {
    dataMocks.resolve.mockImplementation((table, columns) => {
      if (table === "profiles" && columns === "id, role") {
        return ok([{ id: "tenant-1", role: "tenant" }]);
      }
      return ok();
    });

    const result = await getDashboardData("tenant-1", null, ["property-1"]);

    expect(result.profileRole).toBe("tenant");
    expect(result.charges).toEqual([]);
    expect(result.kpis.totalUnits).toBe(0);
  });

  it("returns the same empty dashboard for zero properties and zero units", async () => {
    dataMocks.resolve.mockImplementation((table, columns) => {
      if (table === "profiles" && columns === "id, role") {
        return ok([{ id: "owner-1", role: "owner" }]);
      }
      if (table === "properties") {
        return ok([{ id: "property-1", name: "Property" }]);
      }
      return ok();
    });

    const noProperties = await getDashboardData("owner-1", null, []);
    const noUnits = await getDashboardData("owner-1", null, ["property-1"]);

    expect(noProperties).toMatchObject({ profileRole: "owner", charges: [], recentPayments: [] });
    expect(noProperties.kpis.totalUnits).toBe(0);
    expect(noUnits).toEqual(noProperties);
  });

  it("preserves populated-unit output with zero leases", async () => {
    dataMocks.resolve.mockImplementation((table, columns) => {
      if (table === "profiles" && columns === "id, role") {
        return ok([{ id: "owner-1", role: "owner" }]);
      }
      if (table === "properties") {
        return ok([{ id: "property-1", name: "Property" }]);
      }
      if (table === "units") {
        return ok([{ id: "unit-1", occupied: false, property_id: "property-1", unit_number: "1" }]);
      }
      return ok();
    });

    const result = await getDashboardData("owner-1", null, ["property-1"]);

    expect(result.kpis).toMatchObject({ totalUnits: 1, occupiedUnits: 0, activeLeaseCount: 0 });
    expect(result.charges).toEqual([]);
  });

  it("keeps charge data when new charge columns are missing", async () => {
    dataMocks.resolve.mockImplementation((table, columns, filters) => {
      if (table === "profiles" && columns === "id, role") return ok([{ id: "owner-1", role: "owner" }]);
      if (table === "profiles") return ok([{ id: "tenant-1", full_name: "Tenant", email: "" }]);
      if (table === "properties") return ok([{ id: "property-1", name: "Property" }]);
      if (table === "units") return ok([{ id: "unit-1", occupied: true, property_id: "property-1", unit_number: "1" }]);
      if (table === "leases") {
        return ok([{ id: "lease-1", monthly_rent_cents: 100000, active: true, unit_id: "unit-1", tenant_profile_id: "tenant-1", collects_outside_domus: false }]);
      }
      if (table === "rent_charges") {
        const usesDeletedAt = filters.some(([operator, column]) => operator === "is" && column === "deleted_at");
        if (columns.includes("notes") || usesDeletedAt) return missing();
        if (columns === "amount_cents, lease_id") return ok();
        if (columns === "id") return ok([{ id: "charge-1" }]);
        return ok([{ id: "charge-1", lease_id: "lease-1", due_date: "2026-10-01", amount_cents: 100000, status: "pending", category: "rent" }]);
      }
      if (table === "charge_edit_history") return missing();
      return ok();
    });

    const result = await getDashboardData("owner-1", null, ["property-1"]);

    expect(result.charges).toHaveLength(1);
    expect(result.charges[0]).toMatchObject({
      id: "charge-1",
      propertyId: "property-1",
      tenantName: "Tenant",
      category: "rent",
      notes: null
    });
  });
});

describe("getPortfolioData output preservation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dataMocks.getManagerFeesForProperties.mockResolvedValue(new Map());
  });

  it("preserves zero-unit and zero-lease portfolio output", async () => {
    dataMocks.resolve.mockImplementation((table, columns) => {
      if (table === "profiles" && columns.includes("phone") && columns.includes("id, email")) {
        return ok([{ id: "owner-1", email: "", full_name: "Owner", phone: null }]);
      }
      if (table === "properties") {
        return ok([{ id: "property-1", name: "Property", address_line1: "", city: "", state: "", postal_code: "", owner_account_id: null, active: true }]);
      }
      return ok();
    });

    const result = await getPortfolioData("owner-1", null, ["property-1"]);

    expect(result.properties).toHaveLength(1);
    expect(result.properties[0].unitCount).toBe(0);
    expect(result.units).toEqual([]);
    expect(result.leases).toEqual([]);
  });

  it("preserves data through profile, property, unit, and lease schema fallbacks", async () => {
    dataMocks.resolve.mockImplementation((table, columns) => {
      if (table === "profiles" && columns === "id, email, full_name, phone") return missing();
      if (table === "profiles" && columns === "id, email, full_name") return ok([{ id: "owner-1", email: "", full_name: "Owner" }]);
      if (table === "profiles") return ok();
      if (table === "properties" && columns.includes("active")) return missing();
      if (table === "properties") {
        return ok([{ id: "property-1", name: "Property", address_line1: "", city: "", state: "", postal_code: "", owner_account_id: null }]);
      }
      if (table === "units" && columns.includes("square_feet")) return missing();
      if (table === "units") {
        return ok([{ id: "unit-1", property_id: "property-1", unit_number: "1", bedrooms: 1, bathrooms: 1, monthly_rent_cents: 100000, occupied: true }]);
      }
      if (table === "leases" && columns.includes("notes")) return missing();
      if (table === "leases") {
        return ok([{ id: "lease-1", unit_id: "unit-1", tenant_profile_id: "tenant-1", monthly_rent_cents: 100000, deposit_cents: 100000, due_day_of_month: 1, start_date: "2026-01-01", end_date: "2026-12-31", lease_status: "active", grace_period_days: 5, late_fee_cents: 5000, collects_outside_domus: false, active: true }]);
      }
      return ok();
    });

    const result = await getPortfolioData("owner-1", null, ["property-1"]);

    expect(result.properties[0]).toMatchObject({ id: "property-1", active: true });
    expect(result.units[0]).toMatchObject({ id: "unit-1", squareFeet: null, active: true });
    expect(result.leases[0]).toMatchObject({ id: "lease-1", notes: null });
    expect(result.tenants).toContainEqual(expect.objectContaining({ id: "owner-1", fullName: "Owner (you)" }));
  });
});
