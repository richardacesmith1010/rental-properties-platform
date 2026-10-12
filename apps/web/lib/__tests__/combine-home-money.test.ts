import { describe, expect, it } from "vitest";
import { combineHomeMoney, homeMoneyCsv, type HomeMoney } from "@/lib/home-money";

const make = (name: string, id: string, date: string, inCents: number): HomeMoney => ({
  property: { id: name, name },
  entries: [{ id, date, kind: "rent", title: "Rent", detail: "Rent", category: "rent",
    amountCents: inCents, direction: "in", source: "Bank transfer" }],
  totals: { inCents, outCents: 100, leftCents: inCents - 100 }
});

describe("combineHomeMoney", () => {
  const first = make("First", "z", "2026-10-02", 500);
  const second = make("Second", "a", "2026-10-02", 300);
  it("1a sums totals", () => {
    expect(combineHomeMoney([first, second]).totals).toEqual({ inCents: 800, outCents: 200, leftCents: 600 });
  });
  it("1b sorts by date then id and labels each entry", () => {
    expect(combineHomeMoney([first, second]).entries.map((entry) => [entry.id, entry.homeName]))
      .toEqual([["a", "Second"], ["z", "First"]]);
  });
  it("1c preserves single home totals", () => {
    expect(combineHomeMoney([first]).totals).toEqual(first.totals);
  });
  it("3f CSV Home column appears only on all homes export", () => {
    const entries = combineHomeMoney([first, second]).entries;
    expect(homeMoneyCsv(entries, true).split("\n")[0]).toContain('"Home"');
    expect(homeMoneyCsv(entries, false).split("\n")[0]).not.toContain('"Home"');
  });
});
