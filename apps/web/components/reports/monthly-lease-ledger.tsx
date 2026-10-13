import type { MonthlyLeaseLedger } from "@/lib/reports-ledger";
import { formatCurrency } from "@/lib/format";

const dateLabel = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", {
  month: "short", day: "numeric", year: "numeric", timeZone: "UTC"
});
const monthLabel = (value: string) => new Date(`${value}-01T00:00:00Z`).toLocaleDateString("en-US", {
  month: "short", year: "numeric", timeZone: "UTC"
});

export function MonthlyLeaseLedgerCard({ data }: { data: MonthlyLeaseLedger }) {
  const { lease, months, totals } = data;
  return <section className="domus-card space-y-4 p-4 sm:p-5" aria-label="Rent & water by month">
    <div>
      <h2 className="text-lg font-semibold text-[var(--ink)]">Rent &amp; water by month</h2>
      <p className="text-sm text-[var(--muted)]">Lease {dateLabel(lease.startDate)} – {dateLabel(lease.endDate)}
        {" · "}{formatCurrency(lease.monthlyRentCents)}/mo</p>
    </div>
    <div className="space-y-2 sm:hidden">
      {months.map((row) => <div key={row.month} className={`rounded-xl border p-3 ${row.short
        ? "border-[var(--warn)] bg-[var(--warn-bg)]" : "border-[var(--line)] bg-[var(--surface-2)]"}`}>
        <div className="flex justify-between font-medium text-[var(--ink)]">
          <span>{monthLabel(row.month)}</span><span>{formatCurrency(row.balanceCents)}</span>
        </div>
        <p className="mt-1 text-xs text-[var(--muted)]">Rent {formatCurrency(row.rentCents)} · Water {
          formatCurrency(row.utilityCents)} · Credits {formatCurrency(row.creditCents)}</p>
        <p className="text-xs text-[var(--muted)]">Paid {formatCurrency(row.paidCents)}</p>
        {row.short && <p className="text-xs font-semibold text-[var(--warn)]">Short {
          formatCurrency(row.owedCents - row.paidCents)}</p>}
      </div>)}
    </div>
    <div className="hidden overflow-x-auto sm:block">
      <table className="w-full text-left text-sm text-[var(--ink)]">
        <thead><tr className="border-b border-[var(--line)] text-[var(--muted)]">
          {(["Month", "Rent", "Water", "Credits", "Paid", "Balance"] as const)
            .map((label) => <th key={label} scope="col" className="px-2 py-2 font-medium">{label}</th>)}
        </tr></thead>
        <tbody>{months.map((row) => <tr key={row.month} className={row.short
          ? "bg-[var(--warn-bg)]" : "border-b border-[var(--line)]"}>
          <th scope="row" className="px-2 py-2 font-medium">{monthLabel(row.month)}
            {row.short && <span className="ml-2 text-xs text-[var(--warn)]">Short {
              formatCurrency(row.owedCents - row.paidCents)}</span>}</th>
          {[row.rentCents, row.utilityCents, row.creditCents, row.paidCents, row.balanceCents]
            .map((value, index) => <td key={index} className="px-2 py-2 tabular-nums">{formatCurrency(value)}</td>)}
        </tr>)}</tbody>
        <tfoot><tr className="border-t border-[var(--line)] font-semibold">
          <th scope="row" className="px-2 py-2">Total</th>
          {[totals.rentCents, totals.utilityCents, totals.creditCents, totals.paidCents, totals.balanceCents]
            .map((value, index) => <td key={index} className="px-2 py-2 tabular-nums">{formatCurrency(value)}</td>)}
        </tr></tfoot>
      </table>
    </div>
  </section>;
}
