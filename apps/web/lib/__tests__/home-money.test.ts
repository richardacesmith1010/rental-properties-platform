import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  groupByCategory, homeMoneyCsv, loadHomeAlerts, loadHomeMoney, plainMethod, runningBalance, type Entry
} from "@/lib/home-money";

const fixture = vi.hoisted(() => ({
  rows: {} as Record<string, Array<Record<string, unknown>>>,
  calls: [] as Array<{ table: string; filters: Array<[string, string, unknown]> }>
}));
vi.mock("@/lib/property-access", () => ({ canUserAdministerProperty: async () => true }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (table: string) => {
  const filters: Array<[string, string, unknown]> = [];
  const builder = {
    select: () => builder,
    eq: (key: string, value: unknown) => { filters.push(["eq", key, value]); return builder; },
    in: (key: string, value: unknown) => { filters.push(["in", key, value]); return builder; },
    is: (key: string, value: unknown) => { filters.push(["is", key, value]); return builder; },
    gte: (key: string, value: unknown) => { filters.push(["gte", key, value]); return builder; },
    lt: (key: string, value: unknown) => { filters.push(["lt", key, value]); return builder; },
    maybeSingle: async () => {
      fixture.calls.push({ table, filters });
      return { data: fixture.rows[table]?.[0] ?? null, error: null };
    },
    then: (resolve: (result: unknown) => void) => {
      fixture.calls.push({ table, filters });
      const data = (fixture.rows[table] ?? []).filter((row) => filters.every(([op, key, value]) => {
        const actual = row[key];
        return op === "eq" ? actual === value : op === "in" ? (value as unknown[]).includes(actual)
          : op === "is" ? actual === value : op === "gte" ? String(actual) >= String(value)
            : String(actual) < String(value);
      }));
      resolve({ data, error: null });
    }
  };
  return builder;
} }) }));

const rent = (amountCents: number, id = "rent"): Entry => ({
  id, date: "2026-10-01", kind: "rent", title: "Rent from Tenant", detail: "Rent",
  category: "rent", amountCents, direction: "in", source: "Paid online"
});
const bill = (title: string, amountCents: number, id = title): Entry => ({
  id, date: "2026-10-02", kind: "bill", title, detail: title, category: "other",
  amountCents, direction: "out", source: "Added by you"
});
function seed() {
  fixture.rows = {
    properties: [{ id: "home", name: "1st Home" }], units: [{ id: "unit", property_id: "home" }],
    leases: [{ id: "lease", unit_id: "unit", tenant_profile_id: "tenant", grace_period_days: null, active: true }],
    profiles: [{ id: "tenant", full_name: "Maya", nickname: null }],
    rent_charges: [{ id: "charge", lease_id: "lease", category: "rent", due_date: "2026-10-01",
      status: "pending", deleted_at: null }],
    payments: [], property_expenses: [], bank_transactions: [], bank_accounts: []
  };
  fixture.calls = [];
}
beforeEach(seed);

