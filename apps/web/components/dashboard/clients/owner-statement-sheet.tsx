"use client";

import { useEffect, useState } from "react";
import type { ClientDetail } from "@/lib/client-overview";
import { getOwnerStatementSummary } from "@/app/actions/owner-statement";
import { statementMonthLabel } from "@/lib/statement-month";
import { Button } from "@/components/ui/button";
import { ModalOverlay } from "@/components/ui/modal-overlay";
import { MobileDrawer } from "@/components/ui/mobile-drawer";

type Summary = Awaited<ReturnType<typeof getOwnerStatementSummary>>;
interface Props { open: boolean; onClose: () => void; client: ClientDetail;
  defaultMonth: string; monthOptions: string[] }
const money = (cents: number) => `${cents < 0 ? "−" : ""}$${(Math.abs(cents) / 100).toLocaleString("en-US", {
  minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function OwnerStatementSheet({ open, onClose, client, defaultMonth, monthOptions }: Props) {
  const [month, setMonth] = useState(defaultMonth);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia?.("(max-width: 639px)");
    if (!query) return;
    const update = () => setMobile(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!open) return;
    let current = true;
    setLoading(true); setSummary(null);
    getOwnerStatementSummary(client.id, month).then((result) => {
      if (current) setSummary(result);
    }).catch(() => { if (current) setSummary({ success: false, error: "Could not load the statement. Please try again." }); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [open, client.id, month]);
  const params = new URLSearchParams({ accountId: client.id, month }).toString();
  const content = <div className="space-y-5 bg-[var(--surface)] p-5 text-[var(--ink)]">
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-xl font-semibold">Owner statement</h2>
      <Button variant="outline" onClick={onClose} title="Close owner statement">Close</Button>
    </div>
    <p className="text-sm text-[var(--muted)]">{client.name} · {summary?.success ? summary.homeCount : client.homes.length} homes.
      Send this to the owner each month.</p>
    <label className="block space-y-2 text-sm font-medium">Month
      <select value={month} onChange={(event) => setMonth(event.target.value)} title="Choose a month"
        className="domus-input min-h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] p-2">
        {monthOptions.map((item) => <option key={item} value={item}>{statementMonthLabel(item)}</option>)}
      </select>
    </label>
    {loading ? <p role="status">Loading…</p> : summary?.success ? <div className="space-y-2 rounded-xl bg-[var(--surface-2)] p-4">
      {([ ["Payments recorded", summary.totals.paymentsCents], ["Expenses", summary.totals.expensesCents],
        ["Net", summary.totals.netCents], ["Still owed", summary.totals.stillOwedCents] ] as const)
        .map(([label, amount]) => <div key={label} className="flex justify-between gap-4">
          <span>{label}</span><strong className={label === "Still owed" && amount > 0 ? "text-[var(--warn)]" : ""}>{money(amount)}</strong>
        </div>)}
    </div> : summary ? <p role="alert" className="text-[var(--warn)]">{summary.error}</p> : null}
    <div className="grid grid-cols-2 gap-3">
      <a href={`/api/pdf/owner-statement?${params}`} download title="Download owner statement PDF"
        className="flex min-h-11 items-center justify-center rounded-lg bg-[var(--accent)] px-3 text-center text-white">Download PDF</a>
      <a href={`/api/owner-statement/csv?${params}`} download title="Download owner statement CSV"
        className="flex min-h-11 items-center justify-center rounded-lg border border-[var(--line)] px-3 text-center">Download CSV</a>
    </div>
    <p className="text-sm text-[var(--muted)]">Counts payments you marked paid this month.
      Deposits are listed but not counted.</p>
  </div>;
  return mobile ? <MobileDrawer open={open} onOpenChange={(value) => { if (!value) onClose(); }}>{content}</MobileDrawer>
    : <ModalOverlay open={open} onClose={onClose} label="Owner statement">{content}</ModalOverlay>;
}
