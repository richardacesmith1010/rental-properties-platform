import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: {} as Record<string, Array<Record<string, unknown>>>,
  rpcError: null as { code: string } | null,
  rpcCalls: [] as string[],
  ownerAccountIds: [] as string[]
}));
function query(table: string) {
  const filters: Array<(row: Record<string, unknown>) => boolean> = [];
  let sort: { column: string; ascending: boolean } | null = null;
  let take = Infinity;
  const result = () => {
    let data = (state.rows[table] ?? []).filter(row => filters.every(filter => filter(row)));
    if (sort) {
      const { column, ascending } = sort;
      data = [...data].sort((a, b) => String(a[column]).localeCompare(String(b[column])) * (ascending ? 1 : -1));
    }
    return { data: data.slice(0, take), error: null };
  };
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => { filters.push(row => row[column] === value); return builder; },
    in: (column: string, values: unknown[]) => { filters.push(row => values.includes(row[column])); return builder; },
    is: (column: string, value: unknown) => { filters.push(row => (row[column] ?? null) === value); return builder; },
    gte: (column: string, value: string) => { filters.push(row => String(row[column]) >= value); return builder; },
    order: (column: string, options: { ascending: boolean }) => {
      sort = { column, ascending: options.ascending }; return builder;
    },
    limit: (count: number) => { take = count; return builder; },
    single: async () => ({ data: result().data[0] ?? null, error: null }),
    then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve)
  };
  return builder;
}
const admin = {
  from: query,
  rpc: async (name: string, args: Record<string, unknown>) => {
    state.rpcCalls.push(name);
    if (state.rpcError) return { data: null, error: state.rpcError };
    if (name === "owner_dashboard_payload") {
      const ids = args.p_property_ids as string[];
      const properties = (state.rows.properties ?? []).filter(row => ids.includes(String(row.id)));
      const units = (state.rows.units ?? []).filter(row => ids.includes(String(row.property_id)));
      const leases = (state.rows.leases ?? []).filter(row => units.some(unit => unit.id === row.unit_id));
      const chargeRows = (state.rows.rent_charges ?? []).filter(row => leases.some(lease => lease.id === row.lease_id));
      const payments = (state.rows.payments ?? []).filter(row => chargeRows.some(charge => charge.id === row.rent_charge_id));
      const pending = chargeRows.filter(row => ["pending", "late", "waived"].includes(String(row.status)))
        .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));
      const paid = chargeRows.filter(row => row.status === "paid" && payments.some(pay => pay.rent_charge_id === row.id));
      return { data: {
        properties, units, leases, maintenance: [],
        aggregates: {
          monthly_gross_rent_cents: leases.filter(row => row.active)
            .reduce((sum, row) => sum + Number(row.monthly_rent_cents), 0),
          active_lease_count: leases.filter(row => row.active).length,
          occupied_units: units.filter(row => row.occupied).length,
          total_units: units.length,
          open_maintenance_count: 0,
          high_priority_maintenance_count: 0,
          late_rent_cents: chargeRows.filter(row => row.status === "late")
            .reduce((sum, row) => sum + Number(row.amount_cents), 0),
          late_account_count: new Set(chargeRows.filter(row => row.status === "late").map(row => row.lease_id)).size
        },
        late_charges: chargeRows.filter(row => row.status === "late"),
        charges: [...pending, ...paid], recent_payments: payments,
        tenant_profiles: (state.rows.profiles ?? []).filter(row => leases.some(lease => lease.tenant_profile_id === row.id)),
        reminders: [], charge_history: [], editor_profiles: []
      }, error: null };
    }
    const accounts = (state.rows.ownership_accounts ?? []).filter(row =>
      state.ownerAccountIds.includes(String(row.id)) || row.created_by_profile_id === args.p_user_id
    );
    return { data: {
      property_account_ids: state.ownerAccountIds,
      member_rows: [], creator_rows: [], accounts,
      member_counts: accounts.map(account => ({
        account_id: account.id,
        member_count: (state.rows.ownership_account_members ?? [])
          .filter(member => member.account_id === account.id && member.active === true).length
      }))
    }, error: null };
  }
};
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin }));
vi.mock("@/lib/property-access", () => ({
  getAdministeredPropertyIds: async () => [],
  getAdministeredPropertyIdsForAccount: async () => [],
  getAdministeredOwnerAccountIds: async () => state.ownerAccountIds
}));
import { getDashboardData, getDashboardDataLegacy } from "@/lib/dashboard";
import { getOwnershipAccountsForUser, getOwnershipAccountsForUserLegacy } from "@/lib/ownership";

