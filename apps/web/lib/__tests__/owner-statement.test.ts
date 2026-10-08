import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ active: vi.fn(), tables: {} as Record<string, Array<Record<string, unknown>>>, failPage: false }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/client-accounts", () => ({ isActiveClientManager: mocks.active }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (name: string) => query(name) }) }));
import { assertStatementInvariants, getOwnerStatement, StatementAccessError, StatementInvariantError } from "../owner-statement";
import { ownerStatementToCsv } from "../owner-statement-csv";
import { fetchAllPages } from "../supabase-pagination";
import { defaultStatementMonth, denverDateFromTimestamp, isStatementMonth, latestStatementMonth,
  statementMonthWindow, statementMonthOptions } from "../statement-month";
import { escapeAmountCell, escapeCell } from "../csv-export-reports";

function query(name: string) {
  let rows = [...(mocks.tables[name] ?? [])];
  const builder = {
    select: () => builder,
    eq: (key: string, value: unknown) => { rows = rows.filter((row) => row[key] === value); return builder; },
    in: (key: string, values: unknown[]) => { rows = rows.filter((row) => values.includes(row[key])); return builder; },
    gte: (key: string, value: string) => { rows = rows.filter((row) => String(row[key]) >= value); return builder; },
    lt: (key: string, value: string) => { rows = rows.filter((row) => String(row[key]) < value); return builder; },
    order: (key: string) => { rows.sort((a, b) => String(a[key]).localeCompare(String(b[key]))); return builder; },
    range: async (from: number, to: number) => name === "payments" && from >= 1000 && mocks.failPage
      ? { data: null, error: new Error("page failed") }
      : { data: rows.slice(from, to + 1), error: null },
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null })
  };
  return builder;
}
const at = (date: string) => `${date}T18:00:00Z`;
const charge = (id: string, category = "rent", amount_cents = 10000, due_date = "2026-10-01") => ({
  id, lease_id: "l1", due_date, amount_cents, category, status: "pending", deleted_at: null, waived_at: null
});
const payment = (id: string, rent_charge_id: string, paid_at: string, amount_cents: number,
  reversed_at: string | null = null) => ({ id, rent_charge_id, paid_at, amount_cents, reversed_at, method: "cash" });
const now = new Date("2026-11-15T18:00:00Z");
function fixture() {
  mocks.tables = {
    ownership_accounts: [{ id: "a", display_name: "Client LLC", account_type: "llc", managed_client: true }],
    profiles: [{ id: "m", full_name: "Morgan Manager", email: "m@example.test" },
      { id: "t", full_name: "Jane Doe", email: "t@example.test" }],
    properties: [{ id: "h1", owner_account_id: "a", name: "Alpha", active: true },
      { id: "h2", owner_account_id: "a", name: "Beta", active: true },
      { id: "h3", owner_account_id: "a", name: "Gamma", active: true }, { id: "h4", owner_account_id: "a", name: "Old", active: false }],
    units: [{ id: "u1", property_id: "h1", unit_number: "1" },
      { id: "u2", property_id: "h1", unit_number: "2" }],
    leases: [{ id: "l1", unit_id: "u1", tenant_profile_id: "t" }],
    rent_charges: [], payments: [], property_expenses: []
  };
}
const statement = (month = "2026-10") => getOwnerStatement("m", "a", month, now);
beforeEach(() => { fixture(); mocks.failPage = false; mocks.active.mockReset().mockResolvedValue(true); });

