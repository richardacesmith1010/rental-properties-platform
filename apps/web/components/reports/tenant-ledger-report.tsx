"use client";

import { downloadReportCsv, tenantLedgerToCsv } from "@/lib/csv-export-reports";
import type { TenantLedger } from "@/lib/reports";
import { formatCurrency, formatDate } from "@/lib/format";
import { ReportSection } from "./report-layout";

interface TenantLedgerReportProps {
  data: TenantLedger[];
}

interface LedgerRow {
  tenantName: string;
  tenantEmail: string;
  date: string;
  type: string;
  description: string;
  amount: number;
  balance: number;
  propertyName: string;
  unitNumber: string;
}

export function TenantLedgerReport({ data }: TenantLedgerReportProps) {
  const rows: LedgerRow[] = data.flatMap((ledger) =>
    ledger.entries.map((entry) => ({
      tenantName: ledger.tenantName,
      tenantEmail: ledger.tenantEmail,
      date: entry.date,
      type: entry.type,
      description: entry.description,
      amount: entry.amount,
      balance: entry.balance,
      propertyName: entry.propertyName,
      unitNumber: entry.unitNumber
    }))
  );

  return (
    <ReportSection
      id="tenant-ledger"
      title="Tenant Ledger"
      description="Complete charge and payment history for each tenant."
      rows={rows}
      onExport={() => downloadReportCsv(`domus-tenant-ledger-${new Date().toISOString().slice(0, 10)}.csv`, tenantLedgerToCsv(data))}
      defaultSortKey="date"
      defaultSortDirection="desc"
      columns={[
        {
          key: "tenant",
          label: "Tenant",
          sortValue: (row) => row.tenantName,
          render: (row) => (
            <div>
              <div className="font-medium text-zinc-900">{row.tenantName}</div>
              <div className="text-xs text-zinc-500">{row.tenantEmail}</div>
            </div>
          )
        },
        { key: "date", label: "Date", sortValue: (row) => row.date, render: (row) => formatDate(row.date) },
        { key: "type", label: "Type", sortValue: (row) => row.type, render: (row) => row.type },
        { key: "description", label: "Description", sortValue: (row) => row.description, render: (row) => row.description },
        { key: "amount", label: "Amount", sortValue: (row) => row.amount, render: (row) => formatCurrency(row.amount) },
        { key: "balance", label: "Balance", sortValue: (row) => row.balance, render: (row) => formatCurrency(row.balance) },
        { key: "property", label: "Property", sortValue: (row) => row.propertyName, render: (row) => `${row.propertyName} • Unit ${row.unitNumber}` }
      ]}
      emptyTitle="No tenant ledger data"
      emptyDescription="Charge and payment history will appear once billing activity exists."
    />
  );
}
