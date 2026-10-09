import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
type Fixture = {
  properties: Row[]; units: Row[]; leases: Row[]; invitations: Row[];
  profiles: Row[]; accounts: Row[];
};
const mocks = vi.hoisted(() => ({
  fixture: null as Fixture | null,
  rpc: vi.fn(),
  fees: vi.fn(),
  administered: vi.fn(),
  scoped: vi.fn(),
  failAccounts: false
}));
function query(table: string) {
  const filters: Array<[string, string, unknown]> = [];
  let columns = "";
  const result = () => {
    const fixture = mocks.fixture!;
    const rows = ({
      properties: fixture.properties, units: fixture.units, leases: fixture.leases,
      invitations: fixture.invitations, profiles: fixture.profiles,
      ownership_accounts: fixture.accounts
    } as Record<string, Row[]>)[table] ?? [];
    const selected = rows.filter((row) => filters.every(([kind, key, value]) =>
      kind === "eq" ? row[key] === value : (value as unknown[]).includes(row[key])));
    if (table === "leases" && columns.includes("notes")) {
      return { data: null, error: { code: "42703", message: "column does not exist" } };
    }
    if (table === "ownership_accounts" && mocks.failAccounts) {
      return { data: null, error: { code: "42501", message: "permission denied" } };
    }
    return { data: selected, error: null };
  };
  const builder = {
    select(value: string) { columns = value; return builder; },
    eq(key: string, value: unknown) { filters.push(["eq", key, value]); return builder; },
    in(key: string, value: unknown[]) { filters.push(["in", key, value]); return builder; },
    order() { return builder; },
    async single() { const value = result(); return { data: value.data?.[0] ?? null, error: value.error }; },
    then(resolve: (value: ReturnType<typeof result>) => unknown) { return Promise.resolve(result()).then(resolve); }
  };
  return builder;
}
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: query, rpc: mocks.rpc })
}));
vi.mock("@/lib/payment-fees", () => ({ getManagerFeesForProperties: mocks.fees }));
vi.mock("@/lib/property-access", () => ({
  getAdministeredProperties: mocks.administered,
  getAdministeredPropertyIdsForAccount: mocks.scoped
}));
import { getPortfolioData, getPortfolioDataLegacy } from "@/lib/portfolio";

function arrange(homes: number, inactiveLease = false, inactiveUnit = false, userId = "owner-1") {
  const properties = Array.from({ length: homes }, (_, index) => ({
    id: `home-${index}`, name: `Home ${index}`, address_line1: "", city: "", state: "",
    postal_code: "", owner_account_id: "account-1", active: true
  }));
  const units = properties.map((property, index) => ({
    id: `unit-${index}`, property_id: property.id, unit_number: String(index),
    bedrooms: 1, bathrooms: 1, monthly_rent_cents: 100000, square_feet: null,
    occupied: true, active: !(inactiveUnit && index === 1)
  }));
  const leases = units.map((unit, index) => ({
    id: `lease-${index}`, unit_id: unit.id, tenant_profile_id: "tenant-1",
    monthly_rent_cents: 100000, deposit_cents: 100000, due_day_of_month: 1,
    start_date: "2026-01-01", end_date: "2027-01-01", lease_status: inactiveLease ? "expired" : "active",
    grace_period_days: null, late_fee_cents: null, collects_outside_domus: false,
    active: !inactiveLease
  }));
  mocks.fixture = {
    properties, units, leases,
    invitations: homes ? [{ email: "TENANT-1@example.test", property_id: "home-0",
      role: "tenant", status: "pending" }] : [],
    profiles: [
      { id: userId, email: "owner@example.test", full_name: "Owner", phone: null },
      { id: "tenant-1", email: "tenant-1@example.test", full_name: "Tenant", phone: null }
    ],
    accounts: [{ id: "account-1", display_name: "Account", managed_client: true }]
  };
  const payload = {
    properties, units: units.filter((row) => row.active),
    leases: leases.filter((row) => units.find((unit) => unit.id === row.unit_id)?.active),
    invitations: mocks.fixture.invitations.map((row) => ({
      email: String(row.email).toLowerCase(), property_id: row.property_id
    })),
    ownership_accounts: homes ? mocks.fixture.accounts : [],
    tenant_profiles: homes ? [mocks.fixture.profiles[1]] : [],
    self_profile: mocks.fixture.profiles[0]
  };
  mocks.rpc.mockResolvedValue({ data: payload, error: null });
  mocks.failAccounts = false;
  mocks.administered.mockResolvedValue(properties.map((property) => ({
    id: property.id, ownerAccountId: "account-1"
  })));
  mocks.scoped.mockResolvedValue(properties.map((property) => property.id));
  return properties.map((property) => property.id);
}

