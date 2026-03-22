import { formatCurrency } from "@/lib/format";

interface CompactHeaderProps {
  title: string;
  monthlyRevenueCents: number;
  occupancy: number;
  openTickets: number;
  overdueCharges: number;
}

export function CompactHeader({
  title,
  monthlyRevenueCents,
  occupancy,
  openTickets,
  overdueCharges
}: CompactHeaderProps) {
  const stats = [
    `${formatCurrency(monthlyRevenueCents)} rev`,
    `${occupancy}% occ`,
    `${openTickets} tickets`,
    `${overdueCharges} due`
  ];

  return (
    <div className="flex min-h-[44px] items-center justify-between gap-4 rounded-2xl border border-border/70 bg-card/70 px-4 py-2 shadow-sm backdrop-blur-sm">
      <span className="truncate text-sm font-semibold text-foreground">{title}</span>
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {stats.map((stat) => (
          <span key={stat}>{stat}</span>
        ))}
      </div>
    </div>
  );
}