describe("home money", () => {
  it("computes every running balance through negative $147.27", () => {
    const rows = runningBalance([rent(235000), bill("Mortgage", 103944), bill("Mortgage", 103944, "m2"),
      bill("Solar", 26640), bill("Water", 9200), bill("Pest control", 5999)]);
    expect(rows.map((row) => row.balanceCents)).toEqual([235000, 131056, 27112, 472, -8728, -14727]);
  });
  it("groups rent, two mortgage rows, solar, water and pest control", () => {
    expect(groupByCategory([rent(235000), bill("Mortgage", 103944), bill("Mortgage", 103944, "m2"),
      bill("Solar", 26640), bill("Water", 9200), bill("Pest control", 5999)])).toEqual([
      { label: "Rent", direction: "in", amountCents: 235000 },
      { label: "Mortgage", direction: "out", amountCents: 207888 },
      { label: "Solar", direction: "out", amountCents: 26640 },
      { label: "Water", direction: "out", amountCents: 9200 },
      { label: "Pest control", direction: "out", amountCents: 5999 }
    ]);
  });
  it.each(["2026-10-03", "2026-10-05"])("does not flag Oct 1 rent by %s", async (today) => {
    expect(await loadHomeAlerts("owner", "home", today)).toEqual([]);
  });
  it("flags rent after default grace", async () => {
    expect(await loadHomeAlerts("owner", "home", "2026-10-06")).toEqual([
      { type: "late-rent", title: "Rent from Maya hasn't arrived", detail: "It was due Oct 1." }
    ]);
    expect(fixture.calls.filter((call) => call.table === "units")).toHaveLength(1);
  });
  it.each(["paid", "waived"])("ignores a %s charge", async (status) => {
    fixture.rows.rent_charges[0].status = status;
    expect(await loadHomeAlerts("owner", "home", "2026-10-06")).toEqual([]);
  });
  it("uses custom grace days", async () => {
    fixture.rows.leases[0].grace_period_days = 7;
    expect(await loadHomeAlerts("owner", "home", "2026-10-08")).toEqual([]);
    expect(await loadHomeAlerts("owner", "home", "2026-10-09")).toHaveLength(1);
  });
  it.each([[13000, true], [11000, false]])("compares current Water %i to three prior months", async (current, alerted) => {
    fixture.rows.rent_charges = [];
    fixture.rows.property_expenses = [9200, 9000, 9400, current].map((amount_cents, index) => ({
      id: `water-${index}`, property_id: "home", category: "utility", description: "Water",
      amount_cents, expense_date: ["2026-07-10", "2026-08-10", "2026-09-10", "2026-10-10"][index]
    }));
    const alerts = await loadHomeAlerts("owner", "home", "2026-10-20");
    expect(alerts.some((alert) => alert.title === "Water is higher than usual")).toBe(alerted);
  });
  it("requires two prior months for a higher bill alert", async () => {
    fixture.rows.rent_charges = [];
    fixture.rows.property_expenses = ["2026-09-10", "2026-10-10"].map((expense_date, index) => ({
      id: `water-${index}`, property_id: "home", category: "utility", description: "Water",
      amount_cents: index ? 13000 : 9000, expense_date
    }));
    expect(await loadHomeAlerts("owner", "home", "2026-10-20")).toEqual([]);
  });
  it("excludes reversed payments from totals and bounds bank-link queries", async () => {
    fixture.rows.payments = [
      { id: "good", rent_charge_id: "charge", amount_cents: 235000, paid_at: "2026-10-02",
        reversed_at: null, method: "ach", stripe_payment_intent_id: null },
      { id: "reversed", rent_charge_id: "charge", amount_cents: 8000, paid_at: "2026-10-02",
        reversed_at: "2026-10-03", method: "card", stripe_payment_intent_id: null }
    ];
    fixture.rows.property_expenses = [{ id: "bill", property_id: "home", category: "utility",
      description: "Water", amount_cents: 10000, expense_date: "2026-10-03" }];
    fixture.rows.bank_transactions = [{ payment_id: "good", expense_id: null, bank_account_id: "bank" }];
    fixture.rows.bank_accounts = [{ id: "bank", nickname: "Checking" }];
    const result = await loadHomeMoney("owner", "home", { from: "2026-10-01", to: "2026-11-01" });
    expect(result?.totals).toEqual({ inCents: 235000, outCents: 10000, leftCents: 225000 });
    expect(result?.entries[0].source).toBe("From bank: Checking");
    const links = fixture.calls.filter((call) => call.table === "bank_transactions");
    expect(links.map((call) => call.filters.find(([op]) => op === "in")?.[2])).toEqual([["good"], ["bill"]]);
  });
  it("exports header, cents and neutralized formula text", () => {
    const csv = homeMoneyCsv([{ ...bill("=SUM(1)", 123), balanceCents: -123 }]);
    expect(csv.split("\n")[0]).toBe('"Date","What","Type","Category","In","Out","Balance","Source"');
    expect(csv).toContain("'=SUM(1)");
    expect(csv).toContain('"1.23","-1.23"');
  });
  it("maps payment methods to plain words", () => {
    expect(["ach", "card", "cash", "check", "wire", null].map(plainMethod))
      .toEqual(["Bank transfer", "Card", "Cash", "Check", "Other", "Other"]);
  });
  it("labels an owner-recorded other payment as paid outside Domus", () => {
    expect(plainMethod("other")).toBe("Paid outside Domus");
  });
});
