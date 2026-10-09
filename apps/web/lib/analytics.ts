import { average } from "@/lib/analytics-average";
import { tracksLateRent, type LeaseCollectionPreference } from "@/lib/lease-collection";

export interface MonthlyRentMetric {
  month: string;
  dueCents: number;
  collectedCents: number;
  lateCents: number;
}

export interface ExpenseCategoryMetric {
  category: string;
  totalCents: number;
}

export interface OccupancyMetric {
  month: string;
  occupiedUnits: number;
  totalUnits: number;
  rate: number;
}

export interface MaintenanceMetric {
  priority: string;
  totalTickets: number;
  resolvedTickets: number;
  avgResolutionDays: number;
}

export interface AnalyticsDashboardData {
  enabled: boolean;
  rentMetrics: MonthlyRentMetric[];
  expenseCategories: ExpenseCategoryMetric[];
  occupancyMetrics: OccupancyMetric[];
  maintenanceMetrics: MaintenanceMetric[];
  summaryKpis: {
    collectionRate: number;
    avgDaysToPayment: number;
    totalIncomeCentsYtd: number;
    totalExpenseCentsYtd: number;
    netIncomeCentsYtd: number;
    maintenanceCostCentsYtd: number;
  };
}

export interface MonthWindow {
  key: string;
  label: string;
  startIso: string;
  endIso: string;
}

export interface AnalyticsChargeRow {
  id: string;
  lease_id: string;
  due_date: string;
  amount_cents: number;
  status: "pending" | "paid" | "late";
  category: string | null;
}

export interface AnalyticsExpenseRow {
  property_id: string;
  category: string;
  amount_cents: number;
  expense_date: string;
}

export interface AnalyticsLeaseRow {
  id: string;
  unit_id: string;
  start_date: string;
  end_date: string;
  collects_outside_domus?: boolean;
}

export interface AnalyticsTicketRow {
  priority: string | null;
  status: string | null;
  created_at: string;
  resolved_at: string | null;
  updated_at: string | null;
  actual_cost_cents: number | null;
}

export function monthKey(value: string): string | null {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  return `${parsed.getUTCFullYear()}-${month}`;
}

export function formatAverageDaysToPayment(value: number | null | undefined): string {
  if (value == null || value <= 0) {
    return "—";
  }

  return `${value.toFixed(1)}d`;
}

function overlapMonth(startDate: string, endDate: string, month: MonthWindow): boolean {
  return startDate <= month.endIso && endDate >= month.startIso;
}

export function calculateOccupancyRate(occupiedUnits: number, totalUnits: number): number {
  if (totalUnits <= 0) {
    return 0;
  }

  return (occupiedUnits / totalUnits) * 100;
}

export function buildRentMetrics(
  charges: AnalyticsChargeRow[],
  months: MonthWindow[],
  currentYearStart: string,
  currentMonthKey: string | null,
  leaseById: ReadonlyMap<string, LeaseCollectionPreference> = new Map()
): {
  rentMetrics: MonthlyRentMetric[];
  totalIncomeCentsYtd: number;
  collectionRate: number;
} {
  const rentMetricMap = new Map<string, MonthlyRentMetric>(
    months.map((month) => [
      month.key,
      { month: month.label, dueCents: 0, collectedCents: 0, lateCents: 0 }
    ])
  );

  let totalIncomeCentsYtd = 0;
  for (const charge of charges) {
    const key = monthKey(charge.due_date);
    if (!key || !rentMetricMap.has(key)) {
      continue;
    }

    const metric = rentMetricMap.get(key)!;
    const category = charge.category ?? "rent";
    if (category === "rent") {
      metric.dueCents += charge.amount_cents;
      if (charge.status === "paid") {
        metric.collectedCents += charge.amount_cents;
      }
      if (
        charge.status === "late" &&
        tracksLateRent(leaseById.get(charge.lease_id))
      ) {
        metric.lateCents += charge.amount_cents;
      }
    }

    if (charge.status === "paid" && charge.due_date >= currentYearStart) {
      totalIncomeCentsYtd += charge.amount_cents;
    }
  }

  const currentMonthMetrics = currentMonthKey ? rentMetricMap.get(currentMonthKey) : undefined;

  return {
    rentMetrics: months.map((month) => rentMetricMap.get(month.key)!),
    totalIncomeCentsYtd,
    collectionRate:
      currentMonthMetrics && currentMonthMetrics.dueCents > 0
        ? (currentMonthMetrics.collectedCents / currentMonthMetrics.dueCents) * 100
        : 0
  };
}

