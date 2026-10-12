"use client";

import Link from "next/link";
import { useState } from "react";
import { formatCurrency } from "@/lib/format";
import type { PartnerReport, PartnerLine } from "@/lib/partners";
import type { addPartner, renamePartner, deactivatePartner, addPartnerPayment,
  updatePartnerPayment, deletePartnerPayment } from "@/app/actions/partners";
import { ManagePartnersSheet } from "./manage-partners-sheet";
import { PartnerPaymentSheet } from "./partner-payment-sheet";

const kinds = [
  ["cleaningRepairs", "Cleaning & repairs"], ["improvements", "Improvements"],
  ["mortgage", "Mortgage"], ["utilities", "Utilities"], ["other", "Other"]
] as const;
function PartnerRow({ row }: { row: PartnerLine }) {
  const [open, setOpen] = useState(false);
  return <div className="border-b border-[var(--line)] last:border-0">
    <button type="button" title={`Show what ${row.name} put in`} aria-expanded={open}
      onClick={() => setOpen(!open)} className="flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left">
      <span className="font-medium">{row.name}</span>
      <span className="num text-right"><span className="text-sm text-[var(--muted)]">Put in </span>
        {formatCurrency(row.putInCents)} · {row.sharePct}%</span>
    </button>
    {open && <dl className="space-y-1 pb-3 text-sm text-[var(--muted)]">
      {kinds.map(([key, label]) => <div key={key} className="flex justify-between"><dt>{label}</dt>
        <dd className="num">{formatCurrency(row.paidByKind[key])}</dd></div>)}
      <div className="flex justify-between"><dt>Payments in</dt><dd className="num">{formatCurrency(row.paymentsInCents)}</dd></div>
      <div className="flex justify-between"><dt>Payments out</dt><dd className="num">{formatCurrency(row.paymentsOutCents)}</dd></div>
    </dl>}
  </div>;
}
export function PartnersCard({ accountId, report, period, allTimeHref, periodHref,
  onAddPartner, onRenamePartner, onDeactivatePartner, onAddPayment, onUpdatePayment, onDeletePayment }: {
  accountId: string; report: PartnerReport; period: string; allTimeHref: string; periodHref: string;
  onAddPartner: typeof addPartner; onRenamePartner: typeof renamePartner;
  onDeactivatePartner: typeof deactivatePartner; onAddPayment: typeof addPartnerPayment;
  onUpdatePayment: typeof updatePartnerPayment; onDeletePayment: typeof deletePartnerPayment
}) {
  const [sheet, setSheet] = useState<"payment" | "partners" | null>(null);
  const [error, setError] = useState("");
  return <section className="domus-card space-y-3 rounded-2xl p-4" aria-label="Partners">
    <div className="flex items-start justify-between gap-2"><div><h2 className="text-lg font-semibold">Partners</h2>
      <p className="text-sm text-[var(--muted)]">Who put in what · {period}</p></div>
      <Link href={period === "All time" ? periodHref : allTimeHref} title="Show partner totals for all time"
        className="min-h-11 rounded-full px-3 py-2 text-sm text-[var(--accent)]">
        {period === "All time" ? "This period" : "All time"}</Link></div>
    <div>{report.rows.map((row) => <PartnerRow key={row.id ?? "llc"} row={row} />)}</div>
    {report.hasPlanned && <div className="rounded-xl bg-[var(--surface-2)] p-3 text-sm text-[var(--muted)]">
      <p className="font-medium">If planned payments go through:</p>
      {report.rows.map((row) => <div key={row.id ?? "llc"} className="flex justify-between gap-2 py-1">
        <span>{row.name}</span><span className="num">{formatCurrency(row.projectedPutIn)} · {row.projectedSharePct}%</span>
      </div>)}</div>}
    {report.payments.length > 0 && <div className="space-y-2 border-t border-[var(--line)] pt-2">
      {report.payments.map((payment) => <div key={payment.id}
        className="flex min-h-11 items-center justify-between gap-2 text-sm">
        <span>{payment.status === "planned" ? "Planned" : "Done"} · {payment.paidOn}<br />
          {report.partners.find((partner) => partner.id === payment.fromPartnerId)?.displayName ?? "The LLC"}
          {" → "}{report.partners.find((partner) => partner.id === payment.toPartnerId)?.displayName ?? "The LLC"}
          {" · "}<span className="num">{formatCurrency(payment.amountCents)}</span>
          {" · "}{({ reimbursement: "Paid back", manager_fee: "Manager fee",
            settle_up: "Settle up", other: "Other" } as const)[payment.kind]}
          {payment.note ? ` · ${payment.note}` : ""}</span>
        <span className="flex gap-2">
          {payment.status === "planned" && <button type="button" className="min-h-11 px-2" title="Mark payment done"
            onClick={async () => {
              const result = await onUpdatePayment({ ...payment, accountId, status: "done" });
              if (!result.ok) setError(result.error);
            }}>Done</button>}
          <button type="button" className="min-h-11 px-2" title="Remove payment"
            onClick={async () => {
              const result = await onDeletePayment(accountId, payment.id);
              if (!result.ok) setError(result.error);
            }}>Remove</button>
        </span>
      </div>)}</div>}
    {error && <p role="alert" className="text-sm text-[var(--crit)]">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <button className="min-h-11 rounded-xl bg-[var(--accent)] px-4 text-[var(--accent-contrast)]"
        type="button" title="Add a payment" onClick={() => setSheet("payment")}>Add a payment</button>
      <button className="domus-card min-h-11 rounded-xl px-4" type="button" title="Manage partners"
        onClick={() => setSheet("partners")}>Manage partners</button>
    </div>
    {sheet === "payment" && <PartnerPaymentSheet accountId={accountId} partners={report.partners}
      onClose={() => setSheet(null)} onSave={onAddPayment} />}
    {sheet === "partners" && <ManagePartnersSheet accountId={accountId} partners={report.partners}
      onClose={() => setSheet(null)} onAdd={onAddPartner} onRename={onRenamePartner} onDeactivate={onDeactivatePartner} />}
  </section>;
}
