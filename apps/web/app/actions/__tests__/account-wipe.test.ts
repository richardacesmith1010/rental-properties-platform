import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), rate: vi.fn(), accounts: vi.fn(), properties: vi.fn(),
  revalidate: vi.fn(), sideEffectError: vi.fn(), sideEffectHandler: vi.fn(),
  log: [] as Array<Record<string, unknown>>,
  failures: [] as Array<{ table: string; op: string; code?: string; at?: number }>,
  storageError: false
}));

vi.mock("server-only", () => ({}));
vi.mock("../auth-helpers", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.rate }));
vi.mock("@/lib/property-access", () => ({
  getAdministeredOwnerAccountIds: mocks.accounts,
  getAdministeredPropertyIds: mocks.properties
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/logger", () => ({ sideEffectError: mocks.sideEffectError }));

const rows: Record<string, Record<string, unknown>[]> = {
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
    delete() { op = "delete"; return chain; },
    update(next: unknown) { op = "update"; values = next; return chain; },
    in(column: string, value: unknown) { filters.push(["in", column, value]); return chain; },
    eq(column: string, value: unknown) { filters.push(["eq", column, value]); return chain; },
    not(column: string, value: string, modifier: unknown) {
      filters.push(["not", column, [value, modifier]]); return chain;
    },
    then(resolve: (result: unknown) => void, reject?: (reason: unknown) => void) {
      const entry = { table, op, filters, ...(op === "update" ? { values } : {}) };
      mocks.log.push(entry);
      const count = mocks.log.filter((item) => item.table === table && item.op === op).length;
      const failure = mocks.failures.find((item) => item.table === table && item.op === op && (item.at ?? 1) === count);
      const error = failure ? { code: failure.code ?? "P0001", message: "simulated failure" } : null;
      const data = table === "notifications"
        ? [{ id: filters.some((filter) => filter[1] === "recipient_profile_id")
          ? "notification-owner-1" : `notification-${filters.find((filter) => filter[1] === "entity_type")?.[2]}` }]
        : rows[table] ?? [];
      return Promise.resolve({ data, error }).then(resolve, reject);
    }
  };
  return chain;
}
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: query,
    rpc: async () => { mocks.log.push({ op: "rpc" }); return { error: null }; },
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
function mutationLog() {
  return mocks.log.filter((entry) => entry.op === "delete" || entry.op === "update" || entry.remove)
    .map((entry) => entry.remove
      ? [entry.bucket, "remove", entry.remove]
      : [entry.table, entry.op, entry.filters, ...(entry.op === "update" ? [entry.values] : [])]);
}
function expectNoWrites() {
  expect(mutationLog()).toEqual([]);
  expect(mocks.log.some((entry) => entry.op === "rpc")).toBe(false);
  expect(mocks.revalidate).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.log.length = 0;
  mocks.failures.length = 0;
  mocks.storageError = false;
  mocks.auth.mockResolvedValue({ user: { id: "owner-1", email: "OWNER@EXAMPLE.COM" }, role: "owner" });
  mocks.rate.mockReturnValue({ allowed: true });
  mocks.accounts.mockResolvedValue(["account-1"]);
  mocks.properties.mockResolvedValue(["property-1"]);
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
  ["vendors", "delete", [["in", "property_id", ["property-1"]]]],
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
  ["leases", "delete", [["in", "id", ["lease-1"]]]],
  ["units", "delete", [["in", "id", ["unit-1"]]]],
  ["properties", "delete", [["in", "id", ["property-1"]]]]
];
const fullLog = [
  ...leaseFinancials, ...maintenance,
  ["property_expenses", "delete", [["in", "property_id", ["property-1"]]]],
  ...documents,
  ["document_templates", "delete", [["in", "id", ["template-1"]]]],
  ...pipeline, ...automation,
  ["vendors", "delete", [["in", "property_id", ["property-1"]]]],
  ["invitations", "delete", [["in", "property_id", ["property-1"]]]],
  ["invitations", "delete", [["in", "ownership_account_id", ["account-1"]]]],
  ["invitations", "delete", [["eq", "email", "owner@example.com"]]],
  ["invitations", "delete", [["eq", "invited_by", "owner-1"]]],
  ["invitations", "delete", [["eq", "invited_profile_id", "owner-1"]]],
  ["leases", "delete", [["in", "id", ["lease-1"]]]],
  ["units", "delete", [["in", "id", ["unit-1"]]]],
  ["property_managers", "delete", [["in", "property_id", ["property-1"]]]],
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
    expect(mutationLog()).toEqual(fullLog);
    expect(mocks.revalidate.mock.calls).toEqual([["/settings"], ["/owner"], ["/manager"], ["/tenant"]]);
  });
  it("K2 deleteAllProperties keeps templates and deletes its complete ordered scope", async () => {
    expect(await run(deleteAllProperties)).toEqual({
      success: true, message: "All properties and related operational data have been removed."
    });
    expect(mutationLog()).toEqual(propertiesLog);
    expect(mutationLog().some((entry) => entry[0] === "document_templates")).toBe(false);
  });
  it("K2 deleteAllTenants deletes its complete ordered scope", async () => {
    expect(await run(deleteAllTenants)).toEqual({ success: true, message: "All tenant-linked data has been removed." });
    expect(mutationLog()).toEqual([
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
      ["leases", "delete", [["in", "id", ["lease-1"]]]],
      ["units", "update", [["in", "id", ["unit-1"]]], { occupied: false }]
    ]);
  });
  it("K2 deleteAllManagers deletes its complete ordered scope", async () => {
    expect(await run(deleteAllManagers)).toEqual({
      success: true, message: "All property manager assignments and invites have been removed."
    });
    expect(mutationLog()).toEqual([
      ["property_managers", "delete", [["in", "property_id", ["property-1"]]]],
      ["invitations", "delete", [["eq", "role", "manager"], ["in", "property_id", ["property-1"]]]]
    ]);
  });
  it("K2 deleteAllLeases deletes its complete ordered scope", async () => {
    expect(await run(deleteAllLeases)).toEqual({ success: true, message: "All leases and rent schedules have been removed." });
    expect(mutationLog()).toEqual([
      ...leaseFinancials,
      ["document_signers", "delete", [["in", "packet_id", ["packet-1"]]]],
      ["document_packets", "delete", [["in", "id", ["packet-1"]]]],
      ["leases", "delete", [["in", "id", ["lease-1"]]]],
      ["units", "update", [["in", "id", ["unit-1"]]], { occupied: false }]
    ]);
  });
  it("K2 deleteAllFinancialData deletes its complete ordered scope", async () => {
    expect(await run(deleteAllFinancialData)).toEqual({ success: true, message: "All financial records have been cleared." });
    expect(mutationLog()).toEqual([
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
  it("K4 first delete error stops fullAccountWipe with its exact error", async () => {
    mocks.failures.push({ table: "payment_distributions", op: "delete" });
    expect(await run(fullAccountWipe)).toEqual({
      success: false, error: "Unable to complete the full account wipe right now."
    });
    expect(mutationLog()).toEqual([
      ["payment_distributions", "delete", [["in", "payment_id", ["payment-1"]]]]
    ]);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("K4 missing-schema select and delete continue to later deletes", async () => {
    mocks.failures.push({ table: "rental_listings", op: "select", code: "42P01" });
    mocks.failures.push({ table: "payment_distributions", op: "delete", code: "42P01" });
    expect(await run(deleteAllProperties)).toEqual({
      success: true, message: "All properties and related operational data have been removed."
    });
    expect(mutationLog()).toEqual(propertiesLog.filter((entry) =>
      !(entry[0] === "rental_listings" && entry[1] === "delete")));
    expect(mutationLog().some((entry) => entry[0] === "properties")).toBe(true);
  });
  it("K4b later delete error preserves exact partial prefix", async () => {
    mocks.failures.push({ table: "leases", op: "delete" });
    expect(await run(deleteAllProperties)).toEqual({
      success: false, error: "Unable to delete property data right now."
    });
    expect(mutationLog()).toEqual([
      ...leaseFinancials, ...maintenance, ...documents, ...pipeline, ...automation,
      ["manager_payments", "delete", [["in", "property_id", ["property-1"]]]],
      ["manager_payment_configs", "delete", [["in", "property_id", ["property-1"]]]],
      ["property_expenses", "delete", [["in", "id", ["expense-1"]]]],
      ["vendors", "delete", [["in", "property_id", ["property-1"]]]],
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
      ["leases", "delete", [["in", "id", ["lease-1"]]]]
    ]);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("K4b update error preserves exact partial prefix", async () => {
    mocks.failures.push({ table: "units", op: "update" });
    expect(await run(deleteAllLeases)).toEqual({
      success: false, error: "Unable to delete lease data right now."
    });
    expect(mutationLog()).toEqual([
      ...leaseFinancials,
      ["document_signers", "delete", [["in", "packet_id", ["packet-1"]]]],
      ["document_packets", "delete", [["in", "id", ["packet-1"]]]],
      ["leases", "delete", [["in", "id", ["lease-1"]]]],
      ["units", "update", [["in", "id", ["unit-1"]]], { occupied: false }]
    ]);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("K5 storage removal errors are logged and the wipe continues", async () => {
    mocks.storageError = true;
    expect(await run(deleteAllProperties)).toEqual({
      success: true, message: "All properties and related operational data have been removed."
    });
    expect(mutationLog()).toEqual(propertiesLog);
    expect(mocks.sideEffectError).toHaveBeenCalledWith("accountWipe", "remove_storage_objects", {
      entityType: "maintenance-photos"
    });
    expect(mocks.sideEffectError).toHaveBeenCalledWith("accountWipe", "remove_storage_objects", {
      entityType: "property-files"
    });
    expect(mocks.sideEffectHandler).toHaveBeenCalledTimes(2);
  });
});
