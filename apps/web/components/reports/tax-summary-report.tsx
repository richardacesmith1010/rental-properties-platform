"use client";

import { useFormState } from "react-dom";
import { toast } from "sonner";
import { SubmitButton } from "@/components/shared/submit-button";
import type { ActionState } from "@/app/actions/shared";
import { downloadReportCsv, taxSummaryToCsv } from "@/lib/csv-export-reports";
import type { TaxSummaryRow } from "@/lib/reports";
import { formatCurrency } from "@/lib/format";
import { ReportSection } from "./report-layout";

interface TaxSummaryReportProps {
  data: TaxSummaryRow[];
  year: number;
  onSave: (prev: ActionState, data: FormData) => Promise<ActionState>;
}

function TaxNumbersForm({ row, year, onSave }: { row: TaxSummaryRow; year: number; onSave: TaxSummaryReportProps["onSave"] }) {
  const saveWithToast: TaxSummaryReportProps["onSave"] = async (prev, formData) => {
    const result = await onSave(prev, formData);
    if (result?.success) toast.success("Saved.");
    else if (result?.error) toast.error(result.error);
    return result;
  };
  const [state, action] = useFormState(saveWithToast, null);
  const fields = [
    ["mortgageInterest", "Mortgage interest (Form 1098)", row.mortgageInterest],
    ["escrowPropertyTax", "Property tax paid from escrow (not already in your expenses)", row.escrowPropertyTax],
    ["escrowInsurance", "Insurance paid from escrow (not already in your expenses)", row.escrowInsurance],
    ["depreciation", "Depreciation (from your tax preparer)", row.depreciation]
  ] as const;
  return <form action={action} className="domus-card space-y-3 p-4">
    <div className="flex flex-wrap items-center gap-2">
      <h3 className="font-semibold text-[var(--ink)]">Tax numbers for {year}: {row.propertyName}</h3>
      {row.needsInputs && <span className="rounded bg-[var(--accent-weak)] px-2 py-1 text-xs text-[var(--accent)]">
        Add Form 1098 interest
      </span>}
    </div>
    <input type="hidden" name="propertyId" value={row.propertyId} />
    <input type="hidden" name="taxYear" value={year} />
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map(([name, label, cents]) => <label key={name} className="text-sm text-[var(--ink-2)]">
        {label}
        <input className="domus-input mt-1 block w-full" name={name} type="text" inputMode="decimal"
          defaultValue={(cents / 100).toFixed(2)} title={label} />
      </label>)}
    </div>
    <p className="text-sm text-[var(--muted)]">Only enter amounts your lender paid. Don&apos;t also add them as expenses.</p>
    {state && <p role="status" className="text-sm text-[var(--ink-2)]">{state.success ? state.message : state.error}</p>}
    <SubmitButton title={`Save tax numbers for ${row.propertyName}.`}>Save</SubmitButton>
  </form>;
}

export function TaxSummaryReport({ data, year, onSave }: TaxSummaryReportProps) {
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
      title="Rental tax summary"
      description="Rental income and deductions by home for your tax preparer."
      rows={data}
      onExport={() => downloadReportCsv(`domus-tax-summary-${new Date().toISOString().slice(0, 10)}.csv`, taxSummaryToCsv(data))}
      defaultSortKey="property"
      columns={[
        { key: "property", label: "Property", sortValue: (row) => row.propertyName, render: (row) => row.propertyName },
        { key: "address", label: "Address", sortValue: (row) => row.propertyAddress, render: (row) => row.propertyAddress || "—" },
        { key: "income", label: "Rental Income", sortValue: (row) => row.totalRentalIncome,
          render: (row) => formatCurrency(row.totalRentalIncome) },
        { key: "expenses", label: "Total Expenses", sortValue: (row) => row.totalExpenses,
          render: (row) => formatCurrency(row.totalExpenses) },
        { key: "net", label: "Net Income", sortValue: (row) => row.netIncome, render: (row) => formatCurrency(row.netIncome) },
        { key: "management", label: "Mgmt Fees", sortValue: (row) => row.managementFees,
          render: (row) => formatCurrency(row.managementFees) },
        { key: "insurance", label: "Insurance", sortValue: (row) => row.insurance, render: (row) => formatCurrency(row.insurance) },
        { key: "taxes", label: "Taxes", sortValue: (row) => row.taxes, render: (row) => formatCurrency(row.taxes) },
        { key: "interest", label: "Mortgage interest", sortValue: (row) => row.mortgageInterest,
          render: (row) => formatCurrency(row.mortgageInterest) },
        { key: "depreciation", label: "Depreciation", sortValue: (row) => row.depreciation,
          render: (row) => formatCurrency(row.depreciation) }
      ]}
      emptyTitle="No tax summary data"
      emptyDescription="Income and expense deductions will appear here once the portfolio has activity."
      footer={
        data.length > 0 ? (
          <div className="space-y-4">
          <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--ink-2)]">
            <span className="font-semibold text-[var(--ink)]">Total Portfolio:</span>{" "}
            Income {formatCurrency(portfolioTotals.income)} · Expenses {formatCurrency(portfolioTotals.expenses)} ·
            Net {formatCurrency(portfolioTotals.net)}
          </div>
          <p>Mortgage payments are cash flow, not a tax deduction. Enter your Form 1098 interest below.</p>
          <p>Domus does not give tax advice. Check numbers with your tax preparer.</p>
          {data.map((row) => <TaxNumbersForm key={row.propertyId} row={row} year={year} onSave={onSave} />)}
          </div>
        ) : null
      }
    />
  );
}
