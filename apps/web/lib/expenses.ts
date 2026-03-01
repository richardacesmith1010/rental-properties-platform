import { createAdminClient } from "@/lib/supabase/admin";
import { getAdministeredPropertyIds } from "@/lib/property-access";

type ExpenseCategory =
  | "mortgage"
  | "insurance"
  | "property_tax"
  | "hoa"
  | "repair"
  | "maintenance"
  | "utility"
  | "management_fee"
  | "legal"
  | "other";

type RecurringFrequency = "monthly" | "quarterly" | "annually" | null;

export interface ExpenseItemDTO {
  id: string;
  propertyId: string;
  propertyName: string;
  category: ExpenseCategory;
  description: string | null;
  amountCents: number;
  expenseDate: string;
  recurring: boolean;
  recurringFrequency: RecurringFrequency;
  vendorId: string | null;
  vendorName: string | null;
  receiptFileId: string | null;
  createdAt: string;
}

export interface PropertyPnLDTO {
  propertyId: string;
  propertyName: string;
  incomeCents: number;
  expenseCents: number;
  netCents: number;
}

export interface MonthlyPnLDTO {
  month: string;
  incomeCents: number;
  expenseCents: number;
  netCents: number;
}

export interface ExpenseCategoryBreakdownDTO {
  category: ExpenseCategory;
  totalCents: number;
}

export interface ExpenseDashboardData {
  enabled: boolean;
  warning: string | null;
  properties: Array<{ id: string; name: string }>;
  expenses: ExpenseItemDTO[];
  pnlByProperty: PropertyPnLDTO[];
  monthlyByProperty: Record<string, MonthlyPnLDTO[]>;
  categoryByProperty: Record<string, ExpenseCategoryBreakdownDTO[]>;
}

const EMPTY_DASHBOARD: ExpenseDashboardData = {
  enabled: true,
  warning: null,
  properties: [],
  expenses: [],
  pnlByProperty: [],
  monthlyByProperty: {},
  categoryByProperty: {}
};

function isMissingSchemaError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? String(error.code ?? "") : "";
  const message = "message" in error ? String(error.message ?? "").toLowerCase() : "";

  return (
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST205" ||
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    (message.includes("column") && message.includes("does not exist"))
  );
}

function monthKey(value: string): string | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  return `${parsed.getUTCFullYear()}-${month}`;
}

function buildLastTwelveMonthKeys(): string[] {
  const now = new Date();
  const keys: string[] = [];
  for (let offset = 11; offset >= 0; offset -= 1) {
    const current = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    const month = String(current.getUTCMonth() + 1).padStart(2, "0");
    keys.push(`${current.getUTCFullYear()}-${month}`);
  }
  return keys;
}

