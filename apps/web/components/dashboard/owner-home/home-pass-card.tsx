import { ChevronRight } from "lucide-react";
import { getNextDueDateForLease } from "@/lib/action-items";
import { formatCurrency } from "@/lib/format";
import type { LeaseListItem, PropertyListItem } from "@/lib/portfolio";

const colors = ["#14532D", "#1E3A8A", "#111214", "#7C2D12"];

export function HomePassCard({ home, leases, isLate, leftCents, index, moneyLoaded, single }: {
  home: PropertyListItem; leases: LeaseListItem[]; isLate: boolean;
  leftCents: number; index: number; moneyLoaded: boolean; single?: boolean;
}) {
  const today = new Date();
  const nextDates = leases.map((lease) => ({ lease, date: getNextDueDateForLease(lease, today) }))
    .filter((item): item is { lease: LeaseListItem; date: Date } => item.date !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const next = nextDates[0];
  const nextAmount = nextDates.filter((item) => item.date.getTime() === next?.date.getTime())
    .reduce((sum, item) => sum + item.lease.monthlyRentCents, 0);
  const names = [...new Set(leases.map((lease) => lease.tenantName || "Tenant"))].join(", ");
  return (
    <a href={`/owner/money?property=${encodeURIComponent(home.id)}`} title={`Open money for ${home.name}`}
      className={`flex min-h-64 snap-start flex-col justify-between p-5 text-white ${single
        ? "min-w-full" : "min-w-[88%] sm:min-w-[calc(50%-0.375rem)]"}`}
      style={{ backgroundColor: colors[index % colors.length], borderRadius: 22, boxShadow: "var(--shadow-lg)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-bold">{home.name}</h2>
          <p className="mt-1 text-sm">{home.city}, {home.state}</p>
        </div>
        <span className="shrink-0 rounded-full border border-white px-2.5 py-1 text-xs font-semibold">
          {isLate ? "Rent late" : "Rented"}
        </span>
      </div>
      <div className="py-5">
        <p className="text-sm">Left after bills this month</p>
        <p className="num mt-1 text-[44px] font-bold leading-none tracking-tight">
          {moneyLoaded ? formatCurrency(leftCents) : "—"}
        </p>
        {!moneyLoaded ? <p className="mt-1 text-xs">Couldn&apos;t load</p> : null}
      </div>
      <div className="flex items-end justify-between gap-3 text-sm">
        <span className="min-w-0 truncate">{names}</span>
        <span className="shrink-0 text-right">{next
          ? `Next rent ${next.date.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              timeZone: "UTC",
            })} · ${formatCurrency(nextAmount)}`
          : "No rent due"}</span>
      </div>
    </a>
  );
}

export function UnleasedHomeRow({ home }: { home: PropertyListItem }) {
  return <a href={`/owner/properties/${encodeURIComponent(home.id)}`}
    title={`Open ${home.name}`} className="domus-card flex min-h-11 items-center gap-3 px-4 py-3 text-[var(--ink)]">
    <span className="min-w-0 flex-1">
      <span className="block truncate font-semibold">{home.name}</span>
      <span className="block truncate text-xs text-[var(--muted)]">{home.ownerAccountName}</span>
    </span>
    <span className="text-sm text-[var(--muted)]">No lease yet</span>
    <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
  </a>;
}
