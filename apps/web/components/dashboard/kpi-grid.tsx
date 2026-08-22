import { KpiCard } from "@/components/shared/kpi-card";
import type { DashboardKpis } from "@/lib/dashboard";
import { formatCurrency, pluralize } from "@/lib/format";

interface KpiGridProps {
  kpis: DashboardKpis;
  occupancy: number;
  netCashFlowCents: number;
  revenueTrend?: "up" | "down" | "flat" | null;
  occupancyTrend?: "up" | "down" | "flat" | null;
  collectionTrend?: "up" | "down" | "flat" | null;
  maintenanceTrend?: "up" | "down" | "flat" | null;
  cashFlowTrend?: "up" | "down" | "flat" | null;
}

function occupancyAccent(occupancy: number) {
  if (occupancy >= 90) {
    return "var(--pos-bg)";
  }
  if (occupancy >= 70) {
    return "var(--warn-bg)";
  }
  return "var(--crit-bg)";
}

export function KpiGrid({
  kpis,
  occupancy,
  netCashFlowCents,
  revenueTrend = null,
  occupancyTrend = null,
  collectionTrend = null,
  maintenanceTrend = null,
  cashFlowTrend = null
}: KpiGridProps) {
  const totalDueCents = kpis.collectedRentCents + kpis.pendingRentCents + kpis.overdueRentCents;
  const outstandingSubtitleCount = `${kpis.outstandingAccountCount} account${
    kpis.outstandingAccountCount === 1 ? "" : "s"
  }`;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <KpiCard
        title="Monthly Revenue"
        value={formatCurrency(kpis.monthlyGrossRentCents)}
        subtitle={`${kpis.activeLeaseCount} active lease${kpis.activeLeaseCount === 1 ? "" : "s"}`}
        gradient="var(--accent-weak)"
        trend={revenueTrend}
        ariaLabel={`Monthly Revenue: ${formatCurrency(kpis.monthlyGrossRentCents)}. ${kpis.activeLeaseCount} active lease${kpis.activeLeaseCount === 1 ? "" : "s"}.`}
      />
      <KpiCard
        title="Occupancy"
        value={`${occupancy}%`}
        subtitle={`${kpis.occupiedUnits}/${kpis.totalUnits} ${kpis.totalUnits === 1 ? "unit" : "units"}`}
        gradient={occupancyAccent(occupancy)}
        trend={occupancyTrend}
        ariaLabel={`Occupancy: ${occupancy}%. ${kpis.occupiedUnits} of ${pluralize(kpis.totalUnits, "unit")} occupied.`}
      />
      <KpiCard
        title="Rent Collection"
        value={`${Math.round(kpis.collectionRate)}%`}
        subtitle={`${formatCurrency(kpis.collectedRentCents)} of ${formatCurrency(totalDueCents)}`}
        gradient="var(--accent-weak)"
        trend={collectionTrend}
        ariaLabel={`Rent Collection: ${Math.round(kpis.collectionRate)}%. ${formatCurrency(kpis.collectedRentCents)} collected out of ${formatCurrency(totalDueCents)} due.`}
      />
      <KpiCard
        title="Outstanding"
        value={formatCurrency(kpis.outstandingCents)}
        subtitle={outstandingSubtitleCount}
        gradient={
          kpis.outstandingCents > 0
            ? "var(--warn-bg)"
            : "var(--pos-bg)"
        }
        alert={kpis.outstandingCents > 0}
        ariaLabel={`Outstanding Balance: ${formatCurrency(kpis.outstandingCents)} across ${outstandingSubtitleCount}.`}
      />
      <KpiCard
        title="Open Tickets"
        value={String(kpis.openMaintenanceCount)}
        subtitle={
          kpis.highPriorityMaintenanceCount > 0
            ? `${kpis.highPriorityMaintenanceCount} high priority`
            : "No urgent issues"
        }
        gradient="var(--warn-bg)"
        trend={maintenanceTrend}
        ariaLabel={`Open Tickets: ${kpis.openMaintenanceCount}. ${kpis.highPriorityMaintenanceCount > 0 ? `${kpis.highPriorityMaintenanceCount} high priority.` : "No urgent issues."}`}
      />
      <KpiCard
        title="Net Cash Flow"
        value={formatCurrency(Math.abs(netCashFlowCents))}
        subtitle={netCashFlowCents >= 0 ? "YTD Profit" : "YTD Loss"}
        gradient={
          netCashFlowCents >= 0
            ? "var(--pos-bg)"
            : "var(--crit-bg)"
        }
        trend={cashFlowTrend}
        prefix={netCashFlowCents < 0 ? "-" : "+"}
        ariaLabel={`Net Cash Flow: ${netCashFlowCents < 0 ? "negative " : ""}${formatCurrency(Math.abs(netCashFlowCents))}. ${netCashFlowCents >= 0 ? "Year to date profit." : "Year to date loss."}`}
      />
    </div>
  );
}
