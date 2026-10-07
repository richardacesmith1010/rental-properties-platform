import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  resolve: vi.fn<(table: string, columns: string) => Array<Record<string, unknown>>>()
}));

function query(table: string, columns: string) {
  const execute = () => ({ data: state.resolve(table, columns), error: null });
  const builder = {
    eq: () => builder,
    in: () => builder,
    is: () => builder,
    gte: () => builder,
    order: () => builder,
    limit: () => builder,
    single: async () => ({ data: execute().data[0] ?? null, error: null }),
    then: (resolve: (value: ReturnType<typeof execute>) => unknown) => Promise.resolve(execute()).then(resolve)
  };
  return builder;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (table: string) => ({ select: (columns: string) => query(table, columns) }) })
}));
vi.mock("@/lib/property-access", () => ({
  getAdministeredPropertyIds: async () => ["property-1"],
  getAdministeredPropertyIdsForAccount: async () => ["property-1"]
}));

import { assembleOwnerDashboardPayload, type OwnerDashboardPayload } from "@/lib/dashboard-rpc";
import { getDashboardDataLegacy } from "@/lib/dashboard-legacy";

const property = { id: "property-1", name: "Forum House" };
const unit = { id: "unit-1", occupied: true, property_id: property.id, unit_number: "1A" };
const lease = {
  id: "lease-1", monthly_rent_cents: 100000, active: true, unit_id: unit.id,
  tenant_profile_id: "tenant-1", collects_outside_domus: false
};
const baseCharge = {
  id: "charge-1", lease_id: lease.id, due_date: "2026-10-01", amount_cents: 100000,
  status: "late" as const, category: "rent" as const, notes: null
};

describe("tenant report dashboard mapping", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["timestamp", "2026-10-07T17:04:35Z"],
    ["SQL null", null],
    ["missing property", undefined]
  ])("maps %s in both dashboard paths", async (_case, timestamp) => {
    const charge = timestamp === undefined ? baseCharge : { ...baseCharge, tenant_reported_paid_at: timestamp };
    const payload = {
      aggregates: {
        monthly_gross_rent_cents: 100000, active_lease_count: 1, occupied_units: 1, total_units: 1,
        open_maintenance_count: 0, high_priority_maintenance_count: 0,
        late_rent_cents: 100000, late_account_count: 1
      },
      properties: [property], units: [unit], leases: [lease], maintenance: [], late_charges: [],
      charges: [charge], recent_payments: [], tenant_profiles: [], reminders: [],
      charge_history: [], editor_profiles: []
    } as OwnerDashboardPayload;
    const rpc = assembleOwnerDashboardPayload(payload, "owner", new Date("2026-10-07T00:00:00Z"));
    expect(rpc.charges[0].tenantReportedPaidAt).toBe(timestamp ?? null);

    state.resolve.mockImplementation((table, columns) => {
      if (table === "profiles" && columns === "id, role") return [{ id: "owner-1", role: "owner" }];
      if (table === "profiles") return [{ id: "tenant-1", full_name: "Tenant", email: "tenant@example.com" }];
      if (table === "properties") return [property];
      if (table === "units") return [unit];
      if (table === "leases") return [lease];
      if (table === "rent_charges") {
        if (columns === "amount_cents, lease_id") return [{ amount_cents: 100000, lease_id: lease.id }];
        if (columns === "id") return [{ id: charge.id }];
        return [charge];
      }
      return [];
    });
    const legacy = await getDashboardDataLegacy("owner-1", null, [property.id]);
    expect(legacy.charges[0].tenantReportedPaidAt).toBe(timestamp ?? null);
    const displaySelects = state.resolve.mock.calls
      .filter(([table, columns]) => table === "rent_charges" && columns.includes("notes"));
    expect(displaySelects.length).toBeGreaterThan(0);
    expect(displaySelects.every(([, columns]) => columns.includes("tenant_reported_paid_at"))).toBe(true);
  });
});
