import type {
  DelinquencyItem,
  MonthlyPnLRow,
  ReceivableItem,
  RentRollItem,
  TaxSummaryRow,
  TenantLedger
} from "@/lib/reports";

function escapeCell(value: string | number | null | undefined) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function buildCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  return [
    headers.map(escapeCell).join(","),
    ...rows.map((row) => row.map(escapeCell).join(","))
  ].join("\n");
}

export function downloadReportCsv(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function rentRollToCsv(data: RentRollItem[]): string {
  return buildCsv(
    ["Property", "Unit", "Tenant", "Tenant Email", "Monthly Rent ($)", "Lease Start", "Lease End", "Status", "Current Balance ($)", "Last Payment"],
    data.map((item) => [
      item.propertyName,
      item.unitNumber,
      item.tenantName,
      item.tenantEmail,
      (item.monthlyRentCents / 100).toFixed(2),
      item.leaseStart,
      item.leaseEnd,
      item.leaseStatus,
      (item.currentBalance / 100).toFixed(2),
      item.lastPaymentDate
    ])
  );
}

export function delinquencyToCsv(data: DelinquencyItem[]): string {
  return buildCsv(
    ["Tenant", "Email", "Property", "Unit", "0-30 ($)", "31-60 ($)", "61-90 ($)", "90+ ($)", "Total Owed ($)"],
    data.map((item) => [
      item.tenantName,
      item.tenantEmail,
      item.propertyName,
      item.unitNumber,
      (item.current / 100).toFixed(2),
      (item.thirtyDay / 100).toFixed(2),
      (item.sixtyDay / 100).toFixed(2),
      (item.ninetyPlus / 100).toFixed(2),
      (item.totalOwed / 100).toFixed(2)
    ])
  );
}

export function tenantLedgerToCsv(data: TenantLedger[]): string {
  return buildCsv(
    ["Tenant", "Email", "Date", "Type", "Description", "Amount ($)", "Balance ($)", "Property", "Unit"],
    data.flatMap((ledger) =>
      ledger.entries.map((entry) => [
        ledger.tenantName,
        ledger.tenantEmail,
        entry.date,
        entry.type,
        entry.description,
        (entry.amount / 100).toFixed(2),
        (entry.balance / 100).toFixed(2),
        entry.propertyName,
        entry.unitNumber
      ])
    )
  );
}

export function monthlyPnlToCsv(data: MonthlyPnLRow[]): string {
  return buildCsv(
    ["Month", "Property", "Rental Income ($)", "Late Fee Income ($)", "Total Income ($)", "Expenses ($)", "Net Income ($)"],
    data.map((row) => [
      row.month,
      row.propertyName,
      (row.rentalIncome / 100).toFixed(2),
      (row.lateFeeIncome / 100).toFixed(2),
      (row.totalIncome / 100).toFixed(2),
      (row.expenses / 100).toFixed(2),
      (row.netIncome / 100).toFixed(2)
    ])
  );
}

export function taxSummaryToCsv(data: TaxSummaryRow[]): string {
  return buildCsv(
    [
      "Property",
      "Address",
      "Rental Income ($)",
      "Advertising ($)",
      "Auto/Travel ($)",
      "Cleaning & Maintenance ($)",
      "Commissions ($)",
      "Insurance ($)",
      "Legal/Professional ($)",
      "Management Fees ($)",
      "Mortgage Interest ($)",
      "Repairs ($)",
      "Supplies ($)",
      "Taxes ($)",
      "Utilities ($)",
      "Other ($)",
      "Total Expenses ($)",
      "Net Income ($)"
    ],
    data.map((row) => [
      row.propertyName,
      row.propertyAddress,
      (row.totalRentalIncome / 100).toFixed(2),
      (row.advertisingExpenses / 100).toFixed(2),
      (row.autoAndTravel / 100).toFixed(2),
      (row.cleaningAndMaintenance / 100).toFixed(2),
      (row.commissions / 100).toFixed(2),
      (row.insurance / 100).toFixed(2),
      (row.legalAndProfessional / 100).toFixed(2),
      (row.managementFees / 100).toFixed(2),
      (row.mortgageInterest / 100).toFixed(2),
      (row.repairs / 100).toFixed(2),
      (row.supplies / 100).toFixed(2),
      (row.taxes / 100).toFixed(2),
      (row.utilities / 100).toFixed(2),
      (row.otherExpenses / 100).toFixed(2),
      (row.totalExpenses / 100).toFixed(2),
      (row.netIncome / 100).toFixed(2)
    ])
  );
}

export function receivablesToCsv(data: ReceivableItem[]): string {
  return buildCsv(
    ["Tenant", "Email", "Property", "Charge Count", "Total Owed ($)", "Oldest Due Date"],
    data.map((row) => [
      row.tenantName,
      row.tenantEmail,
      row.propertyName,
      row.chargeCount,
      (row.totalOwedCents / 100).toFixed(2),
      row.oldestDueDate
    ])
  );
}
