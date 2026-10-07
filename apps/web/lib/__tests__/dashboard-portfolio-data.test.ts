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

  it("keeps dashboard output identical when the authenticated owner role is supplied", async () => {
    dataMocks.resolve.mockImplementation((table, columns) => {
      if (table === "profiles" && columns === "id, role") return ok([{ id: "owner-1", role: "owner" }]);
      if (table === "properties") return ok([{ id: "property-1", name: "Forum House" }]);
      if (table === "units") {
        return ok([{ id: "unit-1", occupied: true, property_id: "property-1", unit_number: "2B" }]);
      }
      return ok();
    });

    const baseline = await getDashboardData("owner-1", null, ["property-1"]);
    const suppliedRole = await getDashboardData("owner-1", null, ["property-1"], "owner");

    expect(suppliedRole).toEqual(baseline);
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
        return ok([{
          id: "lease-1", monthly_rent_cents: 100000, active: true, unit_id: "unit-1",
          tenant_profile_id: "tenant-1", collects_outside_domus: false
        }]);
      }
      if (table === "rent_charges") {
        const usesDeletedAt = filters.some(([operator, column]) => operator === "is" && column === "deleted_at");
        if (columns.includes("notes") || usesDeletedAt) return missing();
        if (columns === "amount_cents, lease_id") return ok();
        if (columns === "id") return ok([{ id: "charge-1" }]);
        return ok([{
          id: "charge-1", lease_id: "lease-1", due_date: "2026-10-01", amount_cents: 100000,
          status: "pending", category: "rent"
        }]);
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
        return ok([{
          id: "property-1", name: "Property", address_line1: "", city: "", state: "",
          postal_code: "", owner_account_id: null, active: true
        }]);
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
        return ok([{
          id: "property-1", name: "Property", address_line1: "", city: "", state: "",
          postal_code: "", owner_account_id: null
        }]);
      }
      if (table === "units" && columns.includes("square_feet")) return missing();
      if (table === "units") {
        return ok([{
          id: "unit-1", property_id: "property-1", unit_number: "1", bedrooms: 1, bathrooms: 1,
          monthly_rent_cents: 100000, occupied: true
        }]);
      }
      if (table === "leases" && columns.includes("notes")) return missing();
      if (table === "leases") {
        return ok([{
          id: "lease-1", unit_id: "unit-1", tenant_profile_id: "tenant-1", monthly_rent_cents: 100000,
          deposit_cents: 100000, due_day_of_month: 1, start_date: "2026-01-01", end_date: "2026-12-31",
          lease_status: "active", grace_period_days: 5, late_fee_cents: 5000,
          collects_outside_domus: false, active: true
        }]);
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

type ScopeFixture = {
  properties?: string[];
  leases?: Array<{ id: string; tenantId: string; propertyId: string; active: boolean }>;
  invitations?: Array<{ email: string; propertyId: string }>;
  profiles?: Array<{ id: string; email: string; full_name: string; phone: string | null }>;
  overbroad?: boolean;
  profileError?: string;
  missingPhone?: boolean;
  missingSelf?: boolean;
};

function arrangeScope(fixture: ScopeFixture) {
  const properties = fixture.properties ?? ["property-1"];
  const leases = fixture.leases ?? [];
  const profiles = fixture.profiles ?? [];
  const self = { id: "owner-1", email: "owner@example.test", full_name: "Owner", phone: null };
  const profileQueries: Array<Array<[string, string, unknown]>> = [];
  const error = fixture.profileError;
  dataMocks.resolve.mockImplementation((table, columns, filters) => {
    if (table === "profiles") {
      profileQueries.push([...filters]);
      if (filters.some(([kind, column, value]) => kind === "eq" && column === "id" && value === "owner-1")) {
        return fixture.missingSelf ? ok() : ok([columns.includes("phone") ? self : { ...self, phone: undefined }]);
      }
      const filter = filters.find(([kind, column]) => kind === "in" && (column === "id" || column === "email"));
      if (!filter) return ok([self, ...profiles]);
      if (error) return { data: null, error: { code: error, message: "fixture error" } };
      if (fixture.missingPhone && columns.includes("phone")) return missing();
      const [, column, values] = filter;
      const selected = fixture.overbroad
        ? profiles
        : profiles.filter((profile) => (values as string[]).includes(profile[column as "id" | "email"]));
      return ok(selected.map((profile) => columns.includes("phone") ? profile : {
        id: profile.id, email: profile.email, full_name: profile.full_name
      }));
    }
    if (table === "properties") return ok(properties.map((id) => ({
      id, name: "Property", address_line1: "", city: "", state: "", postal_code: "",
      owner_account_id: null, active: true
    })));
    if (table === "units") return ok(properties.map((id) => ({
      id: `unit-${id}`, property_id: id, unit_number: "1", bedrooms: 1, bathrooms: 1,
      monthly_rent_cents: 100000, square_feet: null, occupied: true, active: true
    })));
    if (table === "invitations") return ok((fixture.invitations ?? []).map((invitation) => ({
      email: invitation.email, property_id: invitation.propertyId, role: "tenant", status: "pending"
    })));
    if (table === "leases") return ok(leases.map((lease) => ({
      id: lease.id, unit_id: `unit-${lease.propertyId}`, tenant_profile_id: lease.tenantId,
      monthly_rent_cents: 100000, deposit_cents: 100000, due_day_of_month: 1,
      start_date: "2026-01-01", end_date: "2026-12-31", lease_status: "active",
      grace_period_days: 5, late_fee_cents: 5000, collects_outside_domus: false,
      notes: null, active: lease.active
    })));
    return ok();
  });
  return profileQueries;
}

const tenant = (id: string, email = `${id}@example.test`) => ({
  id, email, full_name: `Name ${id}`, phone: "555-0100"
});

describe("getPortfolioData tenant scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dataMocks.getManagerFeesForProperties.mockResolvedValue(new Map());
  });

  it("excludes a foreign tenant and never reads tenant profiles without a scoped filter", async () => {
    const queries = arrangeScope({
      leases: [{ id: "lease-1", tenantId: "tenant-1", propertyId: "property-1", active: true }],
      profiles: [tenant("tenant-1"), tenant("foreign-1")]
    });
    const result = await getPortfolioData("owner-1", null, ["property-1"]);
    expect(result.tenants.map((row) => row.id)).toEqual(["tenant-1", "owner-1"]);
    expect(queries).toEqual([[ ["eq", "id", "owner-1"] ], [ ["in", "id", ["tenant-1"]] ]]);
  });

  it("includes an invited tenant by exact lowercased email", async () => {
    arrangeScope({ invitations: [{ email: "INVITED@EXAMPLE.TEST", propertyId: "property-1" }],
      profiles: [tenant("invited", "invited@example.test")] });
    const result = await getPortfolioData("owner-1", null, ["property-1"]);
    expect(result.tenants.find((row) => row.id === "invited")?.propertyIds).toEqual(["property-1"]);
  });

  it("names an active lease tenant beyond the former 100-profile cap", async () => {
    arrangeScope({ leases: [{ id: "lease-1", tenantId: "tenant-1", propertyId: "property-1", active: true }],
      profiles: [...Array.from({ length: 101 }, (_, index) => tenant(`other-${index}`)), tenant("tenant-1")] });
    const result = await getPortfolioData("owner-1", null, ["property-1"]);
    expect(result.tenants.find((row) => row.id === "tenant-1")?.propertyIds).toEqual(["property-1"]);
    expect(result.leases[0]).toMatchObject({ tenantName: "Name tenant-1", tenantEmail: "tenant-1@example.test",
      tenantPhone: "555-0100" });
  });

  it("names an inactive lease tenant without offering that tenant in the picker", async () => {
    arrangeScope({ leases: [{ id: "lease-1", tenantId: "tenant-1", propertyId: "property-1", active: false }],
      profiles: [tenant("tenant-1")] });
    const result = await getPortfolioData("owner-1", null, ["property-1"]);
    expect(result.leases[0].tenantName).toBe("Name tenant-1");
    expect(result.tenants.map((row) => row.id)).toEqual(["owner-1"]);
  });

  it("returns only self with zero properties and skips tenant-profile queries", async () => {
    const queries = arrangeScope({ profiles: [tenant("foreign-1")] });
    const result = await getPortfolioData("owner-1", null, []);
    expect(result.tenants.map((row) => row.id)).toEqual(["owner-1"]);
    expect(queries).toEqual([[ ["eq", "id", "owner-1"] ]]);
  });

  it("deduplicates and labels self when self is also a lease tenant", async () => {
    arrangeScope({ leases: [{ id: "lease-1", tenantId: "owner-1", propertyId: "property-1", active: true }],
      profiles: [{ id: "owner-1", email: "owner@example.test", full_name: "Owner", phone: null }] });
    const result = await getPortfolioData("owner-1", null, ["property-1"]);
    expect(result.tenants).toHaveLength(1);
    expect(result.tenants[0]).toMatchObject({ id: "owner-1", fullName: "Owner (you)", propertyIds: ["property-1"] });
  });

  it("retains tenants with null phone through the missing-column fallback", async () => {
    arrangeScope({ leases: [{ id: "lease-1", tenantId: "tenant-1", propertyId: "property-1", active: true }],
      profiles: [tenant("tenant-1")], missingPhone: true });
    const result = await getPortfolioData("owner-1", null, ["property-1"]);
    expect(result.tenants.find((row) => row.id === "tenant-1")?.phone).toBeNull();
    expect(result.leases[0].tenantPhone).toBeNull();
  });

  it("filters an overbroad profile result before building leases or picker options", async () => {
    arrangeScope({ leases: [{ id: "lease-1", tenantId: "tenant-1", propertyId: "property-1", active: true }],
      profiles: [tenant("tenant-1"), tenant("foreign-1")], overbroad: true });
    const result = await getPortfolioData("owner-1", null, ["property-1"]);
    expect(result.tenants.map((row) => row.id)).toEqual(["tenant-1", "owner-1"]);
    expect(result.leases.map((row) => [row.tenantName, row.tenantEmail, row.tenantPhone]))
      .toEqual([["Name tenant-1", "tenant-1@example.test", "555-0100"]]);
    expect(JSON.stringify(result.leases)).not.toContain("foreign-1");
  });

  it("logs only a code and fails closed on a scoped profile-query error", async () => {
    const queries = arrangeScope({ leases: [{ id: "lease-1", tenantId: "tenant-1", propertyId: "property-1", active: true }],
      profiles: [tenant("tenant-1")], profileError: "PGRST999" });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const result = await getPortfolioData("owner-1", null, ["property-1"]);
      expect(result.tenants.map((row) => row.id)).toEqual(["owner-1"]);
      expect(result.leases[0].tenantName).toBe("Unknown tenant");
      expect(queries).toEqual([[ ["eq", "id", "owner-1"] ], [ ["in", "id", ["tenant-1"]] ]]);
      expect(log.mock.calls).toEqual([["portfolio_tenant_profiles_error", "PGRST999"]]);
    } finally {
      log.mockRestore();
    }
  });

  it("deduplicates a lease on P1 and differently cased invitation on P2", async () => {
    arrangeScope({ properties: ["property-1", "property-2"],
      leases: [{ id: "lease-1", tenantId: "tenant-1", propertyId: "property-1", active: true }],
      invitations: [{ email: "TENANT-1@EXAMPLE.TEST", propertyId: "property-2" }],
      profiles: [tenant("tenant-1")] });
    const result = await getPortfolioData("owner-1", null, ["property-1", "property-2"]);
    const matches = result.tenants.filter((row) => row.id === "tenant-1");
    expect(matches).toHaveLength(1);
    expect(new Set(matches[0].propertyIds)).toEqual(new Set(["property-1", "property-2"]));
  });
});
