import type { ChargeDetailRecordDTO } from "@/lib/charge-audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaError } from "@/lib/supabase-errors";
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
    const chargeIdById = new Map(
      Array.from(detailsByLeaseId.values())
        .flat()
        .map((charge) => [charge.id, charge])
    );
    const { data: payments, error: paymentError } = chargeIdById.size
      ? await admin
          .from("payments")
          .select("id, rent_charge_id, amount_cents, paid_at")
          .in("rent_charge_id", chargeIds)
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
