"use client";

import { useState } from "react";
import type { Partner } from "@/lib/partners";
import type { addPartnerPayment } from "@/app/actions/partners";

const kindLabels = { reimbursement: "Paid back", manager_fee: "Manager fee", settle_up: "Settle up", other: "Other" } as const;
export function PartnerPaymentSheet({ accountId, partners, onClose, onSave }: {
  accountId: string; partners: Partner[]; onClose: () => void; onSave: typeof addPartnerPayment
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [kind, setKind] = useState<keyof typeof kindLabels>("reimbursement");
  const [status, setStatus] = useState<"done" | "planned">("done");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const choices = partners.filter((partner) => partner.active);
  async function save() {
    setError("");
    if (from === to) { setError("Pick two different payment endpoints."); return; }
    setPending(true);
    const result = await onSave({ accountId, fromPartnerId: from || null, toPartnerId: to || null,
      amountCents: Math.round(Number(amount) * 100), paidOn: date, kind, status, note: note || null });
    setPending(false);
    if (!result.ok) { setError(result.error); return; }
    onClose();
  }
  return <div role="dialog" aria-modal="true" aria-label="Add a payment" className="domus-card space-y-3 rounded-2xl p-4">
    <h3 className="text-lg font-semibold">Add a payment</h3>
    {[["From", from, setFrom], ["To", to, setTo]].map(([label, value, setter]) =>
      <label key={label as string} className="block text-sm font-medium">{label as string}
        <select className="domus-input mt-1 min-h-11 w-full" value={value as string}
          onChange={(event) => (setter as (value: string) => void)(event.target.value)}>
          <option value="">The LLC</option>
          {choices.map((partner) => <option key={partner.id} value={partner.id}>{partner.displayName}</option>)}
        </select>
      </label>)}
    <label className="block text-sm font-medium">Amount
      <input className="domus-input mt-1 min-h-11 w-full num" type="number" min="0.01" step="0.01" value={amount}
        onChange={(event) => setAmount(event.target.value)} /></label>
    <label className="block text-sm font-medium">Date
      <input className="domus-input mt-1 min-h-11 w-full" type="date" value={date}
        onChange={(event) => setDate(event.target.value)} /></label>
    <label className="block text-sm font-medium">Kind
      <select className="domus-input mt-1 min-h-11 w-full" value={kind}
        onChange={(event) => setKind(event.target.value as keyof typeof kindLabels)}>
        {Object.entries(kindLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
    <fieldset><legend className="text-sm font-medium">Status</legend><div className="flex gap-4">
      {(["done", "planned"] as const).map((value) => <label key={value} className="flex min-h-11 items-center gap-2">
        <input type="radio" checked={status === value} onChange={() => setStatus(value)} />
        {value === "done" ? "Done" : "Planned"}</label>)}
    </div></fieldset>
    <label className="block text-sm font-medium">Note
      <input className="domus-input mt-1 min-h-11 w-full" maxLength={200} value={note}
        onChange={(event) => setNote(event.target.value)} /></label>
    {error && <p role="alert" className="text-sm text-[var(--crit)]">{error}</p>}
    <div className="flex gap-2"><button className="domus-card min-h-11 rounded-xl px-4" type="button" title="Close payment"
      onClick={onClose}>Cancel</button>
      <button className="min-h-11 rounded-xl bg-[var(--action)] hover:bg-[var(--action-strong)] px-4
        text-[var(--action-contrast)]" type="button"
        title="Save payment" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save"}</button></div>
  </div>;
}
