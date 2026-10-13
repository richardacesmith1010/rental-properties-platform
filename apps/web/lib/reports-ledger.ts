import type { ChargeDetailRecordDTO } from "@/lib/charge-audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import { chargeBreakdown, getChargeLines, linesByCharge } from "@/lib/charge-lines";
import { canUserAdministerProperty, getAdministeredPropertyIds } from "@/lib/property-access";
import { createClient } from "@/lib/supabase/server";
import { getChargeDetailsForLeases, getLeasesForScope } from "./reports-rent-roll";

export interface TenantLedgerEntry {
  date: string;
  type: "charge" | "payment";
  description: string;
  amount: number;
  balance: number;
  propertyName: string;
  unitNumber: string;
  chargeId?: string | null;
  paymentId?: string | null;
  charge?: ChargeDetailRecordDTO | null;
}

export interface TenantLedger {
  tenantName: string;
  tenantEmail: string;
  entries: TenantLedgerEntry[];
  totalCharges: number;
  totalPayments: number;
  currentBalance: number;
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

    const { detailsByLeaseId, chargeIds } = await getChargeDetailsForLeases({
      admin,
      context,
      leases: filteredLeases,
      tenantById
    });
    for (const [leaseId, details] of detailsByLeaseId) {
      detailsByLeaseId.set(leaseId, details.filter((charge) => charge.status !== "waived"));
    }
    const chargeIdById = new Map(
      Array.from(detailsByLeaseId.values())
        .flat()
        .map((charge) => [charge.id, charge])
    );
    const { data: payments, error: paymentError } = chargeIdById.size
      ? await admin
          .from("payments")
          .select("id, rent_charge_id, amount_cents, paid_at, reversed_at")
          .in("rent_charge_id", chargeIds)
          .is("reversed_at", null)
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

