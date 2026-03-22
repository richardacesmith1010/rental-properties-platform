"use client";

import type { ActionState } from "@/app/actions";
import { delinquencyToCsv, downloadReportCsv } from "@/lib/csv-export-reports";
import type { DelinquencyItem } from "@/lib/reports";
import { formatCurrency } from "@/lib/format";
import { ReportSection } from "./report-layout";
import { ChargeActionList } from "./drilldown-panel";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface DelinquencyReportProps {
  data: DelinquencyItem[];
  onEditCharge?: StatefulAction;
  onDeleteCharge?: StatefulAction;
  onWaiveCharge?: StatefulAction;
}

export function DelinquencyReport({
  data,
  onEditCharge,
  onDeleteCharge,
  onWaiveCharge
}: DelinquencyReportProps) {
  return (
    <ReportSection
      id="delinquency-aging"
      title="Delinquency Aging"
      description="Outstanding balances grouped into 30/60/90+ day buckets."
      rows={data}
      onExport={() => downloadReportCsv(`domus-delinquency-aging-${new Date().toISOString().slice(0, 10)}.csv`, delinquencyToCsv(data))}
      defaultSortKey="total"
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
        { key: "property", label: "Property", sortValue: (row) => row.propertyName, render: (row) => `${row.propertyName} • Unit ${row.unitNumber}` },
        { key: "current", label: "0-30", sortValue: (row) => row.current, render: (row) => formatCurrency(row.current) },
        { key: "thirty", label: "31-60", sortValue: (row) => row.thirtyDay, render: (row) => formatCurrency(row.thirtyDay) },
        { key: "sixty", label: "61-90", sortValue: (row) => row.sixtyDay, render: (row) => formatCurrency(row.sixtyDay) },
        { key: "ninety", label: "90+", sortValue: (row) => row.ninetyPlus, render: (row) => formatCurrency(row.ninetyPlus) },
        { key: "total", label: "Total Owed", sortValue: (row) => row.totalOwed, render: (row) => formatCurrency(row.totalOwed) }
      ]}
      emptyTitle="No delinquency data"
      emptyDescription="Past-due balances will appear here when charges age beyond the due date."
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
