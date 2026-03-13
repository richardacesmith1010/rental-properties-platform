"use client";

import { downloadReportCsv, monthlyPnlToCsv } from "@/lib/csv-export-reports";
import type { MonthlyPnLRow } from "@/lib/reports";
import { formatCurrency } from "@/lib/format";
import { ReportSection } from "./report-layout";

interface MonthlyPnLReportProps {
  data: MonthlyPnLRow[];
}

export function MonthlyPnLReport({ data }: MonthlyPnLReportProps) {
  const portfolioSummary = data.reduce(
    (summary, row) => ({
      rentalIncome: summary.rentalIncome + row.rentalIncome,
      lateFeeIncome: summary.lateFeeIncome + row.lateFeeIncome,
      totalIncome: summary.totalIncome + row.totalIncome,
      expenses: summary.expenses + row.expenses,
      netIncome: summary.netIncome + row.netIncome
    }),
    { rentalIncome: 0, lateFeeIncome: 0, totalIncome: 0, expenses: 0, netIncome: 0 }
  );

  return (
    <ReportSection
      id="monthly-pnl"
      title="Monthly P&L"
      description="Revenue versus expenses by property and month."
      rows={data}
      onExport={() => downloadReportCsv(`domus-monthly-pnl-${new Date().toISOString().slice(0, 10)}.csv`, monthlyPnlToCsv(data))}
      defaultSortKey="month"
      columns={[
        { key: "month", label: "Month", sortValue: (row) => row.month, render: (row) => row.month },
        { key: "property", label: "Property", sortValue: (row) => row.propertyName, render: (row) => row.propertyName },
        { key: "rent", label: "Rental Income", sortValue: (row) => row.rentalIncome, render: (row) => formatCurrency(row.rentalIncome) },
        { key: "late", label: "Late Fees", sortValue: (row) => row.lateFeeIncome, render: (row) => formatCurrency(row.lateFeeIncome) },
        { key: "income", label: "Total Income", sortValue: (row) => row.totalIncome, render: (row) => formatCurrency(row.totalIncome) },
        { key: "expenses", label: "Expenses", sortValue: (row) => row.expenses, render: (row) => formatCurrency(row.expenses) },
        { key: "net", label: "Net Income", sortValue: (row) => row.netIncome, render: (row) => formatCurrency(row.netIncome) }
      ]}
      emptyTitle="No P&L data"
      emptyDescription="Income and expense data will populate this report once transactions exist."
      footer={
        data.length > 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
            <span className="font-semibold text-zinc-900">Portfolio Summary:</span>{" "}
            Income {formatCurrency(portfolioSummary.totalIncome)} · Expenses {formatCurrency(portfolioSummary.expenses)} · Net {formatCurrency(portfolioSummary.netIncome)}
          </div>
        ) : null
      }
    />
  );
}
