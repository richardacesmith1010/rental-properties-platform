import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), rate: vi.fn(),
  revalidate: vi.fn(), sideEffectError: vi.fn(), sideEffectHandler: vi.fn(),
  log: [] as Array<Record<string, unknown>>,
  directWrites: [] as Array<{ table: string; op: string }>,
  failures: [] as Array<{ table: string; op: string; code?: string; at?: number }>,
  storageError: false,
  rpcReply: null as null | ((ops: Array<{ label: string }>) => unknown),
  rpcReject: false,
  dbState: ["original"] as string[],
  negativeFixtures: false
}));

vi.mock("server-only", () => ({}));
vi.mock("../auth-helpers", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.rate }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/logger", () => ({ sideEffectError: mocks.sideEffectError }));

const negativeRows: Record<string, Record<string, unknown>[]> = {
  ownership_account_members: [
    { account_id: "acct-shared", profile_id: "owner-1", member_role: "owner", active: true },
    { account_id: "acct-shared", profile_id: "co-owner", member_role: "owner", active: true },
    { account_id: "acct-old", profile_id: "owner-1", member_role: "owner", active: false },
    { account_id: "acct-other", profile_id: "owner-1", member_role: "manager", active: true }
  ],
  properties: ["shared", "old", "other"].map((kind) => ({
    id: `property-${kind}`, owner_account_id: `acct-${kind}`
  })),
  vendors: [{ id: "vendor-shared", owner_account_id: "acct-shared", owner_profile_id: "owner-1" }],
  units: [{ id: "unit-shared", property_id: "property-shared" }],
  leases: [{ id: "lease-shared", unit_id: "unit-shared" }],
  rent_charges: [{ id: "charge-shared", lease_id: "lease-shared" }],
  payments: [{ id: "payment-shared", rent_charge_id: "charge-shared" }],
  maintenance_tickets: [{ id: "ticket-shared", property_id: "property-shared" }],
  invitations: [{ id: "invitation-shared", property_id: "property-shared" }]
};
const rows: Record<string, Record<string, unknown>[]> = {
  ownership_account_members: [{ account_id: "account-1", profile_id: "owner-1", member_role: "owner", active: true }],
  properties: [{ id: "property-1", owner_account_id: "account-1" }],
  vendors: [{ id: "vendor-1", owner_account_id: "account-1" }],
  units: [{ id: "unit-1" }], leases: [{ id: "lease-1", unit_id: "unit-1", tenant_profile_id: "tenant-1" }],
  rent_charges: [{ id: "charge-1" }], payments: [{ id: "payment-1" }],
  maintenance_tickets: [{ id: "ticket-1" }], property_expenses: [{ id: "expense-1" }],
  invitations: [{ id: "invitation-1" }], manager_payments: [{ id: "manager-payment-1" }],
  rental_listings: [{ id: "listing-1" }], rental_applications: [{ id: "application-1" }],
  automation_rules: [{ id: "rule-1" }], document_templates: [{ id: "template-1" }],
  document_packets: [{ id: "packet-1" }],
  inbox_threads: [{ id: "thread-1" }], inbox_messages: [{ id: "message-1" }],
  property_files: [{ id: "file-1", storage_path: "property/path-1" }],
  maintenance_photos: [{ id: "photo-1", storage_path: "ticket/path-1" }],
  withdrawal_requests: [{ id: "withdrawal-1" }],
  distribution_change_requests: [{ id: "distribution-change-1" }],
  account_rename_requests: [{ id: "rename-1" }], account_delete_requests: [{ id: "delete-request-1" }]
};

