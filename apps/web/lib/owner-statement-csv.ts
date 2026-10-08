import { escapeAmountCell, escapeCell } from "@/lib/csv-export-reports";
import type { OwnerStatement } from "@/lib/owner-statement";
import { madeDate } from "@/lib/statement-month";

export function ownerStatementToCsv(statement: OwnerStatement): string {
  const rows: string[][] = [];
  const text = (...cells: string[]) => cells.map(escapeCell);
  const amount = (cents: number) => escapeAmountCell(cents);
  const section = (name: string, headers: string[]) => {
    if (rows.length) rows.push([]);
    rows.push(text(name), text(...headers));
  };
  section("Summary", ["Item", "Value"]);
  rows.push(text("Month", statement.monthLabel), text("Made on", madeDate(statement.generatedAt)));
  rows.push([escapeCell("Payments recorded"), amount(statement.totals.paymentsCents)]);
  rows.push([escapeCell("Expenses"), amount(statement.totals.expensesCents)]);
  rows.push([escapeCell("Net"), amount(statement.totals.netCents)]);
  rows.push([escapeCell("Still owed"), amount(statement.totals.stillOwedCents)]);
  rows.push(text("Later fixes to records can change this statement."));
  section("By home", ["Home", "Payments recorded", "Expenses", "Net"]);
  for (const home of statement.homes) rows.push([escapeCell(home.name), amount(home.paymentsCents),
    amount(home.expensesCents), amount(home.netCents)]);
  section("Payments recorded", ["Date", "Home", "Tenant", "Kind", "Method", "Amount"]);
  for (const row of statement.payments) rows.push([...text(row.date, row.homeLabel, row.tenantLabel,
    row.kindLabel, row.methodLabel), amount(row.amountCents)]);
  section("Expenses", ["Date", "Home", "Kind", "Note", "Amount"]);
  for (const row of statement.expenses) rows.push([...text(row.date, row.homeLabel, row.kindLabel, row.note),
    amount(row.amountCents)]);
  section("Not counted", ["Date", "Home", "Kind", "Amount"]);
  for (const row of statement.notCounted) rows.push([...text(row.date, row.homeLabel, row.label), amount(row.amountCents)]);
  section("Still owed", ["Due", "Home", "Amount"]);
  for (const row of statement.owed) rows.push([...text(row.dueDate, row.homeLabel), amount(row.amountCents)]);
  return rows.map((row) => row.join(",")).join("\r\n") + "\r\n";
}
