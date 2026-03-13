"use client";

import { downloadReportCsv, taxSummaryToCsv } from "@/lib/csv-export-reports";
import type { TaxSummaryRow } from "@/lib/reports";
import { formatCurrency } from "@/lib/format";
import { ReportSection } from "./report-layout";

interface TaxSummaryReportProps {
  data: TaxSummaryRow[];
}

export function TaxSummaryReport({ data }: TaxSummaryReportProps) {
  const portfolioTotals = data.reduce(
    (totals, row) => ({
      income: totals.income + row.totalRentalIncome,
      expenses: totals.expenses + row.totalExpenses,
      net: totals.net + row.netIncome
    }),
    { income: 0, expenses: 0, net: 0 }
  );

  return (
    <ReportSection
      id="tax-summary"
      title="Tax Summary"
      description="Annual rental income and deductions in a Schedule E style layout."
      rows={data}
      onExport={() => downloadReportCsv(`domus-tax-summary-${new Date().toISOString().slice(0, 10)}.csv`, taxSummaryToCsv(data))}
      defaultSortKey="property"
      columns={[
        { key: "property", label: "Property", sortValue: (row) => row.propertyName, render: (row) => row.propertyName },
        { key: "address", label: "Address", sortValue: (row) => row.propertyAddress, render: (row) => row.propertyAddress || "—" },
        { key: "income", label: "Rental Income", sortValue: (row) => row.totalRentalIncome, render: (row) => formatCurrency(row.totalRentalIncome) },
        { key: "expenses", label: "Total Expenses", sortValue: (row) => row.totalExpenses, render: (row) => formatCurrency(row.totalExpenses) },
        { key: "net", label: "Net Income", sortValue: (row) => row.netIncome, render: (row) => formatCurrency(row.netIncome) },
        { key: "management", label: "Mgmt Fees", sortValue: (row) => row.managementFees, render: (row) => formatCurrency(row.managementFees) },
        { key: "insurance", label: "Insurance", sortValue: (row) => row.insurance, render: (row) => formatCurrency(row.insurance) },
        { key: "taxes", label: "Taxes", sortValue: (row) => row.taxes, render: (row) => formatCurrency(row.taxes) }
      ]}
      emptyTitle="No tax summary data"
      emptyDescription="Income and expense deductions will appear here once the portfolio has activity."
      footer={
        data.length > 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
            <span className="font-semibold text-zinc-900">Total Portfolio:</span>{" "}
            Income {formatCurrency(portfolioTotals.income)} · Expenses {formatCurrency(portfolioTotals.expenses)} · Net {formatCurrency(portfolioTotals.net)}
          </div>
        ) : null
      }
    />
  );
}
