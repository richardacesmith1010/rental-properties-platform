import { formatCurrency } from "@/lib/format";

interface RentCollectionBarProps {
  collectedCents: number;
  pendingCents: number;
  overdueCents: number;
}

export function RentCollectionBar({
  collectedCents,
  pendingCents,
  overdueCents
}: RentCollectionBarProps) {
  const totalCents = collectedCents + pendingCents + overdueCents;
  if (totalCents <= 0) {
    return null;
  }

  const collectedPct = (collectedCents / totalCents) * 100;
  const pendingPct = (pendingCents / totalCents) * 100;
  const overduePct = (overdueCents / totalCents) * 100;
  const collectionRate = Math.round(collectedPct);

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-muted-foreground">Rent collection this month</h3>
        <span className="text-lg font-bold text-foreground">{collectionRate}%</span>
      </div>

      <div className="flex h-3 overflow-hidden rounded-full bg-muted">
        {collectedPct > 0 ? (
          <div
            className="bg-emerald-500 transition-all duration-500"
            style={{ width: `${collectedPct}%` }}
          />
        ) : null}
        {pendingPct > 0 ? (
          <div
            className="bg-amber-400 transition-all duration-500"
            style={{ width: `${pendingPct}%` }}
          />
        ) : null}
        {overduePct > 0 ? (
          <div
            className="bg-red-500 transition-all duration-500"
            style={{ width: `${overduePct}%` }}
          />
        ) : null}
      </div>

      <div className="mt-3 flex flex-col gap-1 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-4">
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          <span>Collected {formatCurrency(collectedCents)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span>Pending {formatCurrency(pendingCents)}</span>
        </div>
        {overdueCents > 0 ? (
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
            <span>Overdue {formatCurrency(overdueCents)}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