      for (const charge of detailsByLeaseId.get(lease.id) ?? []) {
        const tenantEntries = entriesByTenantId.get(lease.tenant_profile_id) ?? [];
        tenantEntries.push({
          date: charge.dueDate,
          type: "charge",
          description: `${charge.category === "late_fee" ? "Late fee" : "Charge"} posted`,
          amount: charge.amountCents,
          balance: 0,
          propertyName,
          unitNumber,
          chargeId: charge.id,
          charge
        });
        entriesByTenantId.set(lease.tenant_profile_id, tenantEntries);
      }
    }

    for (const payment of payments ?? []) {
      const charge = chargeIdById.get(payment.rent_charge_id);
      if (!charge) {
        continue;
      }

      const lease = filteredLeases.find((candidate) => candidate.id === charge.leaseId);
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
        unitNumber: unit?.unitNumber ?? "-",
        paymentId: payment.id,
        chargeId: charge.id,
        charge
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

export interface MonthlyLedgerMonth {
  month: string; rentCents: number; utilityCents: number; creditCents: number;
  owedCents: number; paidCents: number; balanceCents: number; short: boolean;
}
export interface MonthlyLeaseLedger {
  lease: { startDate: string; endDate: string; monthlyRentCents: number };
  months: MonthlyLedgerMonth[];
  totals: Omit<MonthlyLedgerMonth, "month" | "short">;
}

export function buildMonthlyLeaseLedger(lease: MonthlyLeaseLedger["lease"],
  charges: Array<{ id: string; due_date: string; amount_cents: number; status: string; deleted_at: string | null }>,
  payments: Array<{ rent_charge_id: string; amount_cents: number; reversed_at: string | null }>,
  lines: Awaited<ReturnType<typeof getChargeLines>>, today = new Date().toISOString().slice(0, 10)
): MonthlyLeaseLedger {
  const eligible = charges.filter((charge) => !charge.deleted_at && charge.status !== "waived");
  const lineMap = linesByCharge(lines);
  const paymentsByCharge = new Map<string, number>();
  for (const payment of payments) {
    if (payment.reversed_at) continue;
    paymentsByCharge.set(payment.rent_charge_id,
      (paymentsByCharge.get(payment.rent_charge_id) ?? 0) + payment.amount_cents);
  }
  const byMonth = new Map<string, MonthlyLedgerMonth>();
  const dueByMonth = new Map<string, string>();
  let balance = 0;
  for (const charge of eligible.sort((a, b) => a.due_date.localeCompare(b.due_date))) {
    const month = charge.due_date.slice(0, 7);
    const parts = chargeBreakdown(charge, lineMap.get(charge.id) ?? []);
    const row = byMonth.get(month) ?? {
      month, rentCents: 0, utilityCents: 0, creditCents: 0,
      owedCents: 0, paidCents: 0, balanceCents: 0, short: false
    };
    row.rentCents += parts.rentCents;
    row.utilityCents += parts.utilityCents;
    row.creditCents += parts.creditCents;
    row.owedCents += parts.totalCents;
    row.paidCents += paymentsByCharge.get(charge.id) ?? 0;
    byMonth.set(month, row);
    dueByMonth.set(month, charge.due_date);
  }
  const months = [...byMonth.values()].map((row) => {
    balance += row.owedCents - row.paidCents;
    return { ...row, balanceCents: balance,
      short: (dueByMonth.get(row.month) ?? "9999-12-31") <= today && row.paidCents < row.owedCents };
  });
  const totals = months.reduce((sum, row) => ({
    rentCents: sum.rentCents + row.rentCents,
    utilityCents: sum.utilityCents + row.utilityCents,
    creditCents: sum.creditCents + row.creditCents,
    owedCents: sum.owedCents + row.owedCents,
    paidCents: sum.paidCents + row.paidCents,
    balanceCents: row.balanceCents
  }), { rentCents: 0, utilityCents: 0, creditCents: 0, owedCents: 0, paidCents: 0, balanceCents: 0 });
  return { lease, months, totals };
}

export async function getMonthlyLeaseLedger(leaseId: string): Promise<MonthlyLeaseLedger | null> {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return null;
  const admin = createAdminClient();
  const { data: lease, error: leaseError } = await admin.from("leases")
    .select("id, unit_id, start_date, end_date, monthly_rent_cents").eq("id", leaseId).maybeSingle();
  if (leaseError) throw leaseError;
  if (!lease) return null;
  const { data: unit, error: unitError } = await admin.from("units")
    .select("property_id").eq("id", lease.unit_id).maybeSingle();
  if (unitError) throw unitError;
  if (!unit || !(await canUserAdministerProperty(user.id, unit.property_id))) return null;
  const { data: charges, error: chargeError } = await admin.from("rent_charges")
    .select("id, due_date, amount_cents, status, deleted_at").eq("lease_id", leaseId)
    .eq("category", "rent").is("deleted_at", null);
  if (chargeError) throw chargeError;
  const chargeIds = (charges ?? []).map((charge) => charge.id);
  const { data: payments, error: paymentError } = chargeIds.length
    ? await admin.from("payments").select("rent_charge_id, amount_cents, reversed_at")
      .in("rent_charge_id", chargeIds).is("reversed_at", null)
    : { data: [], error: null };
  if (paymentError) throw paymentError;
  const lines = await getChargeLines(chargeIds);
  return buildMonthlyLeaseLedger({ startDate: lease.start_date, endDate: lease.end_date,
    monthlyRentCents: lease.monthly_rent_cents }, charges ?? [], payments ?? [], lines);
}

export async function getMonthlyLeaseLedgers(leaseIds: string[]): Promise<Map<string, MonthlyLeaseLedger>> {
  if (!leaseIds.length) return new Map();
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return new Map();
  const admin = createAdminClient();
  const { data: leases, error: leasesError } = await admin.from("leases")
    .select("id, unit_id, start_date, end_date, monthly_rent_cents").in("id", leaseIds);
  if (leasesError) throw leasesError;
  const unitIds = [...new Set((leases ?? []).map((lease) => lease.unit_id))];
  const { data: units, error: unitsError } = unitIds.length
    ? await admin.from("units").select("id, property_id").in("id", unitIds)
    : { data: [], error: null };
  if (unitsError) throw unitsError;
  const propertyByUnit = new Map((units ?? []).map((unit) => [unit.id, unit.property_id]));
  const allowed = new Set(await getAdministeredPropertyIds(user.id));
  const authorized = (leases ?? []).filter((lease) => allowed.has(propertyByUnit.get(lease.unit_id) ?? ""));
  if (!authorized.length) return new Map();
  const { data: charges, error: chargesError } = await admin.from("rent_charges")
    .select("id, lease_id, due_date, amount_cents, status, deleted_at")
    .in("lease_id", authorized.map((lease) => lease.id)).eq("category", "rent").is("deleted_at", null);
  if (chargesError) throw chargesError;
  const chargeIds = (charges ?? []).map((charge) => charge.id);
  const { data: payments, error: paymentsError } = chargeIds.length
    ? await admin.from("payments").select("rent_charge_id, amount_cents, reversed_at")
      .in("rent_charge_id", chargeIds).is("reversed_at", null)
    : { data: [], error: null };
  if (paymentsError) throw paymentsError;
  const lineRows = await getChargeLines(chargeIds);
  return new Map(authorized.map((lease) => {
    const leaseCharges = (charges ?? []).filter((charge) => charge.lease_id === lease.id);
    const leaseChargeIds = new Set(leaseCharges.map((charge) => charge.id));
    return [lease.id, buildMonthlyLeaseLedger({ startDate: lease.start_date, endDate: lease.end_date,
      monthlyRentCents: lease.monthly_rent_cents }, leaseCharges,
      (payments ?? []).filter((payment) => leaseChargeIds.has(payment.rent_charge_id)),
      lineRows.filter((line) => line.charge_id && leaseChargeIds.has(line.charge_id)))] as const;
  }));
}
