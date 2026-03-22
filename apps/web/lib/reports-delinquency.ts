import type { ChargeDetailRecordDTO } from "@/lib/charge-audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import { differenceInDays, getChargeDetailsForLeases, getLeasesForScope } from "./reports-rent-roll";

export interface DelinquencyItem {
  leaseId: string;
  tenantProfileId: string | null;
  tenantName: string;
  tenantEmail: string;
  propertyName: string;
  unitNumber: string;
  current: number;
  thirtyDay: number;
  sixtyDay: number;
  ninetyPlus: number;
  totalOwed: number;
  chargeDetails: ChargeDetailRecordDTO[];
}

export interface ReceivableItem {
  leaseId: string;
  tenantProfileId: string | null;
  tenantName: string;
  tenantEmail: string;
  propertyName: string;
  chargeCount: number;
  totalOwedCents: number;
  oldestDueDate: string;
  chargeDetails: ChargeDetailRecordDTO[];
}

export function bucketDelinquencyDays(
  daysPastDue: number
): "current" | "thirtyDay" | "sixtyDay" | "ninetyPlus" {
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

export async function getDelinquencyReport(userId: string): Promise<DelinquencyItem[]> {
  try {
    const admin = createAdminClient();
    const { context, leases, tenantById } = await getLeasesForScope(userId);
    const leaseById = new Map(leases.map((lease) => [lease.id, lease]));
    const { detailsByLeaseId } = await getChargeDetailsForLeases({
      admin,
      context,
      leases,
      tenantById,
      statuses: ["pending", "late"]
    });
    const leaseIds = Array.from(detailsByLeaseId.keys());

    if (leaseIds.length === 0) {
      return [];
    }

    const todayIso = new Date().toISOString().slice(0, 10);
    const grouped = new Map<string, DelinquencyItem>();

    for (const [leaseId, chargeDetails] of detailsByLeaseId.entries()) {
      const lease = leaseById.get(leaseId);
      if (!lease || !lease.tenant_profile_id) {
        continue;
      }

      const unit = context.unitById.get(lease.unit_id);
      const property = unit ? context.propertyById.get(unit.propertyId) : null;
      const tenant = tenantById.get(lease.tenant_profile_id);
      const key = `${lease.tenant_profile_id}:${lease.unit_id}`;
      const row = grouped.get(key) ?? {
        leaseId,
        tenantProfileId: lease.tenant_profile_id,
        tenantName: tenant?.name ?? tenant?.email ?? "Unknown Tenant",
        tenantEmail: tenant?.email ?? "",
        propertyName: property?.name ?? "Unknown Property",
        unitNumber: unit?.unitNumber ?? "-",
        current: 0,
        thirtyDay: 0,
        sixtyDay: 0,
        ninetyPlus: 0,
        totalOwed: 0,
        chargeDetails: [] as ChargeDetailRecordDTO[]
      };

      for (const charge of chargeDetails) {
        const bucket = bucketDelinquencyDays(Math.max(differenceInDays(charge.dueDate, todayIso), 0));
        row[bucket] += charge.amountCents;
        row.totalOwed += charge.amountCents;
        row.chargeDetails.push(charge);
      }
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

export async function getReceivablesReport(userId: string): Promise<ReceivableItem[]> {
  try {
    const admin = createAdminClient();
    const { context, leases, tenantById } = await getLeasesForScope(userId);
    const leaseById = new Map(leases.map((lease) => [lease.id, lease]));
    const { detailsByLeaseId } = await getChargeDetailsForLeases({
      admin,
      context,
      leases,
      tenantById,
      statuses: ["pending", "late"]
    });
    const leaseIds = Array.from(detailsByLeaseId.keys());

    if (leaseIds.length === 0) {
      return [];
    }

    const grouped = new Map<string, ReceivableItem>();
    for (const [leaseId, chargeDetails] of detailsByLeaseId.entries()) {
      const lease = leaseById.get(leaseId);
      if (!lease?.tenant_profile_id) {
        continue;
      }

      const unit = context.unitById.get(lease.unit_id);
      const property = unit ? context.propertyById.get(unit.propertyId) : null;
      const tenant = tenantById.get(lease.tenant_profile_id);
      const key = `${lease.tenant_profile_id}:${lease.unit_id}`;
      const row = grouped.get(key) ?? {
        leaseId,
        tenantProfileId: lease.tenant_profile_id,
        tenantName: tenant?.name ?? tenant?.email ?? "Unknown Tenant",
        tenantEmail: tenant?.email ?? "",
        propertyName: property?.name ?? "Unknown Property",
        chargeCount: 0,
        totalOwedCents: 0,
        oldestDueDate: chargeDetails[0]?.dueDate ?? new Date().toISOString().slice(0, 10),
        chargeDetails: [] as ChargeDetailRecordDTO[]
      };

      for (const charge of chargeDetails) {
        row.chargeCount += 1;
        row.totalOwedCents += charge.amountCents;
        if (charge.dueDate < row.oldestDueDate) {
          row.oldestDueDate = charge.dueDate;
        }
        row.chargeDetails.push(charge);
      }
      grouped.set(key, row);
    }

    return Array.from(grouped.values()).sort(
      (left, right) => right.totalOwedCents - left.totalOwedCents
    );
  } catch (error) {
    if (isMissingSchemaError(error)) {
      return [];
    }
    throw error;
  }
}