type Filter = [string, string, unknown];
function query(table: string) {
  let op = "select";
  let values: unknown;
  const filters: Filter[] = [];
  const chain = {
    select(_columns: string) { op = "select"; return chain; },
    delete() { op = "delete"; mocks.directWrites.push({ table, op }); return chain; },
    update(next: unknown) { op = "update"; values = next; mocks.directWrites.push({ table, op }); return chain; },
    in(column: string, value: unknown) { filters.push(["in", column, value]); return chain; },
    eq(column: string, value: unknown) { filters.push(["eq", column, value]); return chain; },
    is(column: string, value: unknown) { filters.push(["is", column, value]); return chain; },
    not(column: string, value: string, modifier: unknown) {
      filters.push(["not", column, [value, modifier]]); return chain;
    },
    then(resolve: (result: unknown) => void, reject?: (reason: unknown) => void) {
      const entry = { table, op, filters, ...(op === "update" ? { values } : {}) };
      mocks.log.push(entry);
      const count = mocks.log.filter((item) => item.table === table && item.op === op).length;
      const failure = mocks.failures.find((item) => item.table === table && item.op === op && (item.at ?? 1) === count);
      const error = failure ? { code: failure.code ?? "P0001", message: "simulated failure" } : null;
      const source = [...(rows[table] ?? []), ...(mocks.negativeFixtures ? negativeRows[table] ?? [] : [])];
      const selected = source.filter((row) => filters.every(([kind, column, value]) => {
        if (row[column] === undefined && table !== "ownership_account_members" &&
          table !== "properties" && table !== "vendors") return true;
        if (kind === "eq") return row[column] === value;
        if (kind === "in") return (value as unknown[]).includes(row[column]);
        if (kind === "is") return (row[column] ?? null) === value;
        return true;
      }));
      const data = table === "notifications"
        ? [{ id: filters.some((filter) => filter[1] === "recipient_profile_id")
          ? "notification-owner-1" : `notification-${filters.find((filter) => filter[1] === "entity_type")?.[2]}` }]
        : selected;
      return Promise.resolve({ data, error }).then(resolve, reject);
    }
  };
  return chain;
}
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: query,
    rpc: async (name: string, args: { p_ops: Array<{ label: string }>; p_guard: unknown }) => {
      mocks.log.push({ op: "rpc", name, args });
      if (mocks.rpcReject) throw new Error("network error");
      const response = mocks.rpcReply?.(args.p_ops) ?? {
        data: {
          operations: args.p_ops.length,
          results: args.p_ops.map((op) => ({ label: op.label, rows: 1 }))
        },
        error: null
      };
      if ((response as { error?: unknown }).error === null &&
        (response as { data?: unknown }).data !== null) mocks.dbState = [];
      return response;
    },
    storage: { from: (bucket: string) => ({ remove: async (paths: string[]) => {
      mocks.log.push({ bucket, remove: paths });
      return { error: mocks.storageError ? { message: "storage failure" } : null };
    } }) }
  })
}));

import {
  deleteAllProperties, deleteAllTenants, deleteAllManagers, deleteAllLeases,
  deleteAllFinancialData, fullAccountWipe
} from "../account-wipe";

