import { createAdminClient } from "@/lib/supabase/admin";
import { getAdministeredPropertyIds } from "@/lib/property-access";
import { isMissingSchemaError } from "@/lib/supabase-errors";

export interface RentRollItem {
  propertyName: string;
  unitNumber: string;
  tenantName: string | null;
  tenantEmail: string | null;
  monthlyRentCents: number;
  leaseStart: string;
  leaseEnd: string;
  leaseStatus: string;
  currentBalance: number;
  lastPaymentDate: string | null;
}

export interface DelinquencyItem {
  tenantName: string;
  tenantEmail: string;
  propertyName: string;
  unitNumber: string;
  current: number;
  thirtyDay: number;
  sixtyDay: number;
  ninetyPlus: number;
  totalOwed: number;
}

export interface TenantLedgerEntry {
  date: string;
  type: "charge" | "payment";
  description: string;
  amount: number;
  balance: number;
  propertyName: string;
  unitNumber: string;
}

export interface TenantLedger {
  tenantName: string;
  tenantEmail: string;
  entries: TenantLedgerEntry[];
  totalCharges: number;
  totalPayments: number;
  currentBalance: number;
}

export interface MonthlyPnLRow {
  month: string;
  propertyName: string;
  rentalIncome: number;
  lateFeeIncome: number;
  totalIncome: number;
  expenses: number;
  netIncome: number;
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

export interface ReceivableItem {
  tenantName: string;
  tenantEmail: string;
  propertyName: string;
  chargeCount: number;
  totalOwedCents: number;
  oldestDueDate: string;
}

interface ScopedPropertyContext {
  propertyIds: string[];
  propertyById: Map<string, { id: string; name: string; addressLine1: string | null; city: string | null; state: string | null; postalCode: string | null }>;
  unitById: Map<string, { id: string; propertyId: string; unitNumber: string }>;
}

function buildMonthKeys(year: number) {
  return Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);
}