describe("owner statement cash rules", () => {
  it("blocks foreign managers before data queries", async () => {
    mocks.active.mockResolvedValue(false);
    await expect(statement()).rejects.toBeInstanceOf(StatementAccessError);
  });
  it("counts recorded rent and paid late fees, utilities and other items", async () => {
    mocks.tables.rent_charges = [charge("r"), charge("l", "late_fee", 200), charge("u", "utility", 300),
      charge("o", "other", 400)];
    mocks.tables.payments = [payment("p1", "r", at("2026-10-02"), 10000),
      payment("p2", "l", at("2026-10-03"), 200), payment("p3", "u", at("2026-10-04"), 300),
      payment("p4", "o", at("2026-10-05"), 400)];
    const result = await statement();
    expect(result.totals.paymentsCents).toBe(10900);
    expect(result.payments.map((row) => row.kindLabel)).toEqual(["Rent", "Late fee", "Utility", "Other"]);
    expect(result.payments[0].tenantLabel).toBe("J. Doe");
  });
  it("records a prior-month reversal once and same-month reversals twice", async () => {
    mocks.tables.rent_charges = [charge("r")];
    mocks.tables.payments = [payment("old", "r", at("2026-09-02"), 1000, at("2026-10-03")),
      payment("same", "r", at("2026-10-04"), 2000, at("2026-10-05"))];
    const result = await statement();
    expect(result.payments.map((row) => row.amountCents)).toEqual([-1000, 2000, -2000]);
    expect(result.totals.paymentsCents).toBe(-1000);
  });
  it("keeps deposits and waivers outside the totals", async () => {
    mocks.tables.rent_charges = [charge("d", "deposit", 5000), { ...charge("w"), status: "waived",
      waived_at: at("2026-10-09") }];
    mocks.tables.payments = [payment("d1", "d", at("2026-09-02"), 5000, at("2026-10-05")),
      payment("d2", "d", at("2026-10-08"), 5000)];
    const result = await statement();
    expect(result.totals.paymentsCents).toBe(0);
    expect(result.notCounted.map((row) => row.label)).toEqual(["Security deposit returned", "Security deposit held", "Waived"]);
  });
  it("counts expenses and computes net", async () => {
    mocks.tables.rent_charges = [charge("r")];
    mocks.tables.payments = [payment("p", "r", at("2026-10-02"), 10000)];
    mocks.tables.property_expenses = [{ id: "e", property_id: "h1", category: "maintenance",
      description: "Roof", amount_cents: 1250, expense_date: "2026-10-08" }];
    const result = await statement();
    expect(result.expenses[0].kindLabel).toBe("Upkeep");
    expect(result.totals).toMatchObject({ paymentsCents: 10000, expensesCents: 1250, netCents: 8750 });
  });
  it("computes remaining owed, clamps overpayments, and ignores tenant reports", async () => {
    mocks.tables.rent_charges = [charge("r"), charge("over", "rent", 1000),
      { ...charge("report"), tenant_reported_paid_at: at("2026-10-06") }];
    mocks.tables.payments = [payment("p", "r", at("2026-10-02"), 4000),
      payment("p2", "over", at("2026-10-02"), 2000)];
    const result = await statement();
    expect(result.owed.map((row) => row.amountCents)).toEqual([6000, 10000]);
    expect(result.totals.stillOwedCents).toBe(16000);
  });
  it("uses cutoff state for waiver and deletion", async () => {
    mocks.tables.rent_charges = [
      { ...charge("novWaive"), status: "waived", waived_at: at("2026-11-02") },
      { ...charge("legacy", "rent", 10000, "2026-09-01"), status: "waived", waived_at: null },
      { ...charge("lateDelete"), deleted_at: at("2026-11-02") },
      { ...charge("earlyDelete"), deleted_at: at("2026-10-05") }];
    mocks.tables.payments = [payment("p1", "lateDelete", at("2026-10-02"), 1000),
      payment("p2", "earlyDelete", at("2026-10-02"), 1000)];
    const result = await statement();
    expect(result.payments).toHaveLength(1);
    expect(result.totals.paymentsCents).toBe(1000);
    expect(result.owed.map((row) => row.amountCents)).toEqual([9000, 10000]);
  });
  it("counts 2500 payments across three loader pages", async () => {
    mocks.tables.rent_charges = [charge("r", "rent", 300000)];
    mocks.tables.payments = Array.from({ length: 2500 }, (_, index) =>
      payment(`p${String(index).padStart(4, "0")}`, "r", at("2026-10-02"), 100));
    const result = await statement();
    expect(result.payments).toHaveLength(2500);
    expect(result.totals.paymentsCents).toBe(250000);
    expect(result.totals.stillOwedCents).toBe(50000);
  });
  it("throws instead of returning partial totals when payment page two fails", async () => {
    mocks.tables.rent_charges = [charge("r", "rent", 300000)];
    mocks.tables.payments = Array.from({ length: 2500 }, (_, index) =>
      payment(`p${String(index).padStart(4, "0")}`, "r", at("2026-10-02"), 100));
    mocks.failPage = true;
    await expect(statement()).rejects.toThrow("page failed");
  });
  it("places two payments around the Denver month edge", async () => {
    mocks.tables.rent_charges = [charge("r")];
    mocks.tables.payments = [payment("oct", "r", "2026-11-01T05:30:00Z", 1000),
      payment("nov", "r", "2026-11-01T07:00:00Z", 2000)];
    expect((await statement("2026-10")).payments.map((row) => row.amountCents)).toEqual([1000]);
    expect((await statement("2026-11")).payments.map((row) => row.amountCents)).toEqual([2000]);
  });
  it("keeps a reversal at the next month start in prior owed", async () => {
    const cutoff = statementMonthWindow("2026-10").next;
    mocks.tables.rent_charges = [charge("r")];
    mocks.tables.payments = [payment("p", "r", at("2026-10-02"), 4000, cutoff)];
    expect((await statement()).totals.stillOwedCents).toBe(6000);
  });
  it("uses half-open timestamps at cutoff", async () => {
    const cutoff = statementMonthWindow("2026-10").next;
    mocks.tables.rent_charges = [{ ...charge("r"), deleted_at: cutoff },
      { ...charge("w"), status: "waived", waived_at: cutoff }];
    mocks.tables.payments = [payment("p", "r", cutoff, 1000, cutoff)];
    const result = await statement();
    expect(result.payments).toHaveLength(0);
    expect(result.owed).toHaveLength(2);
  });
  it("compares Supabase timestamp offsets as instants at the month boundary", async () => {
    mocks.tables.rent_charges = [charge("paid"), charge("deleted"),
      { ...charge("waived"), status: "waived", waived_at: "2026-11-01T06:00:00+00:00" }, charge("reversed")];
    mocks.tables.payments = [payment("boundary", "paid", "2026-11-01T06:00:00+00:00", 1000),
      payment("before", "paid", "2026-11-01T05:59:59.999999+00:00", 2000),
      payment("deleted-payment", "deleted", at("2026-10-02"), 3000),
      payment("reversed", "reversed", at("2026-10-02"), 4000, "2026-11-01T06:00:00+00:00")];
    mocks.tables.rent_charges[1].deleted_at = "2026-11-01T06:00:00+00:00";
    const october = await statement("2026-10");
    const november = await statement("2026-11");
    expect(october.payments.map((row) => row.amountCents)).toEqual([3000, 4000, 2000]);
    expect(november.payments.map((row) => row.amountCents)).toEqual([1000, -4000]);
    expect(october.owed.map((row) => row.amountCents)).toEqual([7000, 8000, 6000, 10000]);
  });
  it("throws for malformed timestamps used in comparisons", async () => {
    mocks.tables.rent_charges = [charge("r")];
    mocks.tables.payments = [payment("p", "r", "not-a-timestamp", 1000)];
    await expect(statement()).rejects.toThrow("Invalid statement timestamp.");
  });
  it("restates un-waived months and lists a later waiver only in November", async () => {
    mocks.tables.rent_charges = [{ ...charge("r", "rent", 10000, "2026-09-01"),
      status: "waived", waived_at: at("2026-11-03") }];
    expect((await statement("2026-09")).owed).toHaveLength(1);
    expect((await statement("2026-10")).owed).toHaveLength(1);
    expect((await statement("2026-11")).notCounted[0].label).toBe("Waived");
    mocks.tables.rent_charges[0].status = "pending";
    mocks.tables.rent_charges[0].waived_at = null;
    expect((await statement("2026-09")).owed).toHaveLength(1);
  });
  it("includes archived homes only with statement activity", async () => {
    mocks.tables.property_expenses = [{ id: "e", property_id: "h4", category: "repair", description: "Fix",
      amount_cents: 500, expense_date: "2026-10-08" }];
    const result = await statement();
    expect(result.homes.map((row) => row.name)).toEqual(["Alpha", "Beta", "Gamma", "Old"]);
    mocks.tables.property_expenses = [];
    expect((await statement()).homes.map((row) => row.name)).toEqual(["Alpha", "Beta", "Gamma"]);
  });
  it("reconciles three homes, two units, mixed money and all CSV sections", async () => {
    mocks.tables.units = [
      { id: "u1", property_id: "h1", unit_number: "1" },
      { id: "u2", property_id: "h1", unit_number: "2" },
      { id: "u3", property_id: "h2", unit_number: "1" },
      { id: "u4", property_id: "h3", unit_number: "1" }
    ];
    mocks.tables.leases = [{ id: "l1", unit_id: "u1", tenant_profile_id: "t" },
      { id: "l2", unit_id: "u2", tenant_profile_id: "t" },
      { id: "l3", unit_id: "u3", tenant_profile_id: "t" }];
    mocks.tables.rent_charges = [charge("rent"), charge("late", "late_fee", 500),
      charge("deposit", "deposit", 2000), { ...charge("waive", "utility", 300),
        status: "waived", waived_at: at("2026-10-03") },
      { ...charge("other", "other", 1000), lease_id: "l2" },
      { ...charge("second", "rent", 8000), lease_id: "l3" }];
    mocks.tables.payments = [payment("a", "rent", at("2026-10-02"), 6000),
      payment("b", "late", at("2026-10-02"), 500),
      payment("c", "deposit", at("2026-10-02"), 2000),
      payment("d", "other", at("2026-10-02"), 1000),
      payment("e", "second", at("2026-09-02"), 8000, at("2026-10-04"))];
    mocks.tables.property_expenses = [
      { id: "e1", property_id: "h1", category: "repair", description: "Pipe", amount_cents: 1000,
        expense_date: "2026-10-05" },
      { id: "e2", property_id: "h2", category: "insurance", description: "Policy", amount_cents: 2000,
        expense_date: "2026-10-05" },
      { id: "e3", property_id: "h3", category: "utility", description: "Water", amount_cents: 300,
        expense_date: "2026-10-05" }
    ];
    const result = await statement();
    expect(result.totals).toEqual({ paymentsCents: -500, expensesCents: 3300,
      netCents: -3800, stillOwedCents: 12000 });
    expect(result.homes.map((home) => home.netCents)).toEqual([6500, -10000, -300]);
    expect(result.payments.some((row) => row.homeLabel === "Alpha, Unit 2")).toBe(true);
    const csv = ownerStatementToCsv(result);
    expect(csv).toContain('"Payments recorded","-5.00"');
    expect(csv).toContain('"Expenses","33.00"');
    expect(csv).toContain('"Net","-38.00"');
    expect(csv).toContain('"Still owed","120.00"');
    expect(result.payments).toHaveLength(4);
    expect(result.expenses).toHaveLength(3);
    expect(result.notCounted).toHaveLength(2);
    expect(result.owed).toHaveLength(2);
  });
  it("reconciles CSV rows and rejects every invariant mismatch", async () => {
    mocks.tables.rent_charges = [charge("r")];
    mocks.tables.payments = [payment("p", "r", at("2026-10-02"), 3000)];
    const result = await statement();
    const csv = ownerStatementToCsv(result);
    expect(csv).toContain('"Payments recorded","30.00"');
    expect(csv).toContain('"Still owed","70.00"');
    const changes = [
      (s: typeof result) => { s.totals.paymentsCents++; },
      (s: typeof result) => { s.homes[0].paymentsCents++; },
      (s: typeof result) => { s.totals.expensesCents++; },
      (s: typeof result) => { s.homes[0].expensesCents++; },
      (s: typeof result) => { s.homes[0].netCents++; },
      (s: typeof result) => { s.totals.netCents++; },
      (s: typeof result) => { s.totals.stillOwedCents++; },
      (s: typeof result) => { s.owed[0].amountCents = 0; }
    ];
    for (const change of changes) {
      const copy = structuredClone(result); change(copy);
      expect(() => assertStatementInvariants(copy)).toThrow(StatementInvariantError);
    }
  });
});

