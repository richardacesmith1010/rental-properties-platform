import { KpiCard } from "@/components/shared/kpi-card";
import { formatCurrency } from "@/lib/format";

interface KpiGridProps {
  monthlyGrossRentCents: number;
  occupancy: number;
  occupiedUnits: number;
  totalUnits: number;
  activeLeaseCount: number;
  openMaintenanceCount: number;
  highPriorityMaintenanceCount: number;
  lateRentCents: number;
  lateAccountCount: number;
}

export function KpiGrid({
  monthlyGrossRentCents,
  occupancy,
  occupiedUnits,
  totalUnits,
  activeLeaseCount,
  openMaintenanceCount,
  highPriorityMaintenanceCount,
  lateRentCents,
  lateAccountCount,
}: KpiGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Monthly Gross Rent"
        value={formatCurrency(monthlyGrossRentCents)}
        badge={`${activeLeaseCount} active leases`}
        gradient="linear-gradient(135deg, #6366f1, #8b5cf6)"
      />
      <KpiCard
        label="Occupancy"
        value={`${occupancy}%`}
        badge={`${occupiedUnits} of ${totalUnits} units`}
        gradient="linear-gradient(135deg, #06b6d4, #3b82f6)"
      />
      <KpiCard
        label="Open Maintenance"
        value={String(openMaintenanceCount)}
        badge={`${highPriorityMaintenanceCount} high priority`}
        gradient="linear-gradient(135deg, #f59e0b, #ef4444)"
      />
      <KpiCard
        label="Late Rent"
        value={formatCurrency(lateRentCents)}
        badge={`${lateAccountCount} accounts`}
        gradient="linear-gradient(135deg, #ec4899, #f43f5e)"
        alert
      />
    </div>
  );
}