const due = new Date().toISOString().slice(0, 10);
function setup(homes: number, llc = false) {
  state.rows = {
    properties: homes ? [{ id: "home-1", name: "A" }, ...(homes > 1 ? [{ id: "home-2", name: "B" }] : [])] : [],
    units: homes ? [{ id: "unit-1", property_id: "home-1", unit_number: "1", occupied: true },
      ...(homes > 1 ? [{ id: "unit-2", property_id: "home-2", unit_number: "2", occupied: true }] : [])] : [],
    leases: homes ? [{ id: "lease-1", unit_id: "unit-1", tenant_profile_id: "tenant-1",
      monthly_rent_cents: 10000, active: true, collects_outside_domus: false },
      ...(homes > 1 ? [{ id: "lease-2", unit_id: "unit-2", tenant_profile_id: "tenant-1",
        monthly_rent_cents: 20000, active: true, collects_outside_domus: false }] : [])] : [],
    rent_charges: homes ? [
      { id: "late", lease_id: "lease-1", due_date: due, amount_cents: 10000, status: "late", category: "rent", notes: null },
      { id: "pending", lease_id: "lease-1", due_date: due, amount_cents: 500, status: "pending", category: "late_fee", notes: null },
      ...(homes > 1 ? [{ id: "paid", lease_id: "lease-2", due_date: due,
        amount_cents: 20000, status: "paid", category: "rent", notes: null }] : [])
    ] : [],
    payments: homes > 1 ? [{ id: "payment", rent_charge_id: "paid", paid_at: new Date().toISOString(),
      amount_cents: 20000, method: "ach" }] : [],
    profiles: [{ id: "tenant-1", full_name: "Tenant", email: "tenant@example.invalid" }],
    ownership_accounts: llc ? [{ id: "account-1", account_type: "llc", display_name: "Forum LLC",
      created_by_profile_id: "owner-1", join_code: null, stripe_account_id: null,
      stripe_onboarding_complete: false, stripe_status: null, distribution_mode: "retain",
      plaid_account_id: null, plaid_bank_name: null, plaid_bank_mask: null,
      plaid_balance_cents: null, plaid_balance_updated_at: null }] : [],
    ownership_account_members: llc ? [{ account_id: "account-1", profile_id: "owner-1", active: true }] : []
  };
  state.ownerAccountIds = llc ? ["account-1"] : [];
}
describe("owner RPC parity", () => {
  beforeEach(() => { state.rpcError = null; state.rpcCalls = []; setup(0); });
  it.each([
    ["no homes", 0, false], ["one home with late and pending", 1, false],
    ["two homes with paid charge", 2, false], ["LLC account", 0, true]
  ])("matches legacy for %s", async (_label, homes, llc) => {
    setup(homes as number, llc as boolean);
    const ids = (state.rows.properties ?? []).map(row => String(row.id));
    expect(await getDashboardData("owner-1", null, ids, "owner"))
      .toEqual(await getDashboardDataLegacy("owner-1", null, ids, "owner"));
    expect(await getOwnershipAccountsForUser("owner-1"))
      .toEqual(await getOwnershipAccountsForUserLegacy("owner-1"));
  });
  it("uses the legacy loaders when RPCs are missing", async () => {
    setup(1, true);
    state.rpcError = { code: "PGRST202" };
    const ids = ["home-1"];
    expect(await getDashboardData("owner-1", null, ids, "owner"))
      .toEqual(await getDashboardDataLegacy("owner-1", null, ids, "owner"));
    expect(await getOwnershipAccountsForUser("owner-1"))
      .toEqual(await getOwnershipAccountsForUserLegacy("owner-1"));
    expect(state.rpcCalls).toEqual(["owner_dashboard_payload", "ownership_accounts_payload"]);
  });
});