describe("month, pagination and CSV protection", () => {
  it("places the Denver edge in the correct months", () => {
    expect(denverDateFromTimestamp("2026-11-01T05:30:00Z")).toBe("2026-10-31");
    expect(denverDateFromTimestamp("2026-11-01T07:00:00Z")).toBe("2026-11-01");
    expect(statementMonthWindow("2026-10").next).toBe("2026-11-01T06:00:00.000Z");
  });
  it("uses Denver day 10 and day 11, including year rollover", () => {
    expect(defaultStatementMonth(new Date("2027-01-11T06:30:00Z"))).toBe("2026-12");
    expect(defaultStatementMonth(new Date("2027-01-11T07:30:00Z"))).toBe("2027-01");
    expect(latestStatementMonth(new Date("2027-01-01T06:00:00Z"))).toBe("2026-12");
    expect(statementMonthOptions(new Date("2027-01-11T07:30:00Z"))[0]).toBe("2027-01");
    expect(isStatementMonth("2027-02", new Date("2027-01-11T07:30:00Z"))).toBe(false);
  });
  it("loads all 2500 rows and fails on page two", async () => {
    const rows = Array.from({ length: 2500 }, (_, id) => id);
    expect(await fetchAllPages(async (from, to) => ({ data: rows.slice(from, to + 1), error: null }))).toHaveLength(2500);
    await expect(fetchAllPages(async (from, to) => from >= 1000
      ? { data: null, error: new Error("page failed") }
      : { data: rows.slice(from, to + 1), error: null })).rejects.toThrow("page failed");
  });
  it.each(["=", "+", "-", "@", "\t", "\r", "\n"])("protects %j text", (prefix) => {
    expect(escapeCell(`${prefix}1+1`)).toBe(`"'${prefix}1+1"`);
  });
  it("writes negative amount cells without formula prefixes", () => {
    expect(escapeAmountCell(-145000)).toBe('"-1450.00"');
    expect(escapeCell("-1+1")).toBe('"\'-1+1"');
  });
});
