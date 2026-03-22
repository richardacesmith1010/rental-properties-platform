import { createAdminClient } from "@/lib/supabase/admin";
import { type ChargeDetailRecordDTO, type ExpenseLineItemDTO, withChargeEditingFallback } from "@/lib/charge-audit";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import {
  buildMonthKeys,
  composePropertyAddress,
  endOfYear,
  getLeasesForScope,
  monthKey,
  startOfYear
} from "./reports-rent-roll";

export interface MonthlyPnLRow {
  month: string;
  propertyId: string;
  propertyName: string;
  rentalIncome: number;
  lateFeeIncome: number;
  totalIncome: number;
  expenses: number;
  netIncome: number;
  incomeLineItems: ChargeDetailRecordDTO[];
  expenseLineItems: ExpenseLineItemDTO[];
}

export interface TaxSummaryRow {
  propertyName: string;
  propertyAddress: string;
  totalRentalIncome: number;
  advertisingExpenses: number;
  autoAndTravel: number;
  cleaningAndMaintenance: number;
  commissions: number;
  insurance: number;
  legalAndProfessional: number;
  managementFees: number;
  mortgageInterest: number;
  repairs: number;
  supplies: number;
  taxes: number;
  utilities: number;
  otherExpenses: number;
  totalExpenses: number;
  netIncome: number;
}

export function mapExpenseCategoryToTaxField(
  category: string
): keyof Omit<
  TaxSummaryRow,
  | "propertyName"
  | "propertyAddress"
  | "totalRentalIncome"
  | "totalExpenses"
  | "netIncome"
> {
  switch (category) {
    case "mortgage":
      return "mortgageInterest";
    case "insurance":
      return "insurance";
    case "management_fee":
      return "managementFees";
    case "legal":
      return "legalAndProfessional";
    case "property_tax":
      return "taxes";
    case "utility":
      return "utilities";
    case "maintenance":
      return "cleaningAndMaintenance";
    case "repair":
      return "repairs";
    default:
      return "otherExpenses";
  }
}

export async function getMonthlyPnLReport(
  userId: string,
  year = new Date().getUTCFullYear()
): Promise<MonthlyPnLRow[]> {
  try {
    const admin = createAdminClient();
    const { context, leases } = await getLeasesForScope(userId);
    if (context.propertyIds.length === 0) {
      return [];
    }

    const leaseById = new Map(leases.map((lease) => [lease.id, lease]));
    const leaseIds = leases.map((lease) => lease.id);
    const monthKeys = buildMonthKeys(year);

    const { data: charges, error: chargeError } = leaseIds.length
      ? await withChargeEditingFallback(
          () =>
            admin
              .from("rent_charges")
              .select("id, lease_id, category, due_date, amount_cents, status")
              .in("lease_id", leaseIds)
              .is("deleted_at", null),
          () =>
            admin
              .from("rent_charges")
              .select("id, lease_id, category, due_date, amount_cents, status")
              .in("lease_id", leaseIds)
        )
      : { data: [], error: null };
    if (chargeError) {
      throw chargeError;
    }

    const chargeById = new Map((charges ?? []).map((charge) => [charge.id, charge]));
    const { data: payments } = chargeById.size
      ? await admin
          .from("payments")
          .select("rent_charge_id, amount_cents, paid_at")
          .in("rent_charge_id", Array.from(chargeById.keys()))
          .gte("paid_at", startOfYear(year))
          .lte("paid_at", `${endOfYear(year)}T23:59:59.999Z`)
      : { data: [] };

    const { data: expenses } = await admin
      .from("property_expenses")
      .select("id, property_id, category, description, amount_cents, expense_date")
      .in("property_id", context.propertyIds)
      .gte("expense_date", startOfYear(year))
      .lte("expense_date", endOfYear(year));

    const totalsByMonthProperty = new Map<
      string,
      {
        rentalIncome: number;
        lateFeeIncome: number;
        expenses: number;
        incomeLineItems: ChargeDetailRecordDTO[];
        expenseLineItems: ExpenseLineItemDTO[];
      }
    >();

    for (const property of context.propertyById.values()) {
      for (const month of monthKeys) {
        totalsByMonthProperty.set(`${property.id}:${month}`, {
          rentalIncome: 0,
          lateFeeIncome: 0,
          expenses: 0,
          incomeLineItems: [],
          expenseLineItems: []
        });
      }
    }

    for (const payment of payments ?? []) {
      const charge = chargeById.get(payment.rent_charge_id);
      const lease = charge ? leaseById.get(charge.lease_id) : null;
      const unit = lease ? context.unitById.get(lease.unit_id) : null;
      const month = monthKey(payment.paid_at);
      if (!charge || !lease || !unit || !month) {
        continue;
      }
      const key = `${unit.propertyId}:${month}`;
      const bucket = totalsByMonthProperty.get(key);
      if (!bucket) {
        continue;
      }
      if (charge.category === "late_fee") {
        bucket.lateFeeIncome += payment.amount_cents;
      } else {
        bucket.rentalIncome += payment.amount_cents;
      }
      const tenantId = lease.tenant_profile_id ?? null;
      bucket.incomeLineItems.push({
        id: charge.id,
        leaseId: lease.id,
        propertyId: unit.propertyId,
        propertyName: context.propertyById.get(unit.propertyId)?.name ?? "Unknown Property",
        unitNumber: unit.unitNumber,
        tenantProfileId: tenantId,
        tenantName: tenantId ? "Tenant charge" : "Vacant unit",
        tenantEmail: "",
        dueDate: charge.due_date,
        amountCents: payment.amount_cents,
        status: charge.status,
        category: (charge.category ?? "rent") as ChargeDetailRecordDTO["category"],
        notes: null,
        latestEditedAt: null,
        latestEditedByName: null,
        editedCount: 0
      });
    }

    for (const expense of expenses ?? []) {
      const month = monthKey(expense.expense_date);
      if (!month) {
        continue;
      }
      const key = `${expense.property_id}:${month}`;
      const bucket = totalsByMonthProperty.get(key);
      if (!bucket) {
        continue;
      }
      bucket.expenses += expense.amount_cents;
      bucket.expenseLineItems.push({
        id: expense.id,
        propertyId: expense.property_id,
        propertyName: context.propertyById.get(expense.property_id)?.name ?? "Unknown Property",
        category: expense.category,
        description: expense.description ?? null,
        amountCents: expense.amount_cents,
        expenseDate: expense.expense_date
      });
    }

    const rows: MonthlyPnLRow[] = [];
    for (const property of context.propertyById.values()) {
      for (const month of monthKeys) {
        const bucket = totalsByMonthProperty.get(`${property.id}:${month}`);
        if (!bucket) {
          continue;
        }
        const totalIncome = bucket.rentalIncome + bucket.lateFeeIncome;
        rows.push({
          month,
          propertyId: property.id,
          propertyName: property.name,
          rentalIncome: bucket.rentalIncome,
          lateFeeIncome: bucket.lateFeeIncome,
          totalIncome,
          expenses: bucket.expenses,
          netIncome: totalIncome - bucket.expenses,
          incomeLineItems: bucket.incomeLineItems,
          expenseLineItems: bucket.expenseLineItems
        });
      }
    }

    return rows;
  } catch (error) {
    if (isMissingSchemaError(error)) {
      return [];
    }
    throw error;
  }
}

