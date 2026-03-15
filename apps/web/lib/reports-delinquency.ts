import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import { differenceInDays, getLeasesForScope } from "./reports-rent-roll";

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

export interface ReceivableItem {
  tenantName: string;
  tenantEmail: string;
  propertyName: string;
  chargeCount: number;
  totalOwedCents: number;
  oldestDueDate: string;
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
