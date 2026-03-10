"use client";

import type { ReactNode } from "react";
import type { AnalyticsDashboardData } from "@/lib/analytics";
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
    <div className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p
        className={`mt-1 text-lg font-bold ${
          positive === false
            ? "text-rose-600"
            : positive === true
              ? "text-emerald-600"
              : "text-zinc-900"
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
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
      <p className="text-xs text-zinc-500">{description}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function AnalyticsSection({ data }: AnalyticsSectionProps) {
  if (!data.enabled) {
    return <EmptyState message="Analytics become available after you have live portfolio activity to measure." showDom />;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <KpiMiniCard label="Collection Rate" value={`${data.summaryKpis.collectionRate.toFixed(0)}%`} positive={data.summaryKpis.collectionRate >= 95} />
        <KpiMiniCard label="Avg Days to Pay" value={`${data.summaryKpis.avgDaysToPayment.toFixed(1)}d`} positive={data.summaryKpis.avgDaysToPayment <= 0} />
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
