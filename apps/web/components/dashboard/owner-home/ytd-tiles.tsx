import { denverYear } from "@/lib/denver-calendar";
import { formatCurrency } from "@/lib/format";

export function YtdTiles({ incomeCents, expensesCents, selectedPropertyId, year = denverYear(),
  expensesReady = true, expensesFailed = false }: {
  incomeCents: number | null; expensesCents: number; selectedPropertyId?: string | null; year?: number;
  expensesReady?: boolean; expensesFailed?: boolean;
}) {
  const href = `/owner/money?month=year${selectedPropertyId ? `&property=${encodeURIComponent(selectedPropertyId)}` : ""}`;
  const net = incomeCents === null || !expensesReady ? null : incomeCents - expensesCents;
  return <div className="grid grid-cols-2 gap-3">
    <a href={href} title={`Open ${year} money`} className="domus-card flex min-h-28 flex-col justify-between rounded-2xl p-4">
      <span className="text-sm text-[var(--muted)]">{year} so far</span>
      <span className={`num font-display text-2xl font-semibold ${net === null ? "text-[var(--ink)]"
        : net < 0 ? "text-[var(--crit)]" : net > 0 ? "text-[var(--pos)]" : "text-[var(--ink)]"}`}>
        {net === null ? "—" : formatCurrency(net)}</span>
      {net === null ? <span className="text-xs text-[var(--muted)]">
        {incomeCents === null || expensesFailed ? "Couldn't load" : "Loading..."}</span> : null}
    </a>
    <a href={href} title="Open rent collected this year" className="domus-card flex min-h-28 flex-col justify-between rounded-2xl p-4">
      <span className="text-sm text-[var(--muted)]">Rent collected</span>
      <span className="num font-display text-2xl font-semibold text-[var(--ink)]">
        {incomeCents === null ? "—" : formatCurrency(incomeCents)}</span>
      {incomeCents === null ? <span className="text-xs text-[var(--muted)]">Couldn&apos;t load</span> : null}
    </a>
  </div>;
}
