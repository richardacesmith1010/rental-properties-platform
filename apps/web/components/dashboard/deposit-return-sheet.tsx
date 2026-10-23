"use client";

import { todayDenver } from "@/lib/denver-calendar";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format";
import type { DepositReturn } from "@/lib/deposits";

type Result = { ok: boolean; error?: string };
export type RecordReturn = (input: { leaseId: string; returnedCents: number; returnedOn: string }) => Promise<Result>;
export type ClearReturn = (leaseId: string) => Promise<Result>;

export function DepositReturnSheet({ leaseId, depositCents, recorded, onRecord, onClear }: {
  leaseId: string; depositCents: number; recorded: DepositReturn | null;
  onRecord?: RecordReturn; onClear?: ClearReturn;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(depositCents / 100));
  const [date, setDate] = useState(todayDenver());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!onRecord || !/^\d+(\.\d{1,2})?$/.test(amount)) { setError("Enter a valid amount and date."); return; }
    setBusy(true); setError("");
    const result = await onRecord({ leaseId, returnedCents: Math.round(Number(amount) * 100), returnedOn: date });
    if (result.ok) { setOpen(false); router.refresh(); }
    else setError(result.error ?? "Could not record the deposit return.");
    setBusy(false);
  }
  async function undo() {
    if (!onClear) return;
    setBusy(true); setError("");
    const result = await onClear(leaseId);
    if (result.ok) router.refresh();
    else setError(result.error ?? "Could not undo the deposit return.");
    setBusy(false);
  }
  return <div className="sm:col-span-3">
    {recorded ? <div className="flex flex-wrap items-center gap-3">
      <p>Deposit returned {formatCurrency(recorded.returned_cents)} on {
        new Date(`${recorded.returned_on}T00:00:00Z`).toLocaleDateString("en-US", {
          month: "short", day: "numeric", year: "numeric", timeZone: "UTC"
        })} · Kept {formatCurrency(depositCents - recorded.returned_cents)}</p>
      <button type="button" title="Undo" disabled={busy} onClick={() => void undo()}
        className="min-h-11 text-[var(--accent)]">Undo</button>
    </div> : <div className="flex flex-wrap items-center gap-3">
      <p>Deposit {formatCurrency(depositCents)} · You&apos;re holding it</p>
      <button type="button" title="Record deposit returned" onClick={() => setOpen(true)}
        className="min-h-11 text-[var(--accent)]">Record deposit returned</button>
    </div>}
    {open ? <div role="dialog" aria-modal="true" aria-label="Record deposit returned"
      className="fixed inset-0 z-50 flex items-end bg-black/50 p-3 sm:items-center sm:justify-center">
      <div className="domus-card w-full space-y-3 rounded-2xl p-5 sm:max-w-md">
      <label className="block text-sm">Amount returned
        <input className="domus-input mt-1 w-full" title="Amount returned" type="number" min="0" step="0.01"
          value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
      <label className="block text-sm">Date
        <input className="domus-input mt-1 w-full" title="Return date" type="date" max={todayDenver()}
          value={date} onChange={(event) => setDate(event.target.value)} /></label>
      <button type="button" title="Save" disabled={busy} onClick={() => void save()}
        className="min-h-11 rounded-md bg-[var(--action)] px-4 text-[var(--action-contrast)]">Save</button>
      <button type="button" title="Cancel" onClick={() => setOpen(false)}
        className="min-h-11 px-4 text-[var(--muted)]">Cancel</button>
      </div>
    </div> : null}
    {error ? <p role="alert" className="text-sm text-[var(--crit)]">{error}</p> : null}
  </div>;
}
