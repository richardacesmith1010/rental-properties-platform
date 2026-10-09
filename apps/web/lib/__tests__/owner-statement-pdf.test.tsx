import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { OwnerStatementDocument, formatStatementMoney } from "../pdf/owner-statement-template";
import type { OwnerStatement } from "../owner-statement";
import { readFileSync } from "node:fs";
import path from "node:path";
const blank: OwnerStatement = {
  account: { id: "a", name: "Example Homes", accountType: "llc" },
  month: "2026-10", monthLabel: "October 2026", periodLabel: "October 1 – 31, 2026",
  preparedBy: { name: "Manager", email: "m@example.test" }, generatedAt: "2026-11-01T12:00:00Z",
  totals: { paymentsCents: 0, expensesCents: 0, netCents: 0, stillOwedCents: 0 },
  homes: [], payments: [], expenses: [], notCounted: [], owed: []
};
describe("statement exports", () => {
  it("formats negative statement amounts with an ASCII minus sign", () => {
    expect(formatStatementMoney(-140000)).toBe("-$1,400.00");
    expect(formatStatementMoney(-140000)).not.toContain("\u2212");
    expect(formatStatementMoney(5)).toBe("$0.05");
    expect(formatStatementMoney(-5)).toBe("-$0.05");
  });
  it("renders an empty letter PDF", async () => {
    const buffer = await renderToBuffer(<OwnerStatementDocument statement={blank} />);
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
  });
  it("renders 60 payment rows across multiple pages", async () => {
    const statement: OwnerStatement = { ...blank, totals: { ...blank.totals, paymentsCents: 6000, netCents: 6000 },
      homes: [{ id: "h", name: "House", archived: false, paymentsCents: 6000, expensesCents: 0, netCents: 6000 }],
      payments: Array.from({ length: 60 }, () => ({ date: "2026-10-01", homeLabel: "House",
        tenantLabel: "J. Doe", kindLabel: "Rent", methodLabel: "Cash", amountCents: 100 })) };
    const buffer = await renderToBuffer(<OwnerStatementDocument statement={statement} />);
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(buffer.length).toBeGreaterThan(5000);
  });
  it("renders a reversal payment row as a PDF", async () => {
    const statement: OwnerStatement = { ...blank,
      payments: [{ date: "2026-10-01", homeLabel: "House", tenantLabel: "J. Doe",
        kindLabel: "Reversal", methodLabel: "Cash", amountCents: -140000 }] };
    const buffer = await renderToBuffer(<OwnerStatementDocument statement={statement} />);
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
  });
  it("keeps exports free of data loaders", () => {
    for (const file of ["owner-statement-csv.ts", "pdf/owner-statement-template.tsx"]) {
      const source = readFileSync(path.resolve(__dirname, "..", file), "utf8");
      expect(source).not.toMatch(/createAdminClient|createClient|from\(/);
      expect(source).not.toMatch(/getOwnerStatement/);
    }
  });
});
