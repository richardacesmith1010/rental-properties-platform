import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildAccountExport } from "@/lib/account-export";

type Row = Record<string, unknown>;
const fixture = vi.hoisted(() => ({ tables: {} as Record<string, Row[]>, calls: [] as Array<{
  table: string; columns: string; filters: Array<[string, string, unknown]>; from?: number
}>, fail: "" }));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (table: string) => {
  const call = { table, columns: "", filters: [] as Array<[string, string, unknown]>, from: undefined as number | undefined };
  const query = {
    select(columns: string) { call.columns = columns; fixture.calls.push(call); return query; },
    eq(key: string, value: unknown) { call.filters.push(["eq", key, value]); return query; },
    in(key: string, value: unknown) { call.filters.push(["in", key, value]); return query; },
    is(key: string, value: unknown) { call.filters.push(["is", key, value]); return query; },
    order() { return query; },
    async range(from: number, to: number) {
      call.from = from;
      if (fixture.fail === `${table}:${from}`) return { data: null, error: { message: "database failed" } };
      return { data: rows().slice(from, to + 1), error: null };
    },
    async maybeSingle() { return { data: rows()[0] ?? null, error: null }; }
  };
  function rows() {
    return (fixture.tables[table] ?? []).filter((row) => call.filters.every(([op, key, value]) =>
      op === "eq" ? row[key] === value : op === "is" ? row[key] === value : (value as unknown[]).includes(row[key])
    )).map((row) => Object.fromEntries(call.columns.split(", ").map((key) => [key, row[key]])));
  }
  return query;
} }) }));

const profile = { full_name: "Me", email: "me@example.com", phone: "555", nickname: "M",
  role: "tenant", created_at: "2026-01-01T00:00:00Z", id: "me", stripe_account_id: "secret" };
const keys = (value: object) => Object.keys(value).sort();

beforeEach(() => {
  fixture.calls = [];
  fixture.fail = "";
  fixture.tables = {
    profiles: [profile],
    leases: [
      { id: "lease-me", tenant_profile_id: "me", unit_id: "shared-unit", start_date: "2026-01-01",
        end_date: "2027-01-01", monthly_rent_cents: 125050, deposit_cents: 50000, due_day_of_month: 1, active: true },
      { id: "lease-other", tenant_profile_id: "other", unit_id: "shared-unit", start_date: "2026-01-01" }
    ],
    rent_charges: [
      { id: "charge-me", lease_id: "lease-me", due_date: "2026-10-01", amount_cents: 125050,
        status: "paid", category: "rent", deleted_at: null },
      { id: "charge-other", lease_id: "lease-other", due_date: "2026-10-01", amount_cents: 90000,
        status: "paid", category: "rent", deleted_at: null }
    ],
    payments: [
      { id: "payment-me", rent_charge_id: "charge-me", amount_cents: 125050, paid_at: "2026-10-02T00:00:00Z", method: "ach" },
      { id: "payment-other", rent_charge_id: "charge-other", amount_cents: 90000, paid_at: "2026-10-02T00:00:00Z", method: "card" }
    ],
    maintenance_tickets: [{ id: "repair", tenant_profile_id: "me", title: "Tap", status: "open",
      created_at: "2026-10-01T00:00:00Z", resolved_at: null }],
    inbox_messages: [
      { id: "message-me", sender_profile_id: "me", thread_id: "thread", body: "My words", created_at: "2026-10-01T00:00:00Z" },
      { id: "message-other", sender_profile_id: "other", thread_id: "thread", body: "Private", created_at: "2026-10-01T00:00:00Z" }
    ],
    inbox_threads: [{ id: "thread", property_id: "home", subject: "Other Person other@example.com" }],
    units: [{ id: "shared-unit", property_id: "home", unit_number: "2" }],
    properties: [{ id: "home", name: "Hill House" }],
    property_managers: [{ property_id: "home", manager_profile_id: "me", active: false,
      assigned_at: "2025-01-01T00:00:00Z" }, { property_id: "other-home", manager_profile_id: "other", active: true }],
    manager_payments: [{ id: "manager-pay", manager_profile_id: "me", amount_cents: 125050,
      status: "paid", payment_date: "2026-10-01" }, { id: "other-pay", manager_profile_id: "other", amount_cents: 99900 }]
  };
});

