import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAdministeredPropertyIds,
  getAdministeredPropertyIdsForAccount
} from "@/lib/property-access";
import { withChargeEditingFallback } from "@/lib/charge-audit";
import { isMissingSchemaError } from "@/lib/supabase-errors";

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

const EMPTY_ANALYTICS: AnalyticsDashboardData = {
  enabled: false,
  rentMetrics: [],
  expenseCategories: [],
  occupancyMetrics: [],
  maintenanceMetrics: [],
  summaryKpis: {
    collectionRate: 0,
    avgDaysToPayment: 0,
    totalIncomeCentsYtd: 0,
    totalExpenseCentsYtd: 0,
    netIncomeCentsYtd: 0,
    maintenanceCostCentsYtd: 0
  }
};

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
}

export interface AnalyticsTicketRow {
  priority: string | null;
  status: string | null;
  created_at: string;
  resolved_at: string | null;
  updated_at: string | null;
  actual_cost_cents: number | null;
}

function buildLastTwelveMonths(): MonthWindow[] {
  const now = new Date();
  const months: MonthWindow[] = [];

  for (let offset = 11; offset >= 0; offset -= 1) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
    months.push({
      key: start.toISOString().slice(0, 7),
      label: start.toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
        timeZone: "UTC"
      }),
      startIso: start.toISOString().slice(0, 10),
      endIso: end.toISOString().slice(0, 10)
    });
  }

  return months;
}

export function monthKey(value: string): string | null {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  return `${parsed.getUTCFullYear()}-${month}`;
}

function startOfCurrentYearIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString().slice(0, 10);
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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
  currentMonthKey: string | null
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
      if (charge.status === "late") {
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

export async function getOwnerAnalyticsData(
  userId: string,
  accountId?: string | null
): Promise<AnalyticsDashboardData> {
  const admin = createAdminClient();
  const propertyIds = accountId
    ? await getAdministeredPropertyIdsForAccount(userId, accountId)
    : await getAdministeredPropertyIds(userId);

  if (propertyIds.length === 0) {
    return EMPTY_ANALYTICS;
  }

  try {
    const lastTwelveMonths = buildLastTwelveMonths();
    const analyticsStartDate = lastTwelveMonths[0]?.startIso ?? startOfCurrentYearIso();
    const analyticsEndDate = lastTwelveMonths[lastTwelveMonths.length - 1]?.endIso ?? new Date().toISOString().slice(0, 10);
    const currentYearStart = startOfCurrentYearIso();
    const currentMonthKey = monthKey(new Date().toISOString().slice(0, 10));

    const unitsQuery = await admin
      .from("units")
      .select("id, property_id")
      .in("property_id", propertyIds);

    if (unitsQuery.error) {
      if (isMissingSchemaError(unitsQuery.error)) {
        return {
          ...EMPTY_ANALYTICS,
          enabled: true
        };
      }
      throw unitsQuery.error;
    }

    const unitRows = unitsQuery.data ?? [];
    const unitIds = unitRows.map((unit) => unit.id);
    const totalUnits = unitRows.length;

    const leasesQuery = unitIds.length
      ? await admin
          .from("leases")
          .select("id, unit_id, start_date, end_date")
          .in("unit_id", unitIds)
      : { data: [] as Array<{ id: string; unit_id: string; start_date: string; end_date: string }>, error: null };

    if (leasesQuery.error) {
      if (isMissingSchemaError(leasesQuery.error)) {
        const emptyOccupancyMetrics: OccupancyMetric[] = lastTwelveMonths.map((month) => ({
          month: month.label,
          occupiedUnits: 0,
          totalUnits,
          rate: 0
        }));

        return {
          enabled: true,
          rentMetrics: lastTwelveMonths.map((month) => ({
            month: month.label,
            dueCents: 0,
            collectedCents: 0,
            lateCents: 0
          })),
          expenseCategories: [],
          occupancyMetrics: emptyOccupancyMetrics,
          maintenanceMetrics: ["low", "medium", "high", "urgent"].map((priority) => ({
            priority,
            totalTickets: 0,
            resolvedTickets: 0,
            avgResolutionDays: 0
          })),
          summaryKpis: { ...EMPTY_ANALYTICS.summaryKpis }
        };
      }
      throw leasesQuery.error;
    }

    const leaseRows = leasesQuery.data ?? [];
    const leaseIds = leaseRows.map((lease) => lease.id);

    const chargesQuery = leaseIds.length
      ? await withChargeEditingFallback(
          () =>
            admin
              .from("rent_charges")
              .select("id, lease_id, due_date, amount_cents, status, category")
              .in("lease_id", leaseIds)
              .gte("due_date", analyticsStartDate)
              .lte("due_date", analyticsEndDate)
              .is("deleted_at", null),
          () =>
            admin
              .from("rent_charges")
              .select("id, lease_id, due_date, amount_cents, status, category")
              .in("lease_id", leaseIds)
              .gte("due_date", analyticsStartDate)
              .lte("due_date", analyticsEndDate)
        )
      : {
          data: [] as AnalyticsChargeRow[],
          error: null
        };

    if (chargesQuery.error) {
      if (isMissingSchemaError(chargesQuery.error)) {
        const chargesFallback = {
          data: [] as AnalyticsChargeRow[]
        };
        Object.assign(chargesQuery, chargesFallback);
      } else {
        throw chargesQuery.error;
      }
    }

    const expenseQuery = await admin
      .from("property_expenses")
      .select("property_id, category, amount_cents, expense_date")
      .in("property_id", propertyIds)
      .gte("expense_date", currentYearStart);

    if (expenseQuery.error) {
      if (isMissingSchemaError(expenseQuery.error)) {
        Object.assign(expenseQuery, {
          data: [] as AnalyticsExpenseRow[]
        });
      } else {
        throw expenseQuery.error;
      }
    }

    const maintenanceQuery = await admin
      .from("maintenance_tickets")
      .select("priority, status, created_at, resolved_at, updated_at, actual_cost_cents")
      .in("property_id", propertyIds);

    if (maintenanceQuery.error) {
      if (isMissingSchemaError(maintenanceQuery.error)) {
        Object.assign(maintenanceQuery, {
          data: [] as AnalyticsTicketRow[]
        });
      } else {
        throw maintenanceQuery.error;
      }
    }

    const chargeRows = chargesQuery.data ?? [];
    const chargeIds = chargeRows.map((charge) => charge.id);
    const paymentQuery = chargeIds.length
      ? await admin
          .from("payments")
          .select("rent_charge_id, paid_at")
          .in("rent_charge_id", chargeIds)
      : {
          data: [] as Array<{ rent_charge_id: string; paid_at: string }>,
          error: null
        };

    if (paymentQuery.error) {
      if (isMissingSchemaError(paymentQuery.error)) {
        Object.assign(paymentQuery, {
          data: [] as Array<{ rent_charge_id: string; paid_at: string }>
        });
      } else {
        throw paymentQuery.error;
      }
    }

    const {
      rentMetrics,
      totalIncomeCentsYtd,
      collectionRate
    } = buildRentMetrics(chargeRows, lastTwelveMonths, currentYearStart, currentMonthKey);

    const paymentsByChargeId = new Map<string, { rent_charge_id: string; paid_at: string }>();
    for (const payment of paymentQuery.data ?? []) {
      const existing = paymentsByChargeId.get(payment.rent_charge_id);
      if (!existing || payment.paid_at < existing.paid_at) {
        paymentsByChargeId.set(payment.rent_charge_id, payment);
      }
    }

    const paymentDayDiffs: number[] = [];
    for (const charge of chargeRows) {
      if ((charge.category ?? "rent") !== "rent") {
        continue;
      }

      const payment = paymentsByChargeId.get(charge.id);
      if (!payment) {
        continue;
      }

      const dueDate = new Date(`${charge.due_date}T00:00:00.000Z`).getTime();
      const paidAt = new Date(payment.paid_at).getTime();
      if (Number.isNaN(dueDate) || Number.isNaN(paidAt)) {
        continue;
      }

      paymentDayDiffs.push((paidAt - dueDate) / (1000 * 60 * 60 * 24));
    }

    const { expenseCategories, totalExpenseCentsYtd } = buildExpenseCategoryMetrics(
      expenseQuery.data ?? []
    );
    const occupancyMetrics = buildOccupancyMetrics(lastTwelveMonths, leaseRows, totalUnits);
    const { maintenanceMetrics, maintenanceCostCentsYtd } = buildMaintenanceMetrics(
      maintenanceQuery.data ?? [],
      currentYearStart
    );

    return {
      enabled: true,
      rentMetrics,
      expenseCategories,
      occupancyMetrics,
      maintenanceMetrics,
      summaryKpis: {
        collectionRate,
        avgDaysToPayment: average(paymentDayDiffs),
        totalIncomeCentsYtd,
        totalExpenseCentsYtd,
        netIncomeCentsYtd: totalIncomeCentsYtd - totalExpenseCentsYtd,
        maintenanceCostCentsYtd
      }
    };
  } catch (error) {
    console.error("[analytics] Failed to build owner analytics:", error);
    return EMPTY_ANALYTICS;
  }
}
