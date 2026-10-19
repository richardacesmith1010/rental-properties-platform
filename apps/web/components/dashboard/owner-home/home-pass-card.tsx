import { ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import type { WalletHomeEntry } from "@/lib/owner-wallet-home";
import { Badge } from "@/components/ui/badge";

export function HomePassCard({ home, single, showAccount = false }: {
  home: WalletHomeEntry; index: number; single?: boolean; showAccount?: boolean;
}) {
  const nextDates = home.activeLeases.filter((lease) => lease.nextDueDate)
    .sort((a, b) => (a.nextDueDate ?? "").localeCompare(b.nextDueDate ?? ""));
  const next = nextDates[0];
  const nextAmount = nextDates.filter((item) => item.nextDueDate === next?.nextDueDate)
    .reduce((sum, item) => sum + item.rentCents, 0);
  const names = [...new Set(home.activeLeases.flatMap((lease) => lease.tenantNames))].join(", ");
  const invitePending = home.activeLeases.some((lease) => lease.invitePending);
  return (
    <a href={`/owner/money?property=${encodeURIComponent(home.id)}`} title={`Open money for ${home.name}`}
      className={`flex min-h-64 snap-start flex-col justify-between rounded-[var(--radius-pass)] border
        border-[var(--line)] bg-[var(--hero)] p-5 text-[var(--hero-ink)] ${single
        ? "min-w-full" : "min-w-[88%] sm:min-w-[calc(50%-0.375rem)]"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-display text-xl font-semibold">{home.name}</h2>
          <p className="mt-1 text-sm text-[var(--hero-muted)]">
            {home.city}, {home.state}{showAccount ? ` · ${home.accountName}` : ""}</p>
        </div>
        <Badge variant={home.isLate ? "warning" : "outline"} className={`shrink-0 bg-transparent
          ${home.isLate ? "border-[var(--warn-line)] text-[#F3C97A]" :
            "border-[var(--hero-line)] text-[var(--hero-muted)]"}`}>
          {home.isLate ? "Rent late" : "Rented"}
        </Badge>
      </div>
      <div className="py-5">
        <p className="text-sm text-[var(--hero-muted)]">Left after bills this month</p>
        <p className="num mt-1 font-display text-[44px] font-semibold leading-none">
          {formatCurrency(home.leftCents)}
        </p>
      </div>
      <div className="flex items-end justify-between gap-3 border-t border-[var(--hero-line)] pt-0 text-sm
        text-[var(--hero-muted)]">
        <span className="flex min-w-0 items-center gap-1">
          <span className="min-w-0 truncate">{names}</span>
          {invitePending ? <span className="shrink-0">· Invite sent</span> : null}
        </span>
        <span className="shrink-0 text-right">{next
          ? `Next rent ${new Date(`${next.nextDueDate}T00:00:00Z`).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              timeZone: "UTC",
            })} · ${formatCurrency(nextAmount)}`
          : "No rent due"}</span>
      </div>
    </a>
  );
}

export function UnleasedHomeRow({ home, showAccount = false }: { home: WalletHomeEntry; showAccount?: boolean }) {
  return <a href={`/owner/properties/${encodeURIComponent(home.id)}`}
    title={`Open ${home.name}`} className="domus-card flex min-h-11 items-center gap-3 px-4 py-3 text-[var(--ink)]">
    <span className="min-w-0 flex-1">
      <span className="block truncate font-semibold">{home.name}</span>
      <span className="block truncate text-xs text-[var(--muted)]">
        {home.city}, {home.state}{showAccount ? ` · ${home.accountName}` : ""}
      </span>
    </span>
    <span className="text-sm text-[var(--muted)]">No lease yet</span>
    <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
  </a>;
}
