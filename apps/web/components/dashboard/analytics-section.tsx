"use client";

import type { ReactNode } from "react";
import type { AnalyticsDashboardData } from "@/lib/analytics";
import { formatAverageDaysToPayment } from "@/lib/analytics";
import { formatCurrency } from "@/lib/format";
import { exportChargesCSV, exportExpensesCSV } from "@/lib/csv-export";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { RentCollectionChart } from "./charts/rent-collection-chart";
import { ExpenseBreakdownChart } from "./charts/expense-breakdown-chart";
import { OccupancyChart } from "./charts/occupancy-chart";
import { MaintenanceChart } from "./charts/maintenance-chart";

interface AnalyticsSectionProps {
  data: AnalyticsDashboardData;
}

function KpiMiniCard({
  label,
  value,
  positive
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="domus-card p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
        {label}
      </p>
      <p
        className={`tabular-nums mt-3 text-[25px] font-[660] tracking-[-0.025em] ${
          positive === false
            ? "text-[var(--crit)]"
            : positive === true
              ? "text-[var(--pos)]"
              : "text-[var(--ink)]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ChartCard({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="domus-card p-5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
        Analytics
      </p>
      <h3 className="mt-1 text-base font-semibold text-[var(--ink)]">{title}</h3>
      <p className="text-sm text-[var(--muted)]">{description}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function AnalyticsSection({ data }: AnalyticsSectionProps) {
  const hasAnalyticsValues =
    data.summaryKpis.collectionRate > 0 ||
    data.summaryKpis.avgDaysToPayment > 0 ||
    data.summaryKpis.totalIncomeCentsYtd > 0 ||
    data.summaryKpis.totalExpenseCentsYtd > 0 ||
    data.summaryKpis.netIncomeCentsYtd > 0 ||
    data.summaryKpis.maintenanceCostCentsYtd > 0 ||
    data.rentMetrics.some((metric) => metric.dueCents > 0 || metric.collectedCents > 0 || metric.lateCents > 0) ||
    data.expenseCategories.some((category) => category.totalCents > 0) ||
    data.occupancyMetrics.some((metric) => metric.occupiedUnits > 0 || metric.totalUnits > 0) ||
    data.maintenanceMetrics.some(
      (metric) => metric.totalTickets > 0 || metric.resolvedTickets > 0 || metric.avgResolutionDays > 0
    );

  if (!data.enabled) {
    return <EmptyState message="Analytics become available after you have live portfolio activity to measure." showDom />;
  }

  if (!hasAnalyticsValues) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          title="No analytics data yet"
          description="Analytics will populate as charges and payments are recorded."
          className="max-w-xl"
          domMood="thinking"
          domSize="lg"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <KpiMiniCard label="Collection Rate" value={`${data.summaryKpis.collectionRate.toFixed(0)}%`} positive={data.summaryKpis.collectionRate >= 95} />
        <KpiMiniCard
          label="Avg Days to Pay"
          value={formatAverageDaysToPayment(data.summaryKpis.avgDaysToPayment)}
          positive={data.summaryKpis.avgDaysToPayment > 0 ? data.summaryKpis.avgDaysToPayment <= 3 : undefined}
        />
        <KpiMiniCard label="YTD Income" value={formatCurrency(data.summaryKpis.totalIncomeCentsYtd)} positive />
        <KpiMiniCard label="YTD Expenses" value={formatCurrency(data.summaryKpis.totalExpenseCentsYtd)} />
        <KpiMiniCard
          label="YTD Net"
          value={formatCurrency(data.summaryKpis.netIncomeCentsYtd)}
          positive={data.summaryKpis.netIncomeCentsYtd >= 0}
        />
        <KpiMiniCard label="Maintenance Costs" value={formatCurrency(data.summaryKpis.maintenanceCostCentsYtd)} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Rent Collection" description="Monthly rent due vs collected (12 months)">
          <RentCollectionChart metrics={data.rentMetrics} />
        </ChartCard>

        <ChartCard title="Expense Breakdown" description="Spending by category (year to date)">
          <ExpenseBreakdownChart categories={data.expenseCategories} />
        </ChartCard>

        <ChartCard title="Occupancy Rate" description="Portfolio occupancy trend (12 months)">
          <OccupancyChart metrics={data.occupancyMetrics} />
        </ChartCard>

        <ChartCard title="Maintenance" description="Tickets by priority and resolution">
          <MaintenanceChart metrics={data.maintenanceMetrics} />
        </ChartCard>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="outline"
          title="Download monthly rent collection analytics as CSV."
          disabled={data.rentMetrics.length === 0}
          onClick={() => exportChargesCSV(data.rentMetrics)}
        >
          Export Charges CSV
        </Button>
        <Button
          type="button"
          variant="outline"
          title="Download year-to-date expense totals as CSV."
          disabled={data.expenseCategories.length === 0}
          onClick={() => exportExpensesCSV(data.expenseCategories)}
        >
          Export Expenses CSV
        </Button>
      </div>
    </div>
  );
}
