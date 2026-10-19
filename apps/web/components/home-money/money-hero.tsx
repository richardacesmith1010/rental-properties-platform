import { formatCurrency } from "@/lib/format";

export function MoneyHero({ label, totals }: {
  label: string; totals: { inCents: number; outCents: number; leftCents: number };
}) {
  const total = totals.inCents + totals.outCents;
  const width = total > 0 ? (totals.inCents / total) * 100 : 0;
  const color = totals.leftCents > 0 ? "text-[var(--pos)]"
    : totals.leftCents < 0 ? "text-[var(--crit)]" : "text-[var(--ink)]";
  return <section aria-label="Money summary" className="py-3">
    <p className="text-[13px] text-[var(--muted)]">Left after bills · {label}</p>
    <p className={`num mt-1 font-display text-5xl font-semibold leading-tight ${color}`}>
      {formatCurrency(totals.leftCents)}</p>
    <div className="mt-5 h-2.5 overflow-hidden rounded-[1px] bg-[var(--surface-2)]" role="meter"
      aria-label="Money in as a share of money in and out" aria-valuemin={0} aria-valuemax={100} aria-valuenow={width}>
      <div data-testid="money-in-fill" className="h-full rounded-[1px] bg-[var(--pos)]" style={{ width: `${width}%` }} />
    </div>
    <div className="mt-2 flex justify-between gap-3 text-sm font-semibold">
      <span className="num text-[var(--pos)]">In {formatCurrency(totals.inCents)}</span>
      <span className="num text-[var(--ink)]">Out {formatCurrency(totals.outCents)}</span>
    </div>
  </section>;
}
