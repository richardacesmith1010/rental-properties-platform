import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import type { CashOnHand } from "@/lib/cash-on-hand";

function relativeTime(value: string): string {
  const hours = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 3_600_000));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours} hours ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

export function CashOnHandCard({ accounts, warning }: { accounts: CashOnHand[]; warning?: string }) {
  const visible = accounts.filter((account) => account.hasBalance);
  return <section className="domus-card space-y-4 rounded-2xl p-4" aria-label="Cash on hand">
    <h2 className="text-lg font-semibold">Cash on hand</h2>
    {warning ? <p className="text-sm text-[var(--muted)]">{warning}</p> : visible.length === 0 ? <p className="text-sm text-[var(--muted)]">
      <Link href="/owner/bank" title="Connect a bank" className="underline">
        Connect a bank to see cash on hand.</Link></p> : visible.map((account) =>
      <div key={account.accountId} className="space-y-2 border-t border-[var(--line)] pt-3">
        <h3 className="font-semibold">{account.accountName}</h3>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between gap-2"><dt>{account.complete ? "In the bank" : "In the bank (some accounts)"}</dt>
            <dd className="tabular-nums">{formatCurrency(account.bankCents)}</dd></div>
          <div className="flex justify-between gap-2"><dt>Deposits you&apos;re holding</dt>
            <dd className="tabular-nums">−{formatCurrency(account.depositsHeldCents)}</dd></div>
          {account.complete ? <div className="flex items-end justify-between gap-2 border-t border-[var(--line)] pt-2">
            <dt className="font-semibold">Yours to use</dt>
            <dd className="font-display text-2xl font-semibold tabular-nums">{formatCurrency(account.yoursCents)}</dd>
          </div> : null}
        </dl>
        <p className="text-xs text-[var(--muted)]">Deposit returns are recorded from the lease page.</p>
        {!account.complete ? <Link href="/owner/bank" title="Add a missing bank balance"
          className="block text-sm text-[var(--accent)] underline">
          Add a balance for {account.missingNames.join(", ")} to see Yours to use.</Link> : null}
        {account.stale ? <Link href="/owner/bank" title="Refresh your bank"
          className="block text-sm text-[var(--accent)] underline">
          Last checked over 3 days ago. Refresh your bank.</Link> : account.checkedAt ?
          <p className="text-xs text-[var(--muted)]">Last checked {relativeTime(account.checkedAt)}</p> : null}
      </div>)}
  </section>;
}
