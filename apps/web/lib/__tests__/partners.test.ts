import { describe, expect, it } from "vitest";
import { calculatePartnerReport, singleSelectedAccount, type Partner, type PartnerPayment } from "@/lib/partners";
import { createPartnerSchema, createPartnerPaymentSchema, createExpenseSchema } from "@/lib/validations";

const a: Partner = { id: "a", accountId: "llc", displayName: "Alice", active: true, profileId: null };
const b: Partner = { id: "b", accountId: "llc", displayName: "Bob", active: true, profileId: null };
const inactive: Partner = { id: "c", accountId: "llc", displayName: "Yani", active: false, profileId: null };
const empty: Partner = { id: "d", accountId: "llc", displayName: "No history", active: false, profileId: null };
const bill = (id: string, category: string, amount_cents: number, expense_date = "2026-01-02") =>
  ({ id, category, amount_cents, expense_date });
const payment = (id: string, fromPartnerId: string | null, toPartnerId: string | null,
  amountCents: number, status: "done" | "planned" = "done", paidOn = "2026-01-03"): PartnerPayment =>
  ({ id, fromPartnerId, toPartnerId, amountCents, status, paidOn, kind: "settle_up", note: null });
const get = (rows: ReturnType<typeof calculatePartnerReport>["rows"], id: string | null) =>
  rows.find((row) => row.id === id)!;

describe("loadPartnerReport calculations", () => {
  it("maps all five kinds and attributes bills with no row to The LLC", () => {
    const expenses = [bill("r", "repair", 10), bill("m", "maintenance", 20),
      bill("i", "improvement", 30), bill("h", "mortgage", 40), bill("u", "utility", 50),
      bill("o", "insurance", 60), bill("l", "legal", 70)];
    const attributions = expenses.slice(0, 6).map((item) => ({ expense_id: item.id, partner_id: "a" }));
    const report = calculatePartnerReport([a], expenses, attributions, [], "all", "2026-01-31");
    expect(get(report.rows, "a").paidByKind).toEqual({ cleaningRepairs: 30, improvements: 30,
      mortgage: 40, utilities: 50, other: 60 });
    expect(get(report.rows, null).paidByKind.other).toBe(70);
  });
  it("calculates done payments for both endpoints and conserves total put in", () => {
    const report = calculatePartnerReport([a, b], [bill("1", "repair", 100), bill("2", "other", 200)],
      [{ expense_id: "1", partner_id: "a" }], [payment("1", "a", "b", 40),
        payment("2", null, "a", 25)], "all", "2026-01-31");
    expect(get(report.rows, "a").putInCents).toBe(115);
    expect(get(report.rows, "b").putInCents).toBe(-40);
    expect(get(report.rows, null).putInCents).toBe(225);
    expect(report.rows.reduce((sum, row) => sum + row.putInCents, 0)).toBe(300);
    expect(get(report.rows, "b").sharePct).toBe(0);
    expect(get(report.rows, "a").sharePct).toBe(34);
  });
  it("keeps planned amounts separate and recomputes projected shares with a crossing to zero", () => {
    const report = calculatePartnerReport([a, b], [bill("1", "repair", 100), bill("2", "repair", 100)],
      [{ expense_id: "1", partner_id: "a" }, { expense_id: "2", partner_id: "b" }],
      [payment("p", "a", "b", 150, "planned", "2026-03-01")], "all", "2026-01-31");
    expect(get(report.rows, "a").putInCents).toBe(100);
    expect(get(report.rows, "b").putInCents).toBe(100);
    expect(get(report.rows, "a").plannedDelta).toBe(150);
    expect(get(report.rows, "b").projectedPutIn).toBe(-50);
    expect(get(report.rows, "a").projectedSharePct).toBe(100);
    expect(get(report.rows, "b").projectedSharePct).toBe(0);
  });
  it("filters bill and payment dates and preserves inactive historical names", () => {
    const report = calculatePartnerReport([inactive, empty], [bill("old", "repair", 100, "2025-01-01"),
      bill("now", "repair", 200, "2026-01-01")],
      [{ expense_id: "old", partner_id: "c" }, { expense_id: "now", partner_id: "c" }],
      [payment("future", "c", null, 50, "done", "2027-01-01")],
      { from: "2026-01-01", to: "2027-01-01" }, "2026-10-12");
    expect(get(report.rows, "c").name).toBe("Yani");
    expect(get(report.rows, "c").putInCents).toBe(200);
    expect(report.rows.some((row) => row.id === "d")).toBe(false);
    const all = calculatePartnerReport([inactive, empty], [bill("old", "repair", 100, "2025-01-01")],
      [{ expense_id: "old", partner_id: "c" }], [], "all", "2026-10-12");
    expect(get(all.rows, "c").putInCents).toBe(100);
  });
});

describe("partner and improvement validation", () => {
  it("accepts Improvement", () => {
    expect(createExpenseSchema.safeParse({ propertyId: "11111111-1111-4111-8111-111111111111",
      category: "improvement", amountDollars: 5, expenseDate: "2026-10-12", recurring: false }).success).toBe(true);
  });
  it("enforces names 1-80, positive amount, distinct endpoints and one named endpoint", () => {
    const accountId = "11111111-1111-4111-8111-111111111111";
    const partnerId = "22222222-2222-4222-8222-222222222222";
    expect(createPartnerSchema.safeParse({ accountId, displayName: " " }).success).toBe(false);
    expect(createPartnerSchema.safeParse({ accountId, displayName: "x".repeat(81) }).success).toBe(false);
    const base = { accountId, fromPartnerId: partnerId, toPartnerId: null, amountCents: 1,
      paidOn: "2026-10-12", kind: "settle_up", status: "done", note: null };
    expect(createPartnerPaymentSchema.safeParse(base).success).toBe(true);
    expect(createPartnerPaymentSchema.safeParse({ ...base, amountCents: 0 }).success).toBe(false);
    expect(createPartnerPaymentSchema.safeParse({ ...base, toPartnerId: partnerId }).success).toBe(false);
    expect(createPartnerPaymentSchema.safeParse({ ...base, fromPartnerId: null }).success).toBe(false);
  });
});

describe("Partners card visibility", () => {
  it("selects one LLC candidate and hides mixed or personal-only views", () => {
    const rows = [{ id: "one", owner_account_id: "llc" }, { id: "two", owner_account_id: "individual" }];
    expect(singleSelectedAccount(rows, ["one"])).toBe("llc");
    expect(singleSelectedAccount(rows, ["one", "two"])).toBeNull();
    expect(singleSelectedAccount([{ id: "personal", owner_account_id: null }], ["personal"])).toBeNull();
  });
});
