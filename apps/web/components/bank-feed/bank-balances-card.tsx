"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format";

type Bank = { id: string; nickname: string; source: string; balance_cents: number | null;
  balance_as_of: string | null };

export function BankBalancesCard({ accounts, save }: { accounts: Bank[];
  save: (input: { bankAccountId: string; balanceCents: number }) =>
    Promise<{ success: boolean; error?: string }> }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const uploadAccounts = accounts.filter((bank) => bank.source === "upload");
  async function submit(id: string) {
    if (!/^-?\d+(\.\d{1,2})?$/.test(amount)) { setError("Enter a valid balance."); return; }
    setBusy(true); setError("");
    const result = await save({ bankAccountId: id, balanceCents: Math.round(Number(amount) * 100) });
    if (result.success) { setEditing(null); router.refresh(); }
    else setError(result.error ?? "Could not save the balance.");
    setBusy(false);
  }
  if (!uploadAccounts.length) return null;
  return <section className="domus-card space-y-3 p-4" aria-label="Bank balances">
    {uploadAccounts.map((bank) => <div key={bank.id} className="border-t border-[var(--line)] pt-3">
      <div className="flex items-center justify-between gap-3">
        <div><p className="font-medium">{bank.nickname}</p>
          {bank.balance_cents !== null ? <p className="tabular-nums">{formatCurrency(bank.balance_cents)}</p> : null}
          {bank.balance_as_of ? <p className="text-xs text-[var(--muted)]">
            as of {new Date(bank.balance_as_of).toLocaleDateString("en-US")}</p> : null}</div>
        {bank.source === "upload" ? <button type="button" title="Update balance"
          className="min-h-11 text-[var(--accent)]" onClick={() => {
            setEditing(bank.id); setAmount(bank.balance_cents === null ? "" : String(bank.balance_cents / 100));
          }}>Update balance</button> : null}
      </div>
      {editing === bank.id ? <div className="mt-2 flex gap-2">
        <input type="number" step="0.01" title="Balance" aria-label="Balance" value={amount}
          className="domus-input min-w-0 flex-1" onChange={(event) => setAmount(event.target.value)} />
        <button type="button" title="Save" disabled={busy} onClick={() => void submit(bank.id)}
          className="min-h-11 rounded-md bg-[var(--accent)] px-4 text-[var(--accent-contrast)]">Save</button>
      </div> : null}
    </div>)}
    {error ? <p role="alert" className="text-sm text-[var(--crit)]">{error}</p> : null}
  </section>;
}
