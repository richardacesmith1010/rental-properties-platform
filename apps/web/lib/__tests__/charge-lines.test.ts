import { describe, expect, it, vi } from "vitest";
import { chargeBreakdown, splitChargePayment, createRentChargeWithLines } from "@/lib/charge-lines";
import { rentOnlyReceivedCents, rentReceivedCents } from "@/lib/rent-received";
import { groupByCategory, type Entry } from "@/lib/home-money";

const charge = { id: "charge", amount_cents: 227259 };
const utility = (amount_cents: number) => ({ kind: "utility" as const, amount_cents });
const credit = (amount_cents: number) => ({ kind: "credit" as const, amount_cents });

describe("chargeBreakdown / splitChargePayment §8.5", () => {
  it("credits rent first when credit is below rent", () => {
    const parts = chargeBreakdown(charge, [utility(11259), credit(-10494)]);
    expect(parts).toEqual({ rentCents: 226494, utilityCents: 11259,
      creditCents: -10494, totalCents: 227259 });
    expect(splitChargePayment(parts)).toEqual({ rentIncomeCents: 216000, waterPaidBackCents: 11259 });
  });

  it("credits exactly rent and leaves water income", () => {
    const parts = chargeBreakdown({ id: "c", amount_cents: 100 }, [utility(100), credit(-200)]);
    expect(splitChargePayment(parts)).toEqual({ rentIncomeCents: 0, waterPaidBackCents: 100 });
  });

  it("credits more than rent but less than the total", () => {
    const parts = chargeBreakdown({ id: "c", amount_cents: 50 }, [utility(100), credit(-150)]);
    expect(splitChargePayment(parts)).toEqual({ rentIncomeCents: 0, waterPaidBackCents: 50 });
  });

  it("reconciles several water and credit lines", () => {
    const parts = chargeBreakdown({ id: "c", amount_cents: 250 },
      [utility(75), utility(25), credit(-20), credit(-30)]);
    const split = splitChargePayment(parts);
    expect(split.rentIncomeCents).toBeGreaterThanOrEqual(0);
    expect(split.waterPaidBackCents).toBeGreaterThanOrEqual(0);
    expect(split.rentIncomeCents + split.waterPaidBackCents).toBe(parts.totalCents);
  });

  it("throws when parts cannot reconcile", () => {
    expect(() => chargeBreakdown({ id: "c", amount_cents: 10 }, [utility(20)])).toThrow(
      "Charge lines do not reconcile.");
  });
});

describe("rent collected attribution §8.6b-c", () => {
  const charges = [{ id: "c", category: "rent", amount_cents: 227259, deleted_at: null }];
  const payments = [{ id: "p", rent_charge_id: "c", amount_cents: 227259,
    paid_at: "2026-11-02", reversed_at: null }];
  it("excludes water from Rent collected while keeping all money in", () => {
    const lines = [{ id: "w", lease_id: "l", charge_id: "c", kind: "utility" as const,
      label: "Water", amount_cents: 11259 }];
    expect(rentOnlyReceivedCents(charges, payments, "2026-01-01", "2027-01-01", lines)).toBe(216000);
    expect(rentReceivedCents(charges, payments, "2026-01-01", "2027-01-01")).toBe(227259);
  });
  it("leaves an unlined total unchanged", () => {
    expect(rentOnlyReceivedCents(charges, payments, "2026-01-01", "2027-01-01", [])).toBe(227259);
  });
});

describe("water paid back display §8.6a", () => {
  it("shows separate Rent and Water paid back groups that sum to the payment", () => {
    const base = { id: "p", date: "2026-11-02", kind: "rent" as const,
      detail: "Rent", direction: "in" as const, source: "Paid online" };
    const entries: Entry[] = [
      { ...base, title: "Rent from Jamie", category: "rent", amountCents: 216000 },
      { ...base, id: "p:water", title: "Water paid back from Jamie",
        category: "utility_reimbursement", amountCents: 11259 }
    ];
    expect(groupByCategory(entries)).toEqual(expect.arrayContaining([
      { label: "Rent", direction: "in", amountCents: 216000 },
      { label: "Water paid back", direction: "in", amountCents: 11259 }
    ]));
    expect(entries.reduce((sum, entry) => sum + entry.amountCents, 0)).toBe(227259);
  });
});

describe("charge generation RPC boundary §8.3", () => {
  it("passes rent to the transaction, which returns the created charge result", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ charge_id: "c", created: true }], error: null });
    const admin = { rpc } as never;
    expect(await createRentChargeWithLines(admin, "lease", "2026-11-01", 216000)).toBe(true);
    expect(rpc).toHaveBeenCalledWith("create_rent_charge_with_lines", {
      p_lease_id: "lease", p_due_date: "2026-11-01", p_rent_cents: 216000
    });
  });
  it("does not count a duplicate charge and surfaces an out-of-range RPC error", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [{ charge_id: "c", created: false }], error: null })
      .mockResolvedValueOnce({ data: null, error: new Error("charge_total_out_of_range") });
    const admin = { rpc } as never;
    expect(await createRentChargeWithLines(admin, "lease", "2026-11-01", 216000)).toBe(false);
    await expect(createRentChargeWithLines(admin, "lease", "2026-12-01", 216000))
      .rejects.toThrow("charge_total_out_of_range");
  });
});
