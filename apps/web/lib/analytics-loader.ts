import { average } from "@/lib/analytics-average";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdministeredPropertyIds, getAdministeredPropertyIdsForAccount } from "@/lib/property-access";
import { withChargeEditingFallback } from "@/lib/charge-audit";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import {
  buildExpenseCategoryMetrics, buildMaintenanceMetrics, buildOccupancyMetrics,
  buildRentMetrics, monthKey, type AnalyticsDashboardData, type AnalyticsChargeRow,
  type AnalyticsExpenseRow, type AnalyticsLeaseRow, type AnalyticsTicketRow, type OccupancyMetric,
  type MonthWindow
} from "@/lib/analytics";

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


function startOfCurrentYearIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString().slice(0, 10);
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
          .select("id, unit_id, start_date, end_date, collects_outside_domus")
          .in("unit_id", unitIds)
      : { data: [] as AnalyticsLeaseRow[], error: null };

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
    } = buildRentMetrics(
      chargeRows,
      lastTwelveMonths,
      currentYearStart,
      currentMonthKey,
      new Map(leaseRows.map((lease) => [lease.id, lease]))
    );

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