function monthLabel(monthKeyValue: string): string {
  const [year, month] = monthKeyValue.split("-");
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function initMonthlyMap(monthKeys: string[]): Record<string, { incomeCents: number; expenseCents: number }> {
  const map: Record<string, { incomeCents: number; expenseCents: number }> = {};
  for (const month of monthKeys) {
    map[month] = { incomeCents: 0, expenseCents: 0 };
  }
  return map;
}

export async function getOwnerExpenseData(userId: string): Promise<ExpenseDashboardData> {
  const admin = createAdminClient();
  const propertyIds = await getAdministeredPropertyIds(userId);

  if (propertyIds.length === 0) {
    return EMPTY_DASHBOARD;
  }

  const { data: properties } = await admin
    .from("properties")
    .select("id, name")
    .in("id", propertyIds)
    .order("name", { ascending: true });

  const propertyRows = properties ?? [];
  const propertyNameById = new Map(propertyRows.map((property) => [property.id, property.name]));

  const { data: expenses, error: expenseError } = await admin
    .from("property_expenses")
    .select("id, property_id, category, description, amount_cents, expense_date, recurring, recurring_frequency, vendor_id, receipt_file_id, created_at")
    .in("property_id", propertyIds)
    .order("expense_date", { ascending: false });

  if (expenseError && isMissingSchemaError(expenseError)) {
    return {
      ...EMPTY_DASHBOARD,
      enabled: false,
      warning: "Expense tracking is not ready yet. Apply the Phase 4 migration to enable this section.",
      properties: propertyRows.map((property) => ({ id: property.id, name: property.name }))
    };
  }

  const expenseRows = expenses ?? [];
  const vendorIds = Array.from(
    new Set(
      expenseRows
        .map((expense) => expense.vendor_id)
        .filter((vendorId): vendorId is string => Boolean(vendorId))
    )
  );

  const { data: vendors } = vendorIds.length
    ? await admin
        .from("vendors")
        .select("id, name")
        .in("id", vendorIds)
    : { data: [] as Array<{ id: string; name: string }> };

  const vendorNameById = new Map((vendors ?? []).map((vendor) => [vendor.id, vendor.name]));

  const { data: units } = await admin
    .from("units")
    .select("id, property_id")
    .in("property_id", propertyIds);

  const unitRows = units ?? [];
  const unitIds = unitRows.map((unit) => unit.id);
  const propertyByUnitId = new Map(unitRows.map((unit) => [unit.id, unit.property_id]));

  const { data: leases } = unitIds.length
    ? await admin
        .from("leases")
        .select("id, unit_id")
        .in("unit_id", unitIds)
    : { data: [] as Array<{ id: string; unit_id: string }> };

  const leaseRows = leases ?? [];
  const leaseIds = leaseRows.map((lease) => lease.id);
  const propertyByLeaseId = new Map(
    leaseRows.map((lease) => [lease.id, propertyByUnitId.get(lease.unit_id) ?? ""])
  );

  const { data: paidCharges } = leaseIds.length
    ? await admin
        .from("rent_charges")
        .select("lease_id, amount_cents, due_date")
        .in("lease_id", leaseIds)
        .eq("status", "paid")
    : { data: [] as Array<{ lease_id: string; amount_cents: number; due_date: string }> };

  const monthKeys = buildLastTwelveMonthKeys();
  const incomeByProperty = new Map<string, number>();
  const expenseByProperty = new Map<string, number>();
  const monthlyAccumulatorByProperty = new Map<
    string,
    Record<string, { incomeCents: number; expenseCents: number }>
  >();
  const categoryAccumulatorByProperty = new Map<string, Map<ExpenseCategory, number>>();

  for (const property of propertyRows) {
    incomeByProperty.set(property.id, 0);
    expenseByProperty.set(property.id, 0);
    monthlyAccumulatorByProperty.set(property.id, initMonthlyMap(monthKeys));
    categoryAccumulatorByProperty.set(property.id, new Map());
  }

  for (const charge of paidCharges ?? []) {
    const propertyId = propertyByLeaseId.get(charge.lease_id);
    if (!propertyId) {
      continue;
    }

    incomeByProperty.set(propertyId, (incomeByProperty.get(propertyId) ?? 0) + charge.amount_cents);
    const monthlyMap = monthlyAccumulatorByProperty.get(propertyId);
    const month = monthKey(charge.due_date);
    if (monthlyMap && month && monthlyMap[month]) {
      monthlyMap[month].incomeCents += charge.amount_cents;
    }
  }

  for (const expense of expenseRows) {
    const propertyId = expense.property_id;
    expenseByProperty.set(propertyId, (expenseByProperty.get(propertyId) ?? 0) + expense.amount_cents);

    const monthlyMap = monthlyAccumulatorByProperty.get(propertyId);
    const month = monthKey(expense.expense_date);
    if (monthlyMap && month && monthlyMap[month]) {
      monthlyMap[month].expenseCents += expense.amount_cents;
    }

    const categoryMap = categoryAccumulatorByProperty.get(propertyId);
    if (categoryMap) {
      const category = expense.category as ExpenseCategory;
      categoryMap.set(category, (categoryMap.get(category) ?? 0) + expense.amount_cents);
    }
  }

  const pnlByProperty: PropertyPnLDTO[] = propertyRows.map((property) => {
    const incomeCents = incomeByProperty.get(property.id) ?? 0;
    const expenseCents = expenseByProperty.get(property.id) ?? 0;
    return {
      propertyId: property.id,
      propertyName: property.name,
      incomeCents,
      expenseCents,
      netCents: incomeCents - expenseCents
    };
  });

  const monthlyByProperty: Record<string, MonthlyPnLDTO[]> = {};
  for (const property of propertyRows) {
    const monthlyMap = monthlyAccumulatorByProperty.get(property.id) ?? initMonthlyMap(monthKeys);
    monthlyByProperty[property.id] = monthKeys.map((month) => {
      const values = monthlyMap[month] ?? { incomeCents: 0, expenseCents: 0 };
      return {
        month: monthLabel(month),
        incomeCents: values.incomeCents,
        expenseCents: values.expenseCents,
        netCents: values.incomeCents - values.expenseCents
      };
    });
  }

  const categoryByProperty: Record<string, ExpenseCategoryBreakdownDTO[]> = {};
  for (const property of propertyRows) {
    const categoryMap = categoryAccumulatorByProperty.get(property.id) ?? new Map<ExpenseCategory, number>();
    categoryByProperty[property.id] = Array.from(categoryMap.entries())
      .map(([category, totalCents]) => ({ category, totalCents }))
      .sort((left, right) => right.totalCents - left.totalCents);
  }

  return {
    enabled: true,
    warning: null,
    properties: propertyRows.map((property) => ({ id: property.id, name: property.name })),
    expenses: expenseRows.map((expense) => ({
      id: expense.id,
      propertyId: expense.property_id,
      propertyName: propertyNameById.get(expense.property_id) ?? "Property",
      category: expense.category as ExpenseCategory,
      description: expense.description,
      amountCents: expense.amount_cents,
      expenseDate: expense.expense_date,
      recurring: expense.recurring,
      recurringFrequency: (expense.recurring_frequency as RecurringFrequency) ?? null,
      vendorId: expense.vendor_id,
      vendorName: expense.vendor_id ? vendorNameById.get(expense.vendor_id) ?? null : null,
      receiptFileId: expense.receipt_file_id,
      createdAt: expense.created_at
    })),
    pnlByProperty,
    monthlyByProperty,
    categoryByProperty
  };
}
