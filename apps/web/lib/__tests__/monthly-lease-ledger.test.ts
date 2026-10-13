import { describe, expect, it } from "vitest";
import { buildMonthlyLeaseLedger } from "@/lib/reports-ledger";

const lease = { startDate: "2026-11-01", endDate: "2027-10-31", monthlyRentCents: 216000 };

function charge(id: string, due_date: string, amount_cents: number, status = "paid") {
  return { id, due_date, amount_cents, status, deleted_at: null };
}

describe("monthly lease ledger §8.8", () => {
  it("shows the Sheet A November forty-one-cent overpayment", () => {
    const result = buildMonthlyLeaseLedger(lease,
      [charge("nov", "2026-11-01", 227259)],
      [{ rent_charge_id: "nov", amount_cents: 227300, reversed_at: null }],
      [{ id: "water", lease_id: "lease", charge_id: "nov", kind: "utility", label: "Water",
        amount_cents: 11259 }], "2026-11-15");
    expect(result.months[0]).toMatchObject({ rentCents: 216000, utilityCents: 11259,
      paidCents: 227300, balanceCents: -41, short: false });
    expect(result.totals.balanceCents).toBe(-41);
  });

  it("uses cumulative balance but flags a short month by its own payment", () => {
    const result = buildMonthlyLeaseLedger(lease, [
      charge("nov", "2026-11-01", 216000), charge("dec", "2026-12-01", 216000),
      charge("jan", "2027-01-01", 216000), charge("waived", "2027-01-02", 216000, "waived")
    ], [
      { rent_charge_id: "nov", amount_cents: 200000, reversed_at: null },
      { rent_charge_id: "dec", amount_cents: 233000, reversed_at: null },
      { rent_charge_id: "jan", amount_cents: 216000, reversed_at: null },
      { rent_charge_id: "jan", amount_cents: 216000, reversed_at: "2027-01-10" },
      { rent_charge_id: "waived", amount_cents: 216000, reversed_at: null }
    ], [], "2027-02-01");
    expect(result.months.map((row) => row.balanceCents)).toEqual([16000, -1000, -1000]);
    expect(result.months.map((row) => row.short)).toEqual([true, false, false]);
    expect(result.totals).toMatchObject({ owedCents: 648000, paidCents: 649000, balanceCents: -1000 });
  });
});
