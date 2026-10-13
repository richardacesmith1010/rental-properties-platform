import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/auth";
import type { Partner } from "@/lib/partners";
import {
  getAdministeredPropertyIds,
  getAdministeredPropertyIdsForAccount
} from "@/lib/property-access";
import { withChargeEditingFallback } from "@/lib/charge-audit";
import { isMissingSchemaError } from "@/lib/supabase-errors";

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
  paidById?: string | null;
  paidByName?: string | null;
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
  activeLeaseByProperty?: Record<string, { tenantName: string; count: number }>;
  partnerAccounts?: Record<string, { accountId: string; partners: Partner[] }>;
  partnerWarning?: string | null;
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

export async function getOwnerExpenseData(
  userId: string,
  accountId?: string | null
): Promise<ExpenseDashboardData> {
  const admin = createAdminClient();
  const propertyIds = accountId
    ? await getAdministeredPropertyIdsForAccount(userId, accountId)
    : await getAdministeredPropertyIds(userId);

  if (propertyIds.length === 0) {
    return EMPTY_DASHBOARD;
  }

  const [propertyResult, expenseResult, unitResult] = await Promise.all([
    admin.from("properties").select("id, name, owner_account_id").in("id", propertyIds).order("name", { ascending: true }),
    admin.from("property_expenses")
      .select("id, property_id, category, description, amount_cents, expense_date, recurring, recurring_frequency, " +
        "vendor_id, receipt_file_id, created_at")
      .in("property_id", propertyIds)
      .order("expense_date", { ascending: false }),
    admin.from("units").select("id, property_id").in("property_id", propertyIds)
  ]);
  if (propertyResult.error) throw propertyResult.error;
  if (unitResult.error) throw unitResult.error;
  const propertyRows = propertyResult.data ?? [];
  const propertyNameById = new Map(propertyRows.map((property) => [property.id, property.name]));
  const expenses = expenseResult.data;
  const expenseError = expenseResult.error;

  if (expenseError && isMissingSchemaError(expenseError)) {
    return {
      ...EMPTY_DASHBOARD,
      enabled: false,
      warning: "Expense tracking is not ready yet. Apply the Phase 4 migration to enable this section.",
      properties: propertyRows.map((property) => ({ id: property.id, name: property.name }))
    };
  }
  if (expenseError) throw expenseError;

  const expenseRows = (expenses ?? []) as unknown as Array<{
    id: string;
    property_id: string;
    category: string;
    description: string | null;
    amount_cents: number;
    expense_date: string;
    recurring: boolean;
    recurring_frequency: RecurringFrequency;
    vendor_id: string | null;
    receipt_file_id: string | null;
    created_at: string;
  }>;
  const partnerAccounts: NonNullable<ExpenseDashboardData["partnerAccounts"]> = {};
  let partnerWarning: string | null = null;
  const payerByExpense = new Map<string, string>();
  const partnerById = new Map<string, Partner>();
  if (await getCurrentUserRole(userId) === "owner") {
    const client = createClient();
    const accountIds = [...new Set(propertyRows.map((row) => row.owner_account_id)
      .filter((id): id is string => Boolean(id)))];
    if (accountIds.length) {
      const accounts = await client.from("ownership_accounts").select("id, account_type").in("id", accountIds);
      if (accounts.error) throw accounts.error;
      const llcIds = (accounts.data ?? []).filter((row) => row.account_type === "llc").map((row) => row.id);
      if (llcIds.length) {
        const [partners, attributions] = await Promise.all([
          client.from("account_partners").select("id, account_id, display_name, active, profile_id").in("account_id", llcIds),
          expenseRows.length ? client.from("expense_partner_attributions")
            .select("expense_id, partner_id").in("expense_id", expenseRows.map((row) => row.id))
            : Promise.resolve({ data: [], error: null })
        ]);
        if (partners.error && !isMissingSchemaError(partners.error)) throw partners.error;
        if (attributions.error && !isMissingSchemaError(attributions.error)) throw attributions.error;
        if (partners.error || attributions.error) partnerWarning = "This feature requires a database update.";
        if (!partners.error && !attributions.error) {
          for (const row of partners.data ?? []) partnerById.set(row.id, {
            id: row.id, accountId: row.account_id, displayName: row.display_name,
            active: row.active, profileId: row.profile_id
          });
          for (const row of attributions.data ?? []) payerByExpense.set(row.expense_id, row.partner_id);
          for (const property of propertyRows) {
            if (property.owner_account_id && llcIds.includes(property.owner_account_id)) {
              partnerAccounts[property.id] = { accountId: property.owner_account_id,
                partners: [...partnerById.values()].filter((partner) => partner.accountId === property.owner_account_id) };
            }
          }
        }
      }
    }
  }
  const vendorIds = Array.from(
    new Set(
      expenseRows
        .map((expense) => expense.vendor_id)
        .filter((vendorId): vendorId is string => Boolean(vendorId))
    )
  );

  const unitRows = unitResult.data ?? [];
  const unitIds = unitRows.map((unit) => unit.id);
  const propertyByUnitId = new Map(unitRows.map((unit) => [unit.id, unit.property_id]));

  const [vendorResult, leaseResult] = await Promise.all([
    vendorIds.length
      ? admin.from("vendors").select("id, name").in("id", vendorIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }>, error: null }),
    unitIds.length
      ? admin.from("leases").select("id, unit_id, tenant_profile_id, active").in("unit_id", unitIds)
      : Promise.resolve({ data: [] as Array<{
        id: string; unit_id: string; tenant_profile_id: string | null; active: boolean
      }>, error: null })
  ]);
  if (vendorResult.error) throw vendorResult.error;
  if (leaseResult.error) throw leaseResult.error;
  const vendorNameById = new Map((vendorResult.data ?? []).map((vendor) => [vendor.id, vendor.name]));
  const leases = leaseResult.data;

  const leaseRows = leases ?? [];
  const activeLeases = leaseRows.filter((lease) => lease.active);
  const activeTenantIds = [...new Set(activeLeases.map((lease) => lease.tenant_profile_id)
    .filter((id): id is string => Boolean(id)))];
  const { data: activeTenants, error: activeTenantError } = activeTenantIds.length
    ? await admin.from("profiles").select("id, full_name, nickname").in("id", activeTenantIds)
    : { data: [], error: null };
  if (activeTenantError) throw activeTenantError;
  const tenantNameById = new Map((activeTenants ?? []).map((tenant) => [tenant.id,
    tenant.full_name || tenant.nickname || "tenant"]));
  const activeLeaseByProperty: NonNullable<ExpenseDashboardData["activeLeaseByProperty"]> = {};
  for (const lease of activeLeases) {
    const propertyId = propertyByUnitId.get(lease.unit_id);
    if (!propertyId) continue;
    const prior = activeLeaseByProperty[propertyId];
    activeLeaseByProperty[propertyId] = { count: (prior?.count ?? 0) + 1,
      tenantName: tenantNameById.get(lease.tenant_profile_id ?? "") ?? "tenant" };
  }
  const leaseIds = leaseRows.map((lease) => lease.id);
  const propertyByLeaseId = new Map(
    leaseRows.map((lease) => [lease.id, propertyByUnitId.get(lease.unit_id) ?? ""])
  );

  const { data: paidCharges, error: paidChargesError } = leaseIds.length
    ? await withChargeEditingFallback(
        () =>
          admin
            .from("rent_charges")
            .select("lease_id, amount_cents, due_date")
            .in("lease_id", leaseIds)
            .eq("status", "paid")
            .is("deleted_at", null),
        () =>
          admin
            .from("rent_charges")
            .select("lease_id, amount_cents, due_date")
            .in("lease_id", leaseIds)
            .eq("status", "paid")
      )
    : { data: [] as Array<{ lease_id: string; amount_cents: number; due_date: string }>, error: null };
  if (paidChargesError) throw paidChargesError;

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
    activeLeaseByProperty,
    partnerAccounts,
    partnerWarning,
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
      createdAt: expense.created_at,
      paidById: payerByExpense.get(expense.id) ?? null,
      paidByName: partnerById.get(payerByExpense.get(expense.id) ?? "")?.displayName ?? null
    })),
    pnlByProperty,
    monthlyByProperty,
    categoryByProperty
  };
}