describe("owner portfolio RPC parity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fees.mockResolvedValue(new Map());
  });
  it("matches legacy with no homes", async () => {
    const ids = arrange(0);
    expect(await getPortfolioData("owner-1", null, ids))
      .toEqual(await getPortfolioDataLegacy("owner-1", null, ids));
  });
  it("matches legacy with an active lease and invitation", async () => {
    const ids = arrange(1);
    expect(await getPortfolioData("owner-1", null, ids))
      .toEqual(await getPortfolioDataLegacy("owner-1", null, ids));
  });
  it("matches legacy with two homes, an inactive lease, and an inactive unit", async () => {
    const ids = arrange(2, true, true);
    expect(await getPortfolioData("owner-1", null, ids))
      .toEqual(await getPortfolioDataLegacy("owner-1", null, ids));
  });
  it("matches legacy for manager-only property IDs", async () => {
    const ids = arrange(1, false, false, "manager-1");
    expect(await getPortfolioData("manager-1", "account-1", ids))
      .toEqual(await getPortfolioDataLegacy("manager-1", "account-1", ids));
  });
  it("uses legacy on a missing RPC and logs its fixed name and code", async () => {
    const ids = arrange(1);
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(await getPortfolioData("owner-1", null, ids))
        .toEqual(await getPortfolioDataLegacy("owner-1", null, ids));
      expect(log).toHaveBeenCalledWith("owner_rpc_fallback_missing", "owner_portfolio_payload", "PGRST202");
    } finally { log.mockRestore(); }
  });
  it("uses legacy on a failed RPC and logs its fixed name and code", async () => {
    const ids = arrange(1);
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST999" } });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(await getPortfolioData("owner-1", null, ids))
        .toEqual(await getPortfolioDataLegacy("owner-1", null, ids));
      expect(log).toHaveBeenCalledWith("owner_rpc_fallback_error", "owner_portfolio_payload", "PGRST999");
    } finally { log.mockRestore(); }
  });
  it("filters a foreign RPC profile before tenant options and lease names", async () => {
    const ids = arrange(1);
    const payload = (await mocks.rpc("owner_portfolio_payload", {})).data;
    payload.tenant_profiles = [
      { id: "foreign", email: "foreign@example.test", full_name: "Foreign", phone: null },
      ...payload.tenant_profiles
    ];
    mocks.rpc.mockResolvedValue({ data: payload, error: null });
    const result = await getPortfolioData("owner-1", null, ids);
    expect(result.tenants.map((tenant) => tenant.id)).toEqual(["tenant-1", "owner-1"]);
    expect(result.leases[0].tenantName).toBe("Tenant");
    expect(JSON.stringify(result)).not.toContain("foreign@example.test");
  });
  it("sets the client flag from the checked account query on RPC and legacy paths", async () => {
    const ids = arrange(1);
    expect((await getPortfolioData("owner-1", null, ids)).properties[0].ownerAccountIsClient).toBe(true);
    expect((await getPortfolioDataLegacy("owner-1", null, ids)).properties[0].ownerAccountIsClient).toBe(true);
  });
  it("throws when the account query fails", async () => {
    const ids = arrange(1);
    mocks.failAccounts = true;
    await expect(getPortfolioData("owner-1", null, ids)).rejects.toThrow("Unable to load owner accounts.");
    await expect(getPortfolioDataLegacy("owner-1", null, ids)).rejects.toThrow("Unable to load owner accounts.");
    mocks.failAccounts = false;
  });
});