describe("account export", () => {
  it("exports only the tenant's allowlisted data through scoped queries", async () => {
    const result = await buildAccountExport("me", "tenant", "2026-10-07T00:00:00.000Z");
    if (!("leases" in result)) throw new Error("Expected tenant export");
    expect(keys(result)).toEqual(["accountRole", "exportVersion", "generatedAt", "leases", "messagesYouSent",
      "payments", "profile", "rent", "repairs"]);
    expect(keys(result.profile)).toEqual(["createdAt", "email", "fullName", "nickname", "phone", "role"]);
    expect(keys(result.leases[0])).toEqual(["active", "deposit", "dueDay", "endDate", "home", "monthlyRent", "startDate", "unit"]);
    expect(keys(result.rent[0])).toEqual(["amount", "dueDate", "home", "kind", "status", "unit"]);
    expect(keys(result.payments[0])).toEqual(["amount", "dueDate", "method", "paidAt"]);
    expect(keys(result.repairs[0])).toEqual(["reportedAt", "resolvedAt", "status", "title"]);
    expect(keys(result.messagesYouSent[0])).toEqual(["conversation", "sentAt", "text"]);
    expect(result.leases).toHaveLength(1);
    expect(result.rent).toHaveLength(1);
    expect(result.payments).toEqual([{ dueDate: "2026-10-01T00:00:00.000Z", amount: 1250.5,
      paidAt: "2026-10-02T00:00:00.000Z", method: "Bank transfer" }]);
    expect(result.messagesYouSent).toEqual([{ conversation: "Hill House", sentAt: "2026-10-01T00:00:00.000Z", text: "My words" }]);
    expect(JSON.stringify(result)).not.toMatch(/other@example|Private|payment-other|charge-other|secret/);
    expect(fixture.calls.every((call) => !call.columns.includes("*"))).toBe(true);
    expect(Object.fromEntries(fixture.calls.map((call) => [call.table, call.columns]))).toEqual({
      profiles: "full_name, email, phone, nickname, role, created_at",
      inbox_messages: "id, thread_id, body, created_at",
      inbox_threads: "id, property_id",
      leases: "id, unit_id, start_date, end_date, monthly_rent_cents, deposit_cents, due_day_of_month, active",
      rent_charges: "id, lease_id, due_date, amount_cents, status, category",
      payments: "id, rent_charge_id, amount_cents, paid_at, method",
      maintenance_tickets: "id, title, status, created_at, resolved_at",
      units: "id, property_id, unit_number",
      properties: "id, name"
    });
    expect(fixture.calls.find((call) => call.table === "leases")?.filters).toContainEqual(["eq", "tenant_profile_id", "me"]);
    expect(fixture.calls.find((call) => call.table === "rent_charges")?.filters).toContainEqual(["in", "lease_id", ["lease-me"]]);
    expect(fixture.calls.find((call) => call.table === "payments")?.filters).toContainEqual(["in", "rent_charge_id", ["charge-me"]]);
    expect(fixture.calls.find((call) => call.table === "maintenance_tickets")?.filters).toContainEqual(["eq", "tenant_profile_id", "me"]);
    expect(fixture.calls.find((call) => call.table === "inbox_messages")?.filters).toContainEqual(["eq", "sender_profile_id", "me"]);
    expect(fixture.calls.find((call) => call.table === "inbox_threads")?.filters).toContainEqual(["in", "id", ["thread"]]);
  });

  it("exports inactive manager assignments and all own payment history", async () => {
    fixture.tables.profiles = [{ ...profile, role: "manager" }];
    const result = await buildAccountExport("me", "manager", "2026-10-07T00:00:00.000Z");
    if (!("homesManaged" in result)) throw new Error("Expected manager export");
    expect(keys(result)).toEqual(["accountRole", "exportVersion", "generatedAt", "homesManaged", "managerPayments",
      "messagesYouSent", "profile"]);
    expect(keys(result.homesManaged[0])).toEqual(["active", "assignedAt", "home"]);
    expect(keys(result.managerPayments[0])).toEqual(["amount", "date", "status"]);
    expect(result.homesManaged).toEqual([{ home: "Hill House", active: false, assignedAt: "2025-01-01T00:00:00.000Z" }]);
    expect(result.managerPayments).toEqual([{ amount: 1250.5, status: "paid", date: "2026-10-01T00:00:00.000Z" }]);
    expect(fixture.calls.find((call) => call.table === "manager_payments")?.filters).toContainEqual(["eq", "manager_profile_id", "me"]);
    expect(fixture.calls.find((call) => call.table === "property_managers")?.filters).toContainEqual(["eq", "manager_profile_id", "me"]);
  });

  it("pages past 500 rows and fails if a later page fails", async () => {
    fixture.tables.maintenance_tickets = Array.from({ length: 501 }, (_, index) => ({ id: `repair-${index}`,
      tenant_profile_id: "me", title: "Tap", status: "open", created_at: "2026-10-01T00:00:00Z", resolved_at: null }));
    const result = await buildAccountExport("me", "tenant", "2026-10-07T00:00:00.000Z");
    if (!("repairs" in result)) throw new Error("Expected tenant export");
    expect(result.repairs).toHaveLength(501);
    expect(fixture.calls.filter((call) => call.table === "maintenance_tickets").map((call) => call.from)).toEqual([0, 500]);
    fixture.fail = "maintenance_tickets:500";
    await expect(buildAccountExport("me", "tenant", "2026-10-07T00:00:00.000Z")).rejects.toThrow("database failed");
  });

  it("skips charges and payments when there is no lease", async () => {
    fixture.tables.leases = [];
    await buildAccountExport("me", "tenant", "2026-10-07T00:00:00.000Z");
    expect(fixture.calls.some((call) => call.table === "rent_charges" || call.table === "payments")).toBe(false);
  });

  it("splits derived id filters into chunks of at most 200", async () => {
    const baseLease = fixture.tables.leases[0];
    fixture.tables.leases = Array.from({ length: 201 }, (_, index) => ({ ...baseLease, id: `lease-${index}` }));
    fixture.tables.rent_charges = [];
    const result = await buildAccountExport("me", "tenant", "2026-10-07T00:00:00.000Z");
    if (!("leases" in result)) throw new Error("Expected tenant export");
    expect(result.leases).toHaveLength(201);
    const chargeCalls = fixture.calls.filter((call) => call.table === "rent_charges");
    expect(chargeCalls).toHaveLength(2);
    expect(chargeCalls.map((call) => (call.filters.find(([op]) => op === "in")?.[2] as string[]).length)).toEqual([200, 1]);
    expect(fixture.calls.some((call) => call.table === "payments")).toBe(false);
  });
});
