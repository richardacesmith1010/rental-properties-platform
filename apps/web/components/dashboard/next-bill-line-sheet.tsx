"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { addNextBillLine } from "@/app/actions/charge-lines";

export function NextBillLineSheet({ leaseId, onClose, onAdd }: {
  leaseId: string; onClose: () => void; onAdd: typeof addNextBillLine;
}) {
  const [kind, setKind] = useState<"utility" | "credit">("utility");
  const [label, setLabel] = useState("Water");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) {
      setError("Enter an amount in dollars and cents.");
      return;
    }
    const [dollars, cents = ""] = amount.split(".");
    const amountCents = Number(dollars) * 100 + Number(cents.padEnd(2, "0"));
    setSaving(true);
    const result = await onAdd({ leaseId, kind, label, amountCents });
    setSaving(false);
    if (!result.ok) { setError(result.error ?? "Could not add this line."); return; }
    onClose();
  }
  return <div role="dialog" aria-modal="true" aria-label="Add to next bill"
    className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
    <div className="w-full max-w-md space-y-4 rounded-t-2xl bg-[var(--surface)] p-5 shadow-xl sm:rounded-2xl">
      <h2 className="font-display text-[18px] font-semibold text-[var(--ink)]">Add to next bill</h2>
      <label className="block space-y-1 text-sm text-[var(--ink)]">Type
        <Select value={kind} onChange={(event) => {
          const next = event.target.value as "utility" | "credit";
          setKind(next); setLabel(next === "utility" ? "Water" : "Credit");
        }}><option value="utility">Water / utilities</option><option value="credit">Credit</option></Select>
      </label>
      <label className="block space-y-1 text-sm text-[var(--ink)]">Label
        <Input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={60} />
      </label>
      <label className="block space-y-1 text-sm text-[var(--ink)]">Amount
        <Input type="text" inputMode="decimal" value={amount}
          onChange={(event) => setAmount(event.target.value)} placeholder="0.00" />
      </label>
      {error && <p role="alert" className="text-sm text-[var(--crit)]">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" title="Close without saving" onClick={onClose}>Cancel</Button>
        <Button type="button" title="Add this line to the next bill" disabled={saving} onClick={save}>
          {saving ? "Adding…" : "Add to next bill"}</Button>
      </div>
    </div>
  </div>;
}
