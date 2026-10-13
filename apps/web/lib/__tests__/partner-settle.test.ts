import { describe, expect, it } from "vitest";
import { suggestEvenSettleUp } from "@/lib/partner-settle";
import type { PartnerLine } from "@/lib/partners";

const row = (id: string | null, name: string, projectedPutIn: number, active = true) =>
  ({ id, name, projectedPutIn, active } as PartnerLine);
const settled = (rows: PartnerLine[]) => {
  const values = new Map(rows.filter((item) => item.id !== null).map((item) => [item.id, item.projectedPutIn]));
  const suggestions = suggestEvenSettleUp(rows);
  for (const item of suggestions) {
    values.set(item.fromPartnerId, values.get(item.fromPartnerId)! + item.amountCents);
    values.set(item.toPartnerId, values.get(item.toPartnerId)! - item.amountCents);
  }
  return { values, suggestions };
};

describe("suggestEvenSettleUp", () => {
  it("8a: the partner who put in $100 pays $100 to the partner who put in $300", () => {
    expect(suggestEvenSettleUp([row("a", "Alice", 30000), row("b", "Bob", 10000)]))
      .toEqual([{ fromPartnerId: "b", fromName: "Bob", toPartnerId: "a", toName: "Alice", amountCents: 10000 }]);
  });
  it("8b: three partners settle exactly in at most two payments", () => {
    const { values, suggestions } = settled([row("a", "Alice", 5000), row("b", "Bob", 2000), row("c", "Cara", 2000)]);
    expect([...values.values()]).toEqual([3000, 3000, 3000]);
    expect(suggestions.length).toBeLessThanOrEqual(2);
  });
  it("8c: remainder cents go to the first names and targets conserve the total", () => {
    const { values } = settled([row("c", "Cara", 0), row("b", "Bob", 0), row("a", "Alice", 304)]);
    expect(values.get("a")).toBe(102);
    expect(values.get("b")).toBe(101);
    expect(values.get("c")).toBe(101);
    expect([...values.values()].reduce((sum, value) => sum + value, 0)).toBe(304);
  });
  it("8d: excludes The LLC and inactive partners", () => {
    expect(suggestEvenSettleUp([row(null, "The LLC", 100000), row("x", "Ex", 99999, false),
      row("a", "Alice", 30000), row("b", "Bob", 10000)])).toHaveLength(1);
  });
  it("8e: planned payments already reflected in projected put-in are not suggested twice", () => {
    expect(suggestEvenSettleUp([row("a", "Alice", 20000), row("b", "Bob", 20000)])).toEqual([]);
  });
  it("8f: every partner within $1 of target hides suggestions", () => {
    expect(suggestEvenSettleUp([row("a", "Alice", 20100), row("b", "Bob", 19900)])).toEqual([]);
  });
  it("8g: fewer than two active partners returns nothing", () => {
    expect(suggestEvenSettleUp([row("a", "Alice", 10000), row("b", "Bob", 0, false)])).toEqual([]);
  });
  it("8h: ties resolve by name then id independent of input order", () => {
    const rows = [row("z", "Alex", 0), row("a", "Alex", 0), row("c", "Cara", 3000)];
    expect(suggestEvenSettleUp(rows)).toEqual(suggestEvenSettleUp([...rows].reverse()));
    expect(suggestEvenSettleUp(rows).map((item) => item.fromPartnerId)).toEqual(["a", "z"]);
  });
  it("8h: repeats greedy matching with the largest remaining debtor", () => {
    const result = suggestEvenSettleUp([row("a", "Alice", 100), row("b", "Bob", 300),
      row("c", "Cara", 1800), row("d", "Dina", 1800)]);
    expect(result.map((item) => [item.fromPartnerId, item.toPartnerId, item.amountCents]))
      .toEqual([["a", "c", 800], ["b", "d", 700], ["a", "d", 100]]);
  });
  it("8i: all amounts are positive integer cents", () => {
    const result = suggestEvenSettleUp([row("a", "Alice", 5001), row("b", "Bob", 0), row("c", "Cara", 0)]);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((item) => Number.isInteger(item.amountCents) && item.amountCents > 0)).toBe(true);
  });
});
