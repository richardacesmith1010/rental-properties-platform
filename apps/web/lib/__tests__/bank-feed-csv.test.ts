import { describe, expect, it } from "vitest";
import { parseBankCsv } from "@/lib/bank-feed/csv";

describe("bank file parser", () => {
  it("reads Fidelity after a preamble and ignores its footer", () => {
    const header = "Run Date,Account,Action,Symbol,Description,Type,Quantity,Price ($),Commission ($),Fees ($),";
    const rest = "Accrued Interest ($),Amount ($),Cash Balance ($),Settlement Date";
    const text = ["Fidelity account activity", header + rest,
      '10/02/2026,Cash,"DIRECT DEPOSIT NFCU ACH P2P JANE Q TENANTWEB (Cash)",,,Cash,,,,,,2350.00,,',
      '10/05/2026,Cash,"Electronic Funds Transfer Paid (Cash)",,,Cash,,,,,,-2350.00,,',
      "The information here is for your records."].join("\n");
    const result = parseBankCsv(text);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.institution).toBe("fidelity");
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((row) => [row.direction, row.amountCents])).toEqual([["in", 235000], ["out", 235000]]);
    expect(result.ignoredLineCount).toBe(2);
  });

  it("reads Navy Federal debit indicators and exact cents", () => {
    const head = "Posting Date,Transaction Date,Amount,Credit Debit Indicator,type,Type Group,Reference,";
    const tail = "Instructed Currency,Currency Exchange Rate,Instructed Amount,Description,Category,Check Serial Number,Card Ending";
    const row = (date: string, amount: string, direction: string, description: string) =>
      `${date},,${amount},${direction},,,,,,,${description},,,`;
    const text = [head + tail,
      row("11/05/2026", "2350.00", "Credit", "ACH Credit"),
      row("10/01/2026", "1039.44", "Debit", "Transfer To Mortgage"),
      row("09/15/2026", "1039.44", "Debit", "Transfer To Mortgage"),
      row("10/14/2026", "266.40", "Debit", "Payment to Solar Servicing"),
      row("10/16/2026", "92.00", "Debit", "- Ispc XX0028"),
      row("10/17/2026", "59.99", "Debit", "Py *magna Pest Sol"),
      row("10/18/2026", "2280.07", "Debit", "Rps*cortland"),
      row("10/19/2026", "81.81", "Debit", "Payment to xfinity")].join("\n");
    const result = parseBankCsv(text);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.institution).toBe("navy_federal");
    expect(result.rows.map((item) => item.amountCents)).toEqual([235000, 103944, 103944, 26640, 9200, 5999, 228007, 8181]);
    expect(result.rows.map((item) => item.direction)).toEqual(["in", ...Array(7).fill("out")]);
  });

  it("reads separate debit and credit fields with quoted commas", () => {
    const result = parseBankCsv('Date,Description,Debit,Credit\nOct-01-2026,"Mortgage, October","$1,039.44",\n');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.rows).toEqual([{ postedOn: "2026-10-01", amountCents: 103944,
      direction: "out", description: "Mortgage, October" }]);
  });

  it("uses absolute debit and credit amounts and ignores rows with both", () => {
    const csv = ["Date,Description,Debit,Credit", "2026-10-01,Negative debit,-59.99,",
      "2026-10-02,Positive debit,59.99,", "2026-10-03,Rent,,2350.00",
      "2026-10-04,Both,10.00,10.00", "2026-10-05,Dollar first,$-59.99,",
      "2026-10-06,Sign first,-$59.99,"].join("\n");
    const result = parseBankCsv(csv);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.rows.map(({ amountCents, direction }) => [amountCents, direction]))
      .toEqual([[5999, "out"], [5999, "out"], [235000, "in"], [5999, "out"], [5999, "out"]]);
    expect(result.ignoredLineCount).toBe(1);
  });

  it("accepts both dollar sign positions in a signed amount", () => {
    const result = parseBankCsv("Date,Description,Amount\n2026-10-01,First,$-59.99\n2026-10-02,Second,-$59.99");
    expect(result.success && result.rows.map((item) => [item.amountCents, item.direction]))
      .toEqual([[5999, "out"], [5999, "out"]]);
  });

  it("rejects oversized files and drops bad dates and zero amounts", () => {
    expect(parseBankCsv("x".repeat(2 * 1024 * 1024 + 1))).toEqual({ success: false, error: "too_large" });
    const result = parseBankCsv("Date,Description,Amount\n2026-02-30,Bad,1.00\n2026-10-01,Zero,0.00\n2026-10-02,Good,1.01");
    expect(result.success && result.rows).toEqual([{ postedOn: "2026-10-02", amountCents: 101,
      direction: "in", description: "Good" }]);
  });
});
