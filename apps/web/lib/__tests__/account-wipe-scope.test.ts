import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; columns: string; filters: Array<[string, string, unknown]> }>,
  fail: "",
  duplicate: false,
  empty: false
}));
vi.mock("server-only", () => ({}));

const fixtures: Record<string, Array<Record<string, unknown>>> = {
  ownership_account_members: [
    { account_id: "acct-solo", profile_id: "user-1", member_role: "owner", active: true },
    { account_id: "acct-shared", profile_id: "user-1", member_role: "owner", active: true },
    { account_id: "acct-shared", profile_id: "other-owner", member_role: "owner", active: true },
    { account_id: "acct-old", profile_id: "user-1", member_role: "owner", active: false },
    { account_id: "acct-other", profile_id: "user-1", member_role: "manager", active: true }
  ],
  properties: [
    { id: "property-solo", owner_account_id: "acct-solo" },
    { id: "property-shared", owner_account_id: "acct-shared" },
    { id: "property-old", owner_account_id: "acct-old" },
    { id: "property-other", owner_account_id: "acct-other" }
  ],
  property_managers: [{ property_id: "property-other", manager_profile_id: "user-1" }],
  vendors: [
    { id: "vendor-account", owner_account_id: "acct-solo", owner_profile_id: "other-owner" },
    { id: "vendor-personal", owner_account_id: null, owner_profile_id: "user-1" },
    { id: "vendor-shared", owner_account_id: "acct-shared", owner_profile_id: "user-1" },
    { id: "vendor-other", owner_account_id: null, owner_profile_id: "other-owner" }
  ],
  units: [
    { id: "unit-solo", property_id: "property-solo" },
    { id: "unit-shared", property_id: "property-shared" },
    { id: "unit-other", property_id: "property-other" }
  ],
  leases: [
    { id: "lease-solo", unit_id: "unit-solo" },
    { id: "lease-shared", unit_id: "unit-shared" },
    { id: "lease-other", unit_id: "unit-other" }
  ],
  rent_charges: [
    { id: "charge-solo", lease_id: "lease-solo" },
    { id: "charge-shared", lease_id: "lease-shared" },
    { id: "charge-other", lease_id: "lease-other" }
  ],
  payments: [
    { id: "payment-solo", rent_charge_id: "charge-solo" },
    { id: "payment-shared", rent_charge_id: "charge-shared" }
  ],
  maintenance_tickets: [
    { id: "ticket-solo", property_id: "property-solo" },
    { id: "ticket-shared", property_id: "property-shared" }
  ],
  invitations: [
    { id: "invite-solo", property_id: "property-solo" },
    { id: "invite-shared", property_id: "property-shared" }
  ]
};

function query(table: string) {
  let columns = "";
  const filters: Array<[string, string, unknown]> = [];
  const chain = {
    select(value: string) { columns = value; return chain; },
    eq(column: string, value: unknown) { filters.push(["eq", column, value]); return chain; },
    in(column: string, value: unknown) { filters.push(["in", column, value]); return chain; },
    is(column: string, value: unknown) { filters.push(["is", column, value]); return chain; },
    then(resolve: (result: unknown) => void, reject?: (reason: unknown) => void) {
      fake.calls.push({ table, columns, filters });
      let source = fake.empty && table !== "ownership_account_members" ? [] : fixtures[table] ?? [];
      if (fake.empty && table === "ownership_account_members") source = [];
      if (fake.duplicate && table === "vendors" && source.length) source = [...source, source[0], source[1]];
      const data = source.filter((row) => filters.every(([op, column, value]) => {
        if (op === "eq") return row[column] === value;
        if (op === "in") return (value as unknown[]).includes(row[column]);
        return (row[column] ?? null) === value;
      }));
      const error = fake.fail === `${table}:${fake.calls.filter((call) => call.table === table).length}`
        ? { message: "read failed" } : null;
      return Promise.resolve({ data, error }).then(resolve, reject);
    }
  };
  return chain;
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: query }) }));

import { loadDeletionScope } from "../account-wipe/scope";

beforeEach(() => {
  fake.calls.length = 0;
  fake.fail = "";
  fake.duplicate = false;
  fake.empty = false;
});

describe("account wipe sole-owner scope", () => {
  it("S1 excludes shared, inactive and manager-only accounts from every derived id list", async () => {
    const scope = await loadDeletionScope("user-1");
    expect({ accountIds: scope.accountIds, sharedAccountIds: scope.sharedAccountIds,
      propertyIds: scope.propertyIds, unitIds: scope.unitIds, leaseIds: scope.leaseIds,
      chargeIds: scope.chargeIds, paymentIds: scope.paymentIds, ticketIds: scope.ticketIds,
      invitationIds: scope.invitationIds }).toEqual({
      accountIds: ["acct-solo"], sharedAccountIds: ["acct-shared"],
      propertyIds: ["property-solo"], unitIds: ["unit-solo"], leaseIds: ["lease-solo"],
      chargeIds: ["charge-solo"], paymentIds: ["payment-solo"], ticketIds: ["ticket-solo"],
      invitationIds: ["invite-solo"]
    });
    expect(fake.calls.slice(0, 5)).toEqual([
      { table: "ownership_account_members", columns: "account_id", filters: [
        ["eq", "profile_id", "user-1"], ["eq", "member_role", "owner"], ["eq", "active", true]
      ] },
      { table: "ownership_account_members", columns: "account_id, profile_id", filters: [
        ["in", "account_id", ["acct-solo", "acct-shared"]],
        ["eq", "member_role", "owner"], ["eq", "active", true]
      ] },
      { table: "properties", columns: "id", filters: [["in", "owner_account_id", ["acct-solo"]]] },
      { table: "vendors", columns: "id", filters: [["in", "owner_account_id", ["acct-solo"]]] },
      { table: "vendors", columns: "id", filters: [
        ["eq", "owner_profile_id", "user-1"], ["is", "owner_account_id", null]
      ] }
    ]);
    expect(fake.calls.some((call) => call.table === "property_managers")).toBe(false);
  });
  it("S3 combines account and legacy personal vendors once", async () => {
    fake.duplicate = true;
    expect((await loadDeletionScope("user-1")).vendorIds).toEqual(["vendor-account", "vendor-personal"]);
    fake.empty = true;
    expect((await loadDeletionScope("user-1")).vendorIds).toEqual([]);
  });
  it.each(["ownership_account_members:1", "ownership_account_members:2", "properties:1", "vendors:1", "vendors:2"])(
    "S1 checks critical read error %s", async (failure) => {
      fake.fail = failure;
      await expect(loadDeletionScope("user-1")).rejects.toThrow("read failed");
    }
  );
});