const actions = {
  deleteAllProperties, deleteAllTenants, deleteAllManagers,
  deleteAllLeases, deleteAllFinancialData, fullAccountWipe
};
type Action = (typeof actions)[keyof typeof actions];
function form(confirmation?: string) {
  const data = new FormData();
  if (confirmation !== undefined) data.set("confirmation", confirmation);
  return data;
}
function run(action: Action, confirmation = "DELETE") { return action({ success: false, error: "previous" }, form(confirmation)); }
function opsToLog(ops: Array<Record<string, unknown>>) {
  return ops.map((op) => [
    op.table, op.kind,
    (op.filters as Array<Record<string, unknown>>).map((filter) => filter.op === "not_null"
      ? ["not", filter.column, ["is", null]]
      : [filter.op, filter.column, filter.op === "in" ? filter.values : filter.value]),
    ...(op.kind === "update" ? [op.set] : [])
  ]);
}
function rpcCalls() { return mocks.log.filter((entry) => entry.op === "rpc"); }
function rpcPayload() {
  return (rpcCalls()[0].args as { p_ops: Array<Record<string, unknown>> }).p_ops;
}
function assertTrace(expected: unknown[][]) {
  const database = expected.filter((entry) => entry[1] !== "remove");
  const storage = expected.filter((entry) => entry[1] === "remove");
  expect(rpcCalls()).toHaveLength(1);
  expect(rpcCalls()[0].name).toBe("account_wipe_apply");
  expect(mocks.directWrites).toEqual([]);
  expect(mocks.log.filter((entry) => entry.op === "delete" || entry.op === "update")).toEqual([]);
  expect((rpcCalls()[0].args as { p_guard: unknown }).p_guard).toEqual({
    user_id: "owner-1", account_ids: ["account-1"], property_ids: ["property-1"]
  });
  expect(opsToLog(rpcPayload())).toEqual(database);
  expect(mocks.log.filter((entry) => entry.remove).map((entry) => [entry.bucket, "remove", entry.remove]))
    .toEqual(storage);
  const rpcIndex = mocks.log.findIndex((entry) => entry.op === "rpc");
  expect(mocks.log.slice(0, rpcIndex).some((entry) => entry.remove)).toBe(false);
  expect(mocks.revalidate.mock.calls).toEqual([["/settings"], ["/owner"], ["/manager"], ["/tenant"]]);
}
function expectNoWrites() {
  expect(mocks.directWrites).toEqual([]);
  expect(mocks.log.filter((entry) => entry.op === "delete" || entry.op === "update" || entry.remove)).toEqual([]);
  expect(mocks.log.some((entry) => entry.op === "rpc")).toBe(false);
  expect(mocks.revalidate).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.log.length = 0;
  mocks.directWrites.length = 0;
  mocks.failures.length = 0;
  mocks.storageError = false;
  mocks.rpcReply = null;
  mocks.rpcReject = false;
  mocks.dbState = ["original"];
  mocks.negativeFixtures = false;
  mocks.auth.mockResolvedValue({ user: { id: "owner-1", email: "OWNER@EXAMPLE.COM" }, role: "owner" });
  mocks.rate.mockReturnValue({ allowed: true });
  mocks.sideEffectError.mockReturnValue(mocks.sideEffectHandler);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const leaseFinancials = [
  ["payment_distributions", "delete", [["in", "payment_id", ["payment-1"]]]],
  ["payment_distributions", "delete", [["in", "account_id", ["account-1"]]]],
  ["payments", "delete", [["in", "id", ["payment-1"]]]],
  ["rent_charges", "delete", [["in", "id", ["charge-1"]]]],
  ["autopay_enrollments", "delete", [["in", "lease_id", ["lease-1"]]]]
];
const maintenance = [
  ["maintenance_assignments", "delete", [["in", "ticket_id", ["ticket-1"]]]],
  ["maintenance-photos", "remove", ["ticket/path-1"]],
  ["maintenance_photos", "delete", [["in", "id", ["photo-1"]]]],
  ["maintenance_tickets", "delete", [["in", "id", ["ticket-1"]]]]
];
const documents = [
  ["document_signers", "delete", [["in", "packet_id", ["packet-1"]]]],
  ["document_packets", "delete", [["in", "id", ["packet-1"]]]],
  ["property-files", "remove", ["property/path-1"]],
  ["property_files", "delete", [["in", "id", ["file-1"]]]]
];
const pipeline = [
  ["screening_reports", "delete", [["in", "application_id", ["application-1"]]]],
  ["application_events", "delete", [["in", "application_id", ["application-1"]]]],
  ["rental_applications", "delete", [["in", "id", ["application-1"]]]],
  ["rental_listings", "delete", [["in", "id", ["listing-1"]]]]
];
const automation = [
  ["automation_runs", "delete", [["in", "rule_id", ["rule-1"]]]],
  ["automation_rules", "delete", [["in", "id", ["rule-1"]]]]
];
const propertiesLog = [
  ...leaseFinancials, ...maintenance, ...documents, ...pipeline, ...automation,
  ["manager_payments", "delete", [["in", "property_id", ["property-1"]]]],
  ["manager_payment_configs", "delete", [["in", "property_id", ["property-1"]]]],
  ["property_expenses", "delete", [["in", "id", ["expense-1"]]]],
  ["preventive_maintenance_schedules", "delete", [["in", "property_id", ["property-1"]]]],
  ["vendors", "delete", [["in", "id", ["vendor-1"]]]],
  ["notification_deliveries", "delete", [["in", "notification_id", [
    "notification-property", "notification-unit", "notification-lease", "notification-rent_charge",
    "notification-charge", "notification-maintenance_ticket", "notification-ticket", "notification-expense",
    "notification-invitation", "notification-manager_payment"
  ]]]],
  ["notifications", "delete", [["in", "id", [
    "notification-property", "notification-unit", "notification-lease", "notification-rent_charge",
    "notification-charge", "notification-maintenance_ticket", "notification-ticket", "notification-expense",
    "notification-invitation", "notification-manager_payment"
  ]]]],
  ["message_deliveries", "delete", [["in", "message_id", ["message-1"]]]],
  ["inbox_messages", "delete", [["in", "id", ["message-1"]]]],
  ["inbox_threads", "delete", [["in", "id", ["thread-1"]]]],
  ["property_managers", "delete", [["in", "property_id", ["property-1"]]]],
  ["invitations", "delete", [["in", "id", ["invitation-1"]]]],
  ["inspections", "delete", [["in", "lease_id", ["lease-1"]]]],
  ["documents", "delete", [["in", "lease_id", ["lease-1"]]]],
  ["leases", "delete", [["in", "id", ["lease-1"]]]],
  ["documents", "delete", [["in", "unit_id", ["unit-1"]]]],
  ["communication_logs", "delete", [["in", "unit_id", ["unit-1"]]]],
  ["units", "delete", [["in", "id", ["unit-1"]]]],
  ["documents", "delete", [["in", "property_id", ["property-1"]]]],
  ["communication_logs", "delete", [["in", "property_id", ["property-1"]]]],
  ["properties", "delete", [["in", "id", ["property-1"]]]]
];
const fullLog = [
  ...leaseFinancials, ...maintenance,
  ["property_expenses", "delete", [["in", "property_id", ["property-1"]]]],
  ...documents,
  ["document_templates", "delete", [["in", "id", ["template-1"]]]],
  ...pipeline, ...automation,
  ["preventive_maintenance_schedules", "delete", [["in", "property_id", ["property-1"]]]],
  ["vendors", "delete", [["in", "id", ["vendor-1"]]]],
  ["invitations", "delete", [["in", "property_id", ["property-1"]]]],
  ["invitations", "delete", [["in", "ownership_account_id", ["account-1"]]]],
  ["invitations", "delete", [["eq", "email", "owner@example.com"]]],
  ["invitations", "delete", [["eq", "invited_by", "owner-1"]]],
  ["invitations", "delete", [["eq", "invited_profile_id", "owner-1"]]],
  ["inspections", "delete", [["in", "lease_id", ["lease-1"]]]],
  ["documents", "delete", [["in", "lease_id", ["lease-1"]]]],
  ["leases", "delete", [["in", "id", ["lease-1"]]]],
  ["documents", "delete", [["in", "unit_id", ["unit-1"]]]],
  ["communication_logs", "delete", [["in", "unit_id", ["unit-1"]]]],
  ["units", "delete", [["in", "id", ["unit-1"]]]],
  ["property_managers", "delete", [["in", "property_id", ["property-1"]]]],
  ["documents", "delete", [["in", "property_id", ["property-1"]]]],
  ["communication_logs", "delete", [["in", "property_id", ["property-1"]]]],
  ["properties", "delete", [["in", "id", ["property-1"]]]],
  ["withdrawal_votes", "delete", [["in", "request_id", ["withdrawal-1"]]]],
  ["withdrawal_requests", "delete", [["in", "ownership_account_id", ["account-1"]]]],
  ["distribution_change_votes", "delete", [["in", "request_id", ["distribution-change-1"]]]],
  ["distribution_change_requests", "delete", [["in", "ownership_account_id", ["account-1"]]]],
  ["account_rename_votes", "delete", [["in", "request_id", ["rename-1"]]]],
  ["account_rename_requests", "delete", [["in", "ownership_account_id", ["account-1"]]]],
  ["account_delete_votes", "delete", [["in", "request_id", ["delete-request-1"]]]],
  ["account_delete_requests", "delete", [["in", "ownership_account_id", ["account-1"]]]],
  ["ownership_account_members", "delete", [["in", "account_id", ["account-1"]]]],
  ["ownership_account_members", "delete", [["eq", "profile_id", "owner-1"]]],
  ["ownership_accounts", "delete", [["in", "id", ["account-1"]]]],
  ["notification_deliveries", "delete", [["in", "notification_id", [
    "notification-owner-1", "notification-property", "notification-unit", "notification-lease",
    "notification-rent_charge", "notification-charge", "notification-maintenance_ticket",
    "notification-ticket", "notification-expense", "notification-invitation", "notification-manager_payment"
  ]]]],
  ["notifications", "delete", [["in", "id", [
    "notification-owner-1", "notification-property", "notification-unit", "notification-lease",
    "notification-rent_charge", "notification-charge", "notification-maintenance_ticket",
    "notification-ticket", "notification-expense", "notification-invitation", "notification-manager_payment"
  ]]]],
  ["message_deliveries", "delete", [["in", "message_id", ["message-1"]]]],
  ["inbox_messages", "delete", [["in", "id", ["message-1"]]]],
  ["inbox_threads", "delete", [["in", "id", ["thread-1"]]]],
  ["notification_preferences", "delete", [["eq", "profile_id", "owner-1"]]]
];

describe("account wipe characterization", () => {
  it("K1 fullAccountWipe deletes the complete ordered scope", async () => {
    expect(await run(fullAccountWipe)).toEqual({ success: true, message: "Your Domus account data has been wiped." });
    assertTrace(fullLog);
    expect(mocks.revalidate.mock.calls).toEqual([["/settings"], ["/owner"], ["/manager"], ["/tenant"]]);
  });
  it("K2 deleteAllProperties keeps templates and deletes its complete ordered scope", async () => {
    expect(await run(deleteAllProperties)).toEqual({
      success: true, message: "All properties and related operational data have been removed."
    });
    assertTrace(propertiesLog);
    expect(opsToLog(rpcPayload()).some((entry) => entry[0] === "document_templates")).toBe(false);
  });
  it("K2 deleteAllTenants deletes its complete ordered scope", async () => {
    expect(await run(deleteAllTenants)).toEqual({ success: true, message: "All tenant-linked data has been removed." });
    assertTrace([
      ["payment_distributions", "delete", [["in", "payment_id", ["payment-1"]]]],
      ["payments", "delete", [["in", "id", ["payment-1"]]]],
      ["rent_charges", "delete", [["in", "id", ["charge-1"]]]],
      ["autopay_enrollments", "delete", [["in", "lease_id", ["lease-1"]]]],
      ["document_signers", "delete", [["in", "packet_id", ["packet-1"]]]],
      ["document_packets", "delete", [["in", "id", ["packet-1"]]]],
      ["maintenance_tickets", "delete", [
        ["in", "property_id", ["property-1"]], ["not", "tenant_profile_id", ["is", null]]
      ]],
      ["invitations", "delete", [["eq", "role", "tenant"], ["in", "property_id", ["property-1"]]]],
      ["inspections", "delete", [["in", "lease_id", ["lease-1"]]]],
  ["documents", "delete", [["in", "lease_id", ["lease-1"]]]],
  ["leases", "delete", [["in", "id", ["lease-1"]]]],
      ["units", "update", [["in", "id", ["unit-1"]]], { occupied: false }]
    ]);
  });
  it("K2 deleteAllManagers deletes its complete ordered scope", async () => {
    expect(await run(deleteAllManagers)).toEqual({
      success: true, message: "All property manager assignments and invites have been removed."
    });
    assertTrace([
      ["property_managers", "delete", [["in", "property_id", ["property-1"]]]],
      ["invitations", "delete", [["eq", "role", "manager"], ["in", "property_id", ["property-1"]]]]
    ]);
  });
  it("K2 deleteAllLeases deletes its complete ordered scope", async () => {
    expect(await run(deleteAllLeases)).toEqual({ success: true, message: "All leases and rent schedules have been removed." });
    assertTrace([
      ...leaseFinancials,
      ["document_signers", "delete", [["in", "packet_id", ["packet-1"]]]],
      ["document_packets", "delete", [["in", "id", ["packet-1"]]]],
      ["inspections", "delete", [["in", "lease_id", ["lease-1"]]]],
  ["documents", "delete", [["in", "lease_id", ["lease-1"]]]],
  ["leases", "delete", [["in", "id", ["lease-1"]]]],
      ["units", "update", [["in", "id", ["unit-1"]]], { occupied: false }]
    ]);
  });
  it("K2 deleteAllFinancialData deletes its complete ordered scope", async () => {
    expect(await run(deleteAllFinancialData)).toEqual({ success: true, message: "All financial records have been cleared." });
    assertTrace([
      ["payment_distributions", "delete", [["in", "payment_id", ["payment-1"]]]],
      ["payment_distributions", "delete", [["in", "account_id", ["account-1"]]]],
      ["payments", "delete", [["in", "id", ["payment-1"]]]],
      ["rent_charges", "delete", [["in", "id", ["charge-1"]]]],
      ["property_expenses", "delete", [["in", "property_id", ["property-1"]]]]
    ]);
  });
  for (const [name, action] of Object.entries(actions)) {
    it.each(["manager", "tenant"])(`K3 ${name} rejects role %s without writes`, async (role) => {
      mocks.auth.mockResolvedValue({ user: { id: "user-1" }, role });
      expect(await run(action)).toEqual({ success: false, error: "Only owners can perform this action." });
      expectNoWrites();
    });
    it(`K3 ${name} rejects rate limit without writes`, async () => {
      mocks.rate.mockReturnValue({ allowed: false });
      expect(await run(action)).toEqual({ success: false, error: "Too many requests. Please try again later." });
      expectNoWrites();
    });
    it.each([undefined, "delete", "DELETE "])(`K3 ${name} rejects confirmation %s without writes`, async (value) => {
      expect(await action({ success: false, error: "previous" }, form(value))).toEqual({
        success: false, error: 'Type "DELETE" to confirm this action.'
      });
      expectNoWrites();
    });
  }
  it.each(["22P02", "42883", "PGRST202", "DW001"])("A2 confirmed %s rolls back the full wipe", async (code) => {
    mocks.rpcReply = () => ({ data: null, error: { code, message: "simulated failure" } });
    expect(await run(fullAccountWipe)).toEqual({
      success: false, error: "Unable to complete the full account wipe right now."
    });
    expect(rpcCalls()).toHaveLength(1);
    expect(mocks.directWrites).toEqual([]);
    expect(mocks.log.filter((entry) => entry.op === "delete" || entry.op === "update" || entry.remove)).toEqual([]);
    expect(mocks.dbState).toEqual(["original"]);
    expect(mocks.revalidate).not.toHaveBeenCalled();
    expect(mocks.sideEffectError).toHaveBeenCalledExactlyOnceWith(
      "fullAccountWipe", "database_rollback_confirmed"
    );
  });
  it.each(["reject", "empty", "PGRST000", "PGRST003", "08006", "57P01", "no-code"])(
    "A2b unknown RPC outcome %s is never retried", async (caseName) => {
      if (caseName === "reject") mocks.rpcReject = true;
      else if (caseName === "empty") mocks.rpcReply = () => ({ data: null, error: null });
      else mocks.rpcReply = () => ({ data: null, error: caseName === "no-code"
        ? { message: "Bad gateway" } : { code: caseName } });
      expect(await run(fullAccountWipe)).toEqual({
        success: false, error: "Unable to complete the full account wipe right now."
      });
      expect(rpcCalls()).toHaveLength(1);
      expect(mocks.directWrites).toEqual([]);
      expect(mocks.log.filter((entry) => entry.op === "delete" || entry.op === "update" || entry.remove)).toEqual([]);
      expect(mocks.revalidate).not.toHaveBeenCalled();
      expect(mocks.sideEffectError).toHaveBeenCalledExactlyOnceWith(
        "fullAccountWipe", "rpc_result_unknown"
      );
    }
  );
  it.each(["count", "not-array", "missing", "label", "negative", "both-rows-and-skip"])(
    "A2c invalid success %s blocks storage and revalidation", async (caseName) => {
      mocks.rpcReply = (ops) => {
        const results: Array<Record<string, unknown>> = ops.map((op) => ({ label: op.label, rows: 0 }));
        let operations = ops.length;
        if (caseName === "count") operations--;
        if (caseName === "missing") results.pop();
        if (caseName === "label") results[0].label = "wrong";
        if (caseName === "negative") results[0].rows = -1;
        if (caseName === "both-rows-and-skip") results[0] = { label: ops[0].label, rows: 0, skipped: true };
        return { data: { operations, results: caseName === "not-array" ? {} : results }, error: null };
      };
      expect(await run(deleteAllProperties)).toEqual({
        success: false, error: "Unable to delete property data right now."
      });
      expect(rpcCalls()).toHaveLength(1);
      expect(mocks.directWrites).toEqual([]);
      expect(mocks.log.filter((entry) => entry.remove)).toEqual([]);
      expect(mocks.revalidate).not.toHaveBeenCalled();
      expect(mocks.sideEffectError).toHaveBeenCalledExactlyOnceWith(
        "deleteAllProperties", "rpc_result_unknown"
      );
    }
  );
  it("S6 commits a valid skip, logs count and labels once, then removes storage", async () => {
    mocks.rpcReply = (ops) => ({ data: {
      operations: ops.length,
      results: ops.map((op, index) => index < 2
        ? { label: op.label, skipped: true } : { label: op.label, rows: 0 })
    }, error: null });
    expect(await run(deleteAllProperties)).toEqual({
      success: true, message: "All properties and related operational data have been removed."
    });
    expect(mocks.sideEffectError).toHaveBeenCalledExactlyOnceWith("deleteAllProperties", "committed_with_skip");
    expect(mocks.sideEffectHandler.mock.calls[0][0].message).toBe(
      "Skipped 2 operations: Delete payment distributions by payment, Delete payment distributions by account"
    );
    expect(mocks.log.filter((entry) => entry.remove)).toHaveLength(2);
  });
  it.each(Object.entries(actions))("S9 %s rolls back on DW001 without cleanup", async (_name, action) => {
    mocks.rpcReply = () => ({ data: null, error: { code: "DW001" } });
    expect(await run(action)).toMatchObject({ success: false });
    expect(rpcCalls()).toHaveLength(1);
    expect(mocks.log.filter((entry) => entry.remove)).toEqual([]);
    expect(mocks.revalidate).not.toHaveBeenCalled();
    expect(mocks.sideEffectError).toHaveBeenCalledExactlyOnceWith(
      action.name, "database_rollback_confirmed"
    );
  });
  it.each([deleteAllProperties, fullAccountWipe])("S10 %s orders ticket assignments and schedules before vendors", async (action) => {
    expect(await run(action)).toMatchObject({ success: true });
    const ops = rpcPayload();
    const index = (table: string) => ops.findIndex((op) => op.table === table);
    expect(index("maintenance_assignments")).toBeGreaterThanOrEqual(0);
    expect(index("preventive_maintenance_schedules")).toBeGreaterThan(index("maintenance_assignments"));
    expect(index("vendors")).toBeGreaterThan(index("preventive_maintenance_schedules"));
    expect(ops.find((op) => op.table === "vendors")?.filters).toEqual([
      { op: "in", column: "id", values: ["vendor-1"] }
    ]);
    expect(JSON.stringify(ops)).not.toMatch(/"column":"(?:vendor_id|assigned_vendor_id)"/);
  });
  it.each(Object.entries(actions))("S11 %s isolates shared, inactive and manager-only ids", async (_name, action) => {
    mocks.negativeFixtures = true;
    expect(await run(action)).toMatchObject({ success: true });
    const payload = JSON.stringify(rpcPayload());
    for (const id of ["acct-shared", "acct-old", "acct-other", "property-shared", "property-old",
      "property-other", "unit-shared", "lease-shared", "charge-shared", "payment-shared",
      "ticket-shared", "vendor-shared", "invitation-shared"]) {
      expect(payload).not.toContain(`"${id}"`);
    }
  });
  it("A4 reads four request sets before the RPC and puts their IDs in ordered vote deletes", async () => {
    expect(await run(fullAccountWipe)).toEqual({ success: true, message: "Your Domus account data has been wiped." });
    const rpcIndex = mocks.log.findIndex((entry) => entry.op === "rpc");
    const requestTables = [
      "withdrawal_requests", "distribution_change_requests", "account_rename_requests", "account_delete_requests"
    ];
    for (const table of requestTables) {
      expect(mocks.log.findIndex((entry) => entry.table === table && entry.op === "select")).toBeLessThan(rpcIndex);
    }
    expect(opsToLog(rpcPayload()).filter((entry) => String(entry[0]).endsWith("_votes"))).toEqual(
      fullLog.filter((entry) => String(entry[0]).endsWith("_votes"))
    );
  });
  it("A5 storage removal errors are logged and the next removal runs", async () => {
    mocks.storageError = true;
    expect(await run(deleteAllProperties)).toEqual({
      success: true, message: "All properties and related operational data have been removed."
    });
    assertTrace(propertiesLog);
    for (const bucket of ["maintenance-photos", "property-files"]) {
      expect(mocks.sideEffectError).toHaveBeenCalledWith("accountWipe", "remove_storage_objects", {
        entityType: bucket
      });
    }
    expect(mocks.sideEffectError).toHaveBeenCalledTimes(4);
    expect(mocks.sideEffectError.mock.calls.filter((call) => call[1] === "storage_cleanup_failed")).toEqual([
      ["deleteAllProperties", "storage_cleanup_failed"],
      ["deleteAllProperties", "storage_cleanup_failed"]
    ]);
  });
});
