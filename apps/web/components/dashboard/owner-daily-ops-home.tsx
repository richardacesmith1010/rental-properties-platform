"use client";

import { FinancialOverviewPanel } from "@/components/dashboard/financial-overview-panel";
import { GamificationSummary } from "@/components/gamification/gamification-summary";
import { KpiGrid } from "@/components/dashboard/kpi-grid";
import { RentCollectionBar } from "@/components/dashboard/rent-collection-bar";
import type { DashboardData } from "@/lib/dashboard";
import type { StatefulAction } from "./types";

interface OwnerDailyOpsHomeProps {
  kpis: DashboardData["kpis"];
  occupancy: number;
  totalXp: number;
  currentLevel: number;
  streakCount: number;
  modeLabel: string;
  modeDescription: string;
  financialOverview: {
    accountId: string | null;
    plaidConnected: boolean;
    bankName: string | null;
    bankMask: string | null;
    balanceCents: number | null;
    balanceUpdatedAt: string | null;
    monthlyCollectedCents: number;
    monthlyOutstandingCents: number;
    monthlyExpensesCents: number;
    netIncomeCents: number;
    ytdIncomeCents: number;
    ytdExpensesCents: number;
    collectionRate: number;
  };
  onInitiatePlaidLink?: StatefulAction;
  onCompletePlaidLink?: StatefulAction;
  onRefreshPlaidBalance?: StatefulAction;
  onDisconnectPlaid?: StatefulAction;
}

export function OwnerDailyOpsHome({
  kpis,
  occupancy,
  totalXp,
  currentLevel,
  streakCount,
  modeLabel,
  modeDescription,
  financialOverview,
  onInitiatePlaidLink,
  onCompletePlaidLink,
  onRefreshPlaidBalance,
  onDisconnectPlaid
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
      <FinancialOverviewPanel
        accountId={financialOverview.accountId}
        plaidConnected={financialOverview.plaidConnected}
        bankName={financialOverview.bankName}
        bankMask={financialOverview.bankMask}
        balanceCents={financialOverview.balanceCents}
        balanceUpdatedAt={financialOverview.balanceUpdatedAt}
        monthlyCollectedCents={financialOverview.monthlyCollectedCents}
        monthlyOutstandingCents={financialOverview.monthlyOutstandingCents}
        monthlyExpensesCents={financialOverview.monthlyExpensesCents}
        netIncomeCents={financialOverview.netIncomeCents}
        ytdIncomeCents={financialOverview.ytdIncomeCents}
        ytdExpensesCents={financialOverview.ytdExpensesCents}
        collectionRate={financialOverview.collectionRate}
        onInitiatePlaidLink={onInitiatePlaidLink}
        onCompletePlaidLink={onCompletePlaidLink}
        onRefreshPlaidBalance={onRefreshPlaidBalance}
        onDisconnectPlaid={onDisconnectPlaid}
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