export function buildExpenseCategoryMetrics(expenses: AnalyticsExpenseRow[]): {
  expenseCategories: ExpenseCategoryMetric[];
  totalExpenseCentsYtd: number;
} {
  const expenseTotals = new Map<string, number>();
  let totalExpenseCentsYtd = 0;

  for (const expense of expenses) {
    totalExpenseCentsYtd += expense.amount_cents;
    expenseTotals.set(
      expense.category,
      (expenseTotals.get(expense.category) ?? 0) + expense.amount_cents
    );
  }

  return {
    expenseCategories: Array.from(expenseTotals.entries())
      .map(([category, totalCents]) => ({ category, totalCents }))
      .sort((left, right) => right.totalCents - left.totalCents),
    totalExpenseCentsYtd
  };
}

export function buildOccupancyMetrics(
  months: MonthWindow[],
  leases: AnalyticsLeaseRow[],
  totalUnits: number
): OccupancyMetric[] {
  return months.map((month) => {
    const occupiedUnitIds = new Set<string>();
    for (const lease of leases) {
      if (overlapMonth(lease.start_date, lease.end_date, month)) {
        occupiedUnitIds.add(lease.unit_id);
      }
    }

    const occupiedUnits = occupiedUnitIds.size;
    return {
      month: month.label,
      occupiedUnits,
      totalUnits,
      rate: calculateOccupancyRate(occupiedUnits, totalUnits)
    };
  });
}

export function buildMaintenanceMetrics(
  tickets: AnalyticsTicketRow[],
  currentYearStart: string
): {
  maintenanceMetrics: MaintenanceMetric[];
  maintenanceCostCentsYtd: number;
} {
  const maintenanceAccumulator = new Map<
    string,
    { totalTickets: number; resolvedTickets: number; resolutionDays: number[] }
  >([
    ["low", { totalTickets: 0, resolvedTickets: 0, resolutionDays: [] }],
    ["medium", { totalTickets: 0, resolvedTickets: 0, resolutionDays: [] }],
    ["high", { totalTickets: 0, resolvedTickets: 0, resolutionDays: [] }],
    ["urgent", { totalTickets: 0, resolvedTickets: 0, resolutionDays: [] }]
  ]);

  let maintenanceCostCentsYtd = 0;
  for (const ticket of tickets) {
    const priority =
      typeof ticket.priority === "string" &&
      ["low", "medium", "high", "urgent"].includes(ticket.priority)
        ? ticket.priority
        : "low";
    const bucket = maintenanceAccumulator.get(priority)!;
    bucket.totalTickets += 1;

    if (ticket.created_at >= currentYearStart) {
      maintenanceCostCentsYtd += ticket.actual_cost_cents ?? 0;
    }

    if (ticket.status === "resolved" || ticket.status === "closed") {
      bucket.resolvedTickets += 1;
      const resolvedAt = ticket.resolved_at ?? ticket.updated_at;
      const createdAt = new Date(ticket.created_at).getTime();
      const resolvedTime = resolvedAt ? new Date(resolvedAt).getTime() : Number.NaN;
      if (!Number.isNaN(createdAt) && !Number.isNaN(resolvedTime) && resolvedTime >= createdAt) {
        bucket.resolutionDays.push((resolvedTime - createdAt) / (1000 * 60 * 60 * 24));
      }
    }
  }

  return {
    maintenanceMetrics: ["low", "medium", "high", "urgent"].map((priority) => {
      const bucket = maintenanceAccumulator.get(priority)!;
      return {
        priority,
        totalTickets: bucket.totalTickets,
        resolvedTickets: bucket.resolvedTickets,
        avgResolutionDays: average(bucket.resolutionDays)
      };
    }),
    maintenanceCostCentsYtd
  };
}


export { getOwnerAnalyticsData } from "@/lib/analytics-loader";