export async function getTaxSummaryReport(
  userId: string,
  year = new Date().getUTCFullYear()
): Promise<TaxSummaryRow[]> {
  try {
    const admin = createAdminClient();
    const { context, leases } = await getLeasesForScope(userId);
    if (context.propertyIds.length === 0) {
      return [];
    }

    const leaseById = new Map(leases.map((lease) => [lease.id, lease]));
    const leaseIds = leases.map((lease) => lease.id);

    const { data: charges, error: taxChargeError } = leaseIds.length
      ? await withChargeEditingFallback(
          () =>
            admin
              .from("rent_charges")
              .select("id, lease_id")
              .in("lease_id", leaseIds)
              .is("deleted_at", null),
          () => admin.from("rent_charges").select("id, lease_id").in("lease_id", leaseIds)
        )
      : { data: [], error: null };
    if (taxChargeError) {
      throw taxChargeError;
    }

    const chargeById = new Map((charges ?? []).map((charge) => [charge.id, charge]));
    const { data: payments } = chargeById.size
      ? await admin
          .from("payments")
          .select("rent_charge_id, amount_cents, paid_at")
          .in("rent_charge_id", Array.from(chargeById.keys()))
          .gte("paid_at", startOfYear(year))
          .lte("paid_at", `${endOfYear(year)}T23:59:59.999Z`)
      : { data: [] };

    const { data: expenses } = await admin
      .from("property_expenses")
      .select("property_id, category, amount_cents, expense_date")
      .in("property_id", context.propertyIds)
      .gte("expense_date", startOfYear(year))
      .lte("expense_date", endOfYear(year));

    const rowsByPropertyId = new Map<string, TaxSummaryRow>();
    for (const property of context.propertyById.values()) {
      rowsByPropertyId.set(property.id, {
        propertyName: property.name,
        propertyAddress: composePropertyAddress(property),
        totalRentalIncome: 0,
        advertisingExpenses: 0,
        autoAndTravel: 0,
        cleaningAndMaintenance: 0,
        commissions: 0,
        insurance: 0,
        legalAndProfessional: 0,
        managementFees: 0,
        mortgageInterest: 0,
        repairs: 0,
        supplies: 0,
        taxes: 0,
        utilities: 0,
        otherExpenses: 0,
        totalExpenses: 0,
        netIncome: 0
      });
    }

    for (const payment of payments ?? []) {
      const charge = chargeById.get(payment.rent_charge_id);
      const lease = charge ? leaseById.get(charge.lease_id) : null;
      const unit = lease ? context.unitById.get(lease.unit_id) : null;
      if (!unit) {
        continue;
      }
      const row = rowsByPropertyId.get(unit.propertyId);
      if (!row) {
        continue;
      }
      row.totalRentalIncome += payment.amount_cents;
    }

    for (const expense of expenses ?? []) {
      const row = rowsByPropertyId.get(expense.property_id);
      if (!row) {
        continue;
      }
      const field = mapExpenseCategoryToTaxField(expense.category);
      row[field] += expense.amount_cents;
    }

    return Array.from(rowsByPropertyId.values()).map((row) => {
      const totalExpenses =
        row.advertisingExpenses +
        row.autoAndTravel +
        row.cleaningAndMaintenance +
        row.commissions +
        row.insurance +
        row.legalAndProfessional +
        row.managementFees +
        row.mortgageInterest +
        row.repairs +
        row.supplies +
        row.taxes +
        row.utilities +
        row.otherExpenses;

      return {
        ...row,
        totalExpenses,
        netIncome: row.totalRentalIncome - totalExpenses
      };
    });
  } catch (error) {
    if (isMissingSchemaError(error)) {
      return [];
    }
    throw error;
  }
}