function monthKey(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function startOfYear(year: number) {
  return `${year}-01-01`;
}

function endOfYear(year: number) {
  return `${year}-12-31`;
}

function differenceInDays(fromDate: string, toDate: string) {
  const from = new Date(`${fromDate}T00:00:00.000Z`);
  const to = new Date(`${toDate}T00:00:00.000Z`);
  return Math.floor((to.getTime() - from.getTime()) / 86400000);
}

export function bucketDelinquencyDays(daysPastDue: number): "current" | "thirtyDay" | "sixtyDay" | "ninetyPlus" {
  if (daysPastDue <= 30) {
    return "current";
  }
  if (daysPastDue <= 60) {
    return "thirtyDay";
  }
  if (daysPastDue <= 90) {
    return "sixtyDay";
  }
  return "ninetyPlus";
}

export function mapExpenseCategoryToTaxField(category: string): keyof Omit<TaxSummaryRow, "propertyName" | "propertyAddress" | "totalRentalIncome" | "totalExpenses" | "netIncome"> {
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

async function getScopedPropertyContext(userId: string): Promise<ScopedPropertyContext> {
  const admin = createAdminClient();
  const propertyIds = await getAdministeredPropertyIds(userId);

  if (propertyIds.length === 0) {
    return {
      propertyIds: [],
      propertyById: new Map(),
      unitById: new Map()
    };
  }

  const [{ data: properties, error: propertiesError }, { data: units, error: unitsError }] = await Promise.all([
    admin
      .from("properties")
      .select("id, name, address_line1, city, state, postal_code")
      .in("id", propertyIds),
    admin
      .from("units")
      .select("id, property_id, unit_number")
      .in("property_id", propertyIds)
  ]);

  if (propertiesError && isMissingSchemaError(propertiesError)) {
    return {
      propertyIds: [],
      propertyById: new Map(),
      unitById: new Map()
    };
  }

  if (unitsError && isMissingSchemaError(unitsError)) {
    return {
      propertyIds: [],
      propertyById: new Map(),
      unitById: new Map()
    };
  }

  if (propertiesError) {
    throw propertiesError;
  }

  if (unitsError) {
    throw unitsError;
  }

  return {
    propertyIds,
    propertyById: new Map(
      (properties ?? []).map((property) => [
        property.id,
        {
          id: property.id,
          name: property.name,
          addressLine1: property.address_line1,
          city: property.city,
          state: property.state,
          postalCode: property.postal_code
        }
      ])
    ),
    unitById: new Map(
      (units ?? []).map((unit) => [
        unit.id,
        {
          id: unit.id,
          propertyId: unit.property_id,
          unitNumber: unit.unit_number
        }
      ])
    )
  };
}

async function getLeasesForScope(userId: string) {
  const admin = createAdminClient();
  const context = await getScopedPropertyContext(userId);
  const unitIds = Array.from(context.unitById.keys());

  if (unitIds.length === 0) {
    return { context, leases: [], tenantById: new Map<string, { name: string | null; email: string | null }>() };
  }

  const { data: leases, error } = await admin
    .from("leases")
    .select("id, unit_id, tenant_profile_id, start_date, end_date, monthly_rent_cents, lease_status, active")
    .in("unit_id", unitIds);

  if (error) {
    if (isMissingSchemaError(error)) {
      return { context, leases: [], tenantById: new Map<string, { name: string | null; email: string | null }>() };
    }
    throw error;
  }

  const tenantIds = Array.from(
    new Set((leases ?? []).map((lease) => lease.tenant_profile_id).filter((id): id is string => Boolean(id)))
  );
  const { data: profiles, error: profilesError } = tenantIds.length
    ? await admin.from("profiles").select("id, full_name, email").in("id", tenantIds)
    : { data: [], error: null };

  if (profilesError) {
    if (isMissingSchemaError(profilesError)) {
      return { context, leases: leases ?? [], tenantById: new Map<string, { name: string | null; email: string | null }>() };
    }
    throw profilesError;
  }

  return {
    context,
    leases: leases ?? [],
    tenantById: new Map(
      (profiles ?? []).map((profile) => [
        profile.id,
        {
          name: profile.full_name,
          email: profile.email
        }
      ])
    )
  };
}

function composePropertyAddress(property: { addressLine1: string | null; city: string | null; state: string | null; postalCode: string | null }) {
  return [property.addressLine1, property.city, property.state, property.postalCode].filter(Boolean).join(", ");
}

export async function getRentRollReport(userId: string): Promise<RentRollItem[]> {
  try {
    const admin = createAdminClient();
    const { context, leases, tenantById } = await getLeasesForScope(userId);
    const activeLeases = leases.filter((lease) => lease.active === true || (lease.lease_status ?? "active") === "active");

    if (activeLeases.length === 0) {
      return [];
    }

    const leaseIds = activeLeases.map((lease) => lease.id);
    const { data: charges } = await admin
      .from("rent_charges")
      .select("id, lease_id, amount_cents, status")
      .in("lease_id", leaseIds)
      .in("status", ["pending", "late"]);

    const { data: chargeIds } = await admin
      .from("rent_charges")
      .select("id, lease_id")
      .in("lease_id", leaseIds);

    const leaseIdByChargeId = new Map((chargeIds ?? []).map((charge) => [charge.id, charge.lease_id]));
    const { data: payments } = leaseIdByChargeId.size
      ? await admin
          .from("payments")
          .select("rent_charge_id, paid_at")
          .in("rent_charge_id", Array.from(leaseIdByChargeId.keys()))
      : { data: [] };

    const balanceByLeaseId = new Map<string, number>();
    for (const charge of charges ?? []) {
      balanceByLeaseId.set(charge.lease_id, (balanceByLeaseId.get(charge.lease_id) ?? 0) + charge.amount_cents);
    }

    const latestPaymentByLeaseId = new Map<string, string>();
    for (const payment of payments ?? []) {
      const leaseId = leaseIdByChargeId.get(payment.rent_charge_id);
      if (!leaseId) {
        continue;
      }
      const current = latestPaymentByLeaseId.get(leaseId);
      if (!current || payment.paid_at > current) {
        latestPaymentByLeaseId.set(leaseId, payment.paid_at);
      }
    }

    return activeLeases.map((lease) => {
      const unit = context.unitById.get(lease.unit_id);
      const property = unit ? context.propertyById.get(unit.propertyId) : null;
      const tenant = lease.tenant_profile_id ? tenantById.get(lease.tenant_profile_id) : null;

      return {
        propertyName: property?.name ?? "Unknown Property",
        unitNumber: unit?.unitNumber ?? "-",
        tenantName: tenant?.name ?? null,
        tenantEmail: tenant?.email ?? null,
        monthlyRentCents: lease.monthly_rent_cents,
        leaseStart: lease.start_date,
        leaseEnd: lease.end_date,
        leaseStatus: lease.lease_status ?? (lease.active ? "active" : "inactive"),
        currentBalance: balanceByLeaseId.get(lease.id) ?? 0,
        lastPaymentDate: latestPaymentByLeaseId.get(lease.id) ?? null
      };
    });
  } catch (error) {
    if (isMissingSchemaError(error)) {
      return [];
    }
    throw error;
  }
}

export async function getDelinquencyReport(userId: string): Promise<DelinquencyItem[]> {
  try {
    const admin = createAdminClient();
    const { context, leases, tenantById } = await getLeasesForScope(userId);
    const leaseById = new Map(leases.map((lease) => [lease.id, lease]));
    const leaseIds = leases.map((lease) => lease.id);

    if (leaseIds.length === 0) {
      return [];
    }

    const { data: charges, error } = await admin
      .from("rent_charges")
      .select("lease_id, due_date, amount_cents, status")
      .in("lease_id", leaseIds)
      .in("status", ["pending", "late"]);

    if (error) {
      throw error;
    }

    const todayIso = new Date().toISOString().slice(0, 10);
    const grouped = new Map<string, DelinquencyItem>();

    for (const charge of charges ?? []) {
      const lease = leaseById.get(charge.lease_id);
      if (!lease || !lease.tenant_profile_id) {
        continue;
      }
      const unit = context.unitById.get(lease.unit_id);
      const property = unit ? context.propertyById.get(unit.propertyId) : null;
      const tenant = tenantById.get(lease.tenant_profile_id);
      const key = `${lease.tenant_profile_id}:${lease.unit_id}`;
      const row = grouped.get(key) ?? {
        tenantName: tenant?.name ?? tenant?.email ?? "Unknown Tenant",
        tenantEmail: tenant?.email ?? "",
        propertyName: property?.name ?? "Unknown Property",
        unitNumber: unit?.unitNumber ?? "-",
        current: 0,
        thirtyDay: 0,
        sixtyDay: 0,
        ninetyPlus: 0,
        totalOwed: 0
      };

      const bucket = bucketDelinquencyDays(Math.max(differenceInDays(charge.due_date, todayIso), 0));
      row[bucket] += charge.amount_cents;
      row.totalOwed += charge.amount_cents;
      grouped.set(key, row);
    }

    return Array.from(grouped.values()).sort((left, right) => right.totalOwed - left.totalOwed);
  } catch (error) {
    if (isMissingSchemaError(error)) {
      return [];
    }
    throw error;
  }
}

export async function getTenantLedgerReport(
  userId: string,
  tenantProfileId?: string
): Promise<TenantLedger[]> {
  try {
    const admin = createAdminClient();
    const { context, leases, tenantById } = await getLeasesForScope(userId);
    const filteredLeases = tenantProfileId
      ? leases.filter((lease) => lease.tenant_profile_id === tenantProfileId)
      : leases;

    if (filteredLeases.length === 0) {
      return [];
    }

    const leaseIds = filteredLeases.map((lease) => lease.id);
    const { data: charges, error: chargeError } = await admin
      .from("rent_charges")
      .select("id, lease_id, due_date, amount_cents, category")
      .in("lease_id", leaseIds)
      .order("due_date", { ascending: true });

    if (chargeError) {
      throw chargeError;
    }

    const chargeIdById = new Map((charges ?? []).map((charge) => [charge.id, charge]));
    const { data: payments, error: paymentError } = chargeIdById.size
      ? await admin
          .from("payments")
          .select("id, rent_charge_id, amount_cents, paid_at")
          .in("rent_charge_id", Array.from(chargeIdById.keys()))
          .order("paid_at", { ascending: true })
      : { data: [], error: null };

    if (paymentError) {
      throw paymentError;
    }

    const entriesByTenantId = new Map<string, TenantLedgerEntry[]>();

    for (const lease of filteredLeases) {
      if (!lease.tenant_profile_id) {
        continue;
      }
      const unit = context.unitById.get(lease.unit_id);
      const property = unit ? context.propertyById.get(unit.propertyId) : null;
      const propertyName = property?.name ?? "Unknown Property";
      const unitNumber = unit?.unitNumber ?? "-";

      for (const charge of charges?.filter((row) => row.lease_id === lease.id) ?? []) {
        const tenantEntries = entriesByTenantId.get(lease.tenant_profile_id) ?? [];
        tenantEntries.push({
          date: charge.due_date,
          type: "charge",
          description: `${charge.category === "late_fee" ? "Late fee" : "Rent charge"} posted`,
          amount: charge.amount_cents,
          balance: 0,
          propertyName,
          unitNumber
        });
        entriesByTenantId.set(lease.tenant_profile_id, tenantEntries);
      }
    }

    for (const payment of payments ?? []) {
      const charge = chargeIdById.get(payment.rent_charge_id);
      if (!charge) {
        continue;
      }
      const lease = filteredLeases.find((candidate) => candidate.id === charge.lease_id);
      if (!lease?.tenant_profile_id) {
        continue;
      }
      const unit = context.unitById.get(lease.unit_id);
      const property = unit ? context.propertyById.get(unit.propertyId) : null;
      const tenantEntries = entriesByTenantId.get(lease.tenant_profile_id) ?? [];
      tenantEntries.push({
        date: payment.paid_at,
        type: "payment",
        description: "Payment received",
        amount: -payment.amount_cents,
        balance: 0,
        propertyName: property?.name ?? "Unknown Property",
        unitNumber: unit?.unitNumber ?? "-"
      });
      entriesByTenantId.set(lease.tenant_profile_id, tenantEntries);
    }

    const ledgers: TenantLedger[] = [];

    for (const [tenantId, entries] of entriesByTenantId.entries()) {
      const sortedEntries = [...entries].sort((left, right) => left.date.localeCompare(right.date));
      let runningBalance = 0;
      let totalCharges = 0;
      let totalPayments = 0;
      const enrichedEntries = sortedEntries.map((entry) => {
        runningBalance += entry.amount;
        if (entry.type === "charge") {
          totalCharges += entry.amount;
        } else {
          totalPayments += Math.abs(entry.amount);
        }
        return {
          ...entry,
          balance: runningBalance
        };
      });
      const tenant = tenantById.get(tenantId);
      ledgers.push({
        tenantName: tenant?.name ?? tenant?.email ?? "Unknown Tenant",
        tenantEmail: tenant?.email ?? "",
        entries: enrichedEntries,
        totalCharges,
        totalPayments,
        currentBalance: runningBalance
      });
    }

    return ledgers.sort((left, right) => left.tenantName.localeCompare(right.tenantName));
  } catch (error) {
    if (isMissingSchemaError(error)) {
      return [];
    }
    throw error;
  }
}

export async function getMonthlyPnLReport(userId: string, year = new Date().getUTCFullYear()): Promise<MonthlyPnLRow[]> {
  try {
    const admin = createAdminClient();
    const { context, leases } = await getLeasesForScope(userId);
    if (context.propertyIds.length === 0) {
      return [];
    }
    const leaseById = new Map(leases.map((lease) => [lease.id, lease]));
    const leaseIds = leases.map((lease) => lease.id);
    const monthKeys = buildMonthKeys(year);

    const { data: charges } = leaseIds.length
      ? await admin
          .from("rent_charges")
          .select("id, lease_id, category")
          .in("lease_id", leaseIds)
      : { data: [] };

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
      .select("property_id, amount_cents, expense_date")
      .in("property_id", context.propertyIds)
      .gte("expense_date", startOfYear(year))
      .lte("expense_date", endOfYear(year));

    const totalsByMonthProperty = new Map<string, { rentalIncome: number; lateFeeIncome: number; expenses: number }>();

    for (const property of context.propertyById.values()) {
      for (const month of monthKeys) {
        totalsByMonthProperty.set(`${property.id}:${month}`, {
          rentalIncome: 0,
          lateFeeIncome: 0,
          expenses: 0
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
          propertyName: property.name,
          rentalIncome: bucket.rentalIncome,
          lateFeeIncome: bucket.lateFeeIncome,
          totalIncome,
          expenses: bucket.expenses,
          netIncome: totalIncome - bucket.expenses
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

export async function getTaxSummaryReport(userId: string, year = new Date().getUTCFullYear()): Promise<TaxSummaryRow[]> {
  try {
    const admin = createAdminClient();
    const { context, leases } = await getLeasesForScope(userId);
    if (context.propertyIds.length === 0) {
      return [];
    }
    const leaseById = new Map(leases.map((lease) => [lease.id, lease]));
    const leaseIds = leases.map((lease) => lease.id);

    const { data: charges } = leaseIds.length
      ? await admin
          .from("rent_charges")
          .select("id, lease_id")
          .in("lease_id", leaseIds)
      : { data: [] };

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

export async function getReceivablesReport(userId: string): Promise<ReceivableItem[]> {
  try {
    const admin = createAdminClient();
    const { context, leases, tenantById } = await getLeasesForScope(userId);
    const leaseById = new Map(leases.map((lease) => [lease.id, lease]));
    const leaseIds = leases.map((lease) => lease.id);

    if (leaseIds.length === 0) {
      return [];
    }

    const { data: charges, error } = await admin
      .from("rent_charges")
      .select("lease_id, amount_cents, due_date")
      .in("lease_id", leaseIds)
      .in("status", ["pending", "late"]);

    if (error) {
      throw error;
    }

    const grouped = new Map<string, ReceivableItem>();
    for (const charge of charges ?? []) {
      const lease = leaseById.get(charge.lease_id);
      if (!lease?.tenant_profile_id) {
        continue;
      }
      const unit = context.unitById.get(lease.unit_id);
      const property = unit ? context.propertyById.get(unit.propertyId) : null;
      const tenant = tenantById.get(lease.tenant_profile_id);
      const key = `${lease.tenant_profile_id}:${lease.unit_id}`;
      const row = grouped.get(key) ?? {
        tenantName: tenant?.name ?? tenant?.email ?? "Unknown Tenant",
        tenantEmail: tenant?.email ?? "",
        propertyName: property?.name ?? "Unknown Property",
        chargeCount: 0,
        totalOwedCents: 0,
        oldestDueDate: charge.due_date
      };
      row.chargeCount += 1;
      row.totalOwedCents += charge.amount_cents;
      if (charge.due_date < row.oldestDueDate) {
        row.oldestDueDate = charge.due_date;
      }
      grouped.set(key, row);
    }

    return Array.from(grouped.values()).sort((left, right) => right.totalOwedCents - left.totalOwedCents);
  } catch (error) {
    if (isMissingSchemaError(error)) {
      return [];
    }
    throw error;
  }
}
