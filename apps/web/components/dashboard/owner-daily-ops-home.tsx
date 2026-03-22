"use client";

import { GamificationSummary } from "@/components/gamification/gamification-summary";
import { KpiGrid } from "@/components/dashboard/kpi-grid";
import { RentCollectionBar } from "@/components/dashboard/rent-collection-bar";
import type { DashboardData } from "@/lib/dashboard";

interface OwnerDailyOpsHomeProps {
  kpis: DashboardData["kpis"];
  occupancy: number;
  totalXp: number;
  currentLevel: number;
  streakCount: number;
  modeLabel: string;
  modeDescription: string;
}

export function OwnerDailyOpsHome({
  kpis,
  occupancy,
  totalXp,
  currentLevel,
  streakCount,
  modeLabel,
  modeDescription
}: OwnerDailyOpsHomeProps) {
  return (
    <div className="flex min-h-full flex-col gap-4 py-1">
      <KpiGrid
        kpis={kpis}
        occupancy={occupancy}
        netCashFlowCents={kpis.netCashFlowCents}
      />
      <RentCollectionBar
        collectedCents={kpis.collectedRentCents}
        pendingCents={kpis.pendingRentCents}
        overdueCents={kpis.overdueRentCents}
      />
      <GamificationSummary
        totalXp={totalXp}
        currentLevel={currentLevel}
        streakCount={streakCount}
        role="owner"
      />
      <div className="domus-glass flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold text-foreground">{modeLabel}</p>
        <p className="text-sm text-muted-foreground">{modeDescription}</p>
      </div>
    </div>
  );
}
