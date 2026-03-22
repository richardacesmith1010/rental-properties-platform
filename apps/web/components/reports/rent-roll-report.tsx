"use client";

import type { ActionState } from "@/app/actions";
import { downloadReportCsv, rentRollToCsv } from "@/lib/csv-export-reports";
import type { RentRollItem } from "@/lib/reports";
import { formatCurrency, formatDate } from "@/lib/format";
import { ReportSection } from "./report-layout";
import { ChargeActionList } from "./drilldown-panel";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface RentRollReportProps {
  data: RentRollItem[];
  onEditCharge?: StatefulAction;
  onDeleteCharge?: StatefulAction;
  onWaiveCharge?: StatefulAction;
}

export function RentRollReport({
  data,
  onEditCharge,
  onDeleteCharge,
  onWaiveCharge
}: RentRollReportProps) {
  return (
    <ReportSection
      id="rent-roll"
      title="Rent Roll"
      description="Current tenant roster with rent amounts and balances."
      rows={data}
      onExport={() => downloadReportCsv(`domus-rent-roll-${new Date().toISOString().slice(0, 10)}.csv`, rentRollToCsv(data))}
      exportLabel="Export CSV"
      defaultSortKey="property"
      columns={[
        { key: "property", label: "Property", sortValue: (row) => row.propertyName, render: (row) => row.propertyName },
        { key: "unit", label: "Unit", sortValue: (row) => row.unitNumber, render: (row) => row.unitNumber },
        {
          key: "tenant",
          label: "Tenant",
          sortValue: (row) => row.tenantName ?? row.tenantEmail ?? "",
          render: (row) => (
            <div>
              <div className="font-medium text-zinc-900">{row.tenantName ?? "Vacant"}</div>
              <div className="text-xs text-zinc-500">{row.tenantEmail ?? "—"}</div>
            </div>
          )
        },
        { key: "rent", label: "Monthly Rent", sortValue: (row) => row.monthlyRentCents, render: (row) => formatCurrency(row.monthlyRentCents) },
        {
          key: "term",
          label: "Lease Term",
          sortValue: (row) => row.leaseStart,
          render: (row) => `${formatDate(row.leaseStart)} to ${formatDate(row.leaseEnd)}`
        },
        { key: "status", label: "Status", sortValue: (row) => row.leaseStatus, render: (row) => row.leaseStatus },
        { key: "balance", label: "Current Balance", sortValue: (row) => row.currentBalance, render: (row) => formatCurrency(row.currentBalance) },
        {
          key: "lastPayment",
          label: "Last Payment",
          sortValue: (row) => row.lastPaymentDate ?? "",
          render: (row) => (row.lastPaymentDate ? formatDate(row.lastPaymentDate) : "—")
        }
      ]}
      emptyTitle="No rent roll data yet"
      emptyDescription="Active leases will appear here once properties and tenants are live."
      getRowId={(row) => row.leaseId}
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
