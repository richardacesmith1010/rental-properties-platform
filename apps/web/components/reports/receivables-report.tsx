"use client";

import type { ActionState } from "@/app/actions";
import { downloadReportCsv, receivablesToCsv } from "@/lib/csv-export-reports";
import type { ReceivableItem } from "@/lib/reports";
import { formatCurrency, formatDate } from "@/lib/format";
import { ReportSection } from "./report-layout";
import { ChargeActionList } from "./drilldown-panel";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface ReceivablesReportProps {
  data: ReceivableItem[];
  onEditCharge?: StatefulAction;
  onDeleteCharge?: StatefulAction;
  onWaiveCharge?: StatefulAction;
}

export function ReceivablesReport({
  data,
  onEditCharge,
  onDeleteCharge,
  onWaiveCharge
}: ReceivablesReportProps) {
  return (
    <ReportSection
      id="accounts-receivable"
      title="Accounts Receivable"
      description="All outstanding balances grouped by tenant."
      rows={data}
      onExport={() => downloadReportCsv(`domus-accounts-receivable-${new Date().toISOString().slice(0, 10)}.csv`, receivablesToCsv(data))}
      defaultSortKey="owed"
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
        { key: "property", label: "Property", sortValue: (row) => row.propertyName, render: (row) => row.propertyName },
        { key: "count", label: "Open Charges", sortValue: (row) => row.chargeCount, render: (row) => row.chargeCount },
        { key: "owed", label: "Total Owed", sortValue: (row) => row.totalOwedCents, render: (row) => formatCurrency(row.totalOwedCents) },
        { key: "oldest", label: "Oldest Due", sortValue: (row) => row.oldestDueDate, render: (row) => formatDate(row.oldestDueDate) }
      ]}
      emptyTitle="No receivables"
      emptyDescription="Outstanding balances will appear here when tenants have unpaid charges."
      getRowId={(row) => `${row.leaseId}:${row.tenantEmail}`}
      renderExpandedContent={(row) => (
        <ChargeActionList
          charges={row.chargeDetails}
          onEditCharge={onEditCharge}
          onDeleteCharge={onDeleteCharge}
          onWaiveCharge={onWaiveCharge}
        />
      )}
    />
  );
}
