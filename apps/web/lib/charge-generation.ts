import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { withChargeEditingFallback } from "@/lib/charge-audit";
import { formatDate } from "@/lib/format";
import {
  createNotificationWithDelivery,
  notifyOwnerMembersForProperty
} from "@/lib/notifications";
import { getPropertyNotificationDeliveryPreferences } from "@/lib/notification-preferences";
import { getAdministeredPropertyIds } from "@/lib/property-access";
type LeaseStatus = "active" | "expiring_soon" | "expired" | "terminated" | "renewed" | null;
type UnitRow = { id: string; property_id: string };
type ExistingChargeRow = { lease_id: string; due_date: string };
type LateChargeRow = { id: string; lease_id: string; due_date: string };
type LeaseRow = {
  id: string; unit_id: string; tenant_profile_id?: string | null; start_date: string; end_date: string;
  created_at: string;
  due_day_of_month: number; monthly_rent_cents: number; grace_period_days?: number | null;
  late_fee_cents?: number | null; lease_status?: LeaseStatus;
};
type LateLeaseRow = {
  id: string; tenant_profile_id: string | null; unit_id: string; grace_period_days: number | null;
  late_fee_cents: number | null; lease_status: LeaseStatus;
};

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function toUtcDateIso(value: string) {
  return startOfUtcDay(new Date(value)).toISOString().slice(0, 10);
}

function monthStartFromIso(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1));
}

export function isLeaseActiveForChargeMonth(lease: LeaseRow, dueDateIso: string) {
  const chargeMonth = monthStartFromIso(dueDateIso);
  const leaseStartMonth = monthStartFromIso(lease.start_date);

  if (chargeMonth.getTime() < leaseStartMonth.getTime()) {
    return false;
  }

  const leaseEndMonth = monthStartFromIso(lease.end_date);
  if (chargeMonth.getTime() > leaseEndMonth.getTime()) {
    return false;
  }

  return true;
}

function isDueDateWithinLeaseWindow(lease: LeaseRow, dueDateIso: string) {
  const leaseCreatedIso = toUtcDateIso(lease.created_at);
  return dueDateIso >= leaseCreatedIso && dueDateIso >= lease.start_date && dueDateIso <= lease.end_date;
}

export function getCandidateMonths(baseDate = new Date()) {
  const baseYear = baseDate.getUTCFullYear();
  const baseMonth = baseDate.getUTCMonth();
  return [
    { year: baseYear, month: baseMonth },
    { year: baseMonth === 11 ? baseYear + 1 : baseYear, month: (baseMonth + 1) % 12 }
  ];
}
function nextDueDateOnOrAfterToday(dueDayOfMonth: number, todayIso: string) {
  const today = new Date(`${todayIso}T00:00:00.000Z`);
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  for (let i = 0; i < 12; i += 1) {
    const year = monthStart.getUTCFullYear() + Math.floor((monthStart.getUTCMonth() + i) / 12);
    const month = (monthStart.getUTCMonth() + i) % 12;
    const dueDateIso = new Date(Date.UTC(year, month, dueDayOfMonth)).toISOString().slice(0, 10);
    if (dueDateIso >= todayIso) {
      return dueDateIso;
    }
  }
  return todayIso;
}
export function buildDueDatesByLeaseId(leases: LeaseRow[], todayIso: string) {
  const today = new Date(`${todayIso}T00:00:00.000Z`);
  const dueDatesByLeaseId = new Map<string, string[]>();
  for (const lease of leases) {
    const dueDates = getCandidateMonths(today)
      .map((candidate) => new Date(Date.UTC(candidate.year, candidate.month, lease.due_day_of_month)))
      .map((date) => date.toISOString().slice(0, 10))
      .filter(
        (date) =>
          isLeaseActiveForChargeMonth(lease, date) && isDueDateWithinLeaseWindow(lease, date)
      );
    if (dueDates.length > 0) {
      dueDatesByLeaseId.set(lease.id, dueDates);
      continue;
    }
    if (todayIso > lease.end_date) {
      continue;
    }
    const fallbackDueDate = nextDueDateOnOrAfterToday(lease.due_day_of_month, todayIso);
    if (
      isLeaseActiveForChargeMonth(lease, fallbackDueDate) &&
      isDueDateWithinLeaseWindow(lease, fallbackDueDate)
    ) {
      dueDatesByLeaseId.set(lease.id, [fallbackDueDate]);
      continue;
    }
    if (isLeaseActiveForChargeMonth(lease, todayIso) && isDueDateWithinLeaseWindow(lease, todayIso)) {
      dueDatesByLeaseId.set(lease.id, [todayIso]);
    }
  }
  return dueDatesByLeaseId;
}
function isPastGraceWindow(dueDateIso: string, gracePeriodDays: number, today: Date) {
  const dueDate = new Date(`${dueDateIso}T00:00:00.000Z`);
  dueDate.setUTCDate(dueDate.getUTCDate() + gracePeriodDays);
  return startOfUtcDay(today).getTime() > dueDate.getTime();
}

async function updateLeaseStatuses(supabase: SupabaseClient, propertyIds: string[]) {
  if (propertyIds.length === 0) {
    return;
  }

  const today = startOfUtcDay(new Date());
  const thirtyDaysFromNow = new Date(today);
  thirtyDaysFromNow.setUTCDate(thirtyDaysFromNow.getUTCDate() + 30);

  const { data: propertyUnits } = await supabase.from("units").select("id").in("property_id", propertyIds);
  const unitIds = (propertyUnits ?? []).map((unit) => unit.id);
  if (unitIds.length === 0) {
    return;
  }

  const { data: activeLeases } = await supabase
    .from("leases")
    .select("id, end_date, lease_status, active")
    .in("unit_id", unitIds)
    .eq("active", true);

  const expiringSoonLeaseIds: string[] = [];
  const expiredLeaseIds: string[] = [];
  for (const lease of (activeLeases ?? []) as Array<{ id: string; end_date: string; lease_status: LeaseStatus; active: boolean }>) {
    const status = lease.lease_status ?? "active";
    if (status === "terminated" || status === "renewed") {
      continue;
    }

    const endDate = new Date(`${lease.end_date}T00:00:00.000Z`);
    if (endDate.getTime() < today.getTime()) {
      expiredLeaseIds.push(lease.id);
      continue;
    }

    if (status === "active" && endDate.getTime() <= thirtyDaysFromNow.getTime()) {
      expiringSoonLeaseIds.push(lease.id);
    }
  }

  if (expiringSoonLeaseIds.length > 0) {
    const { error } = await supabase
      .from("leases")
      .update({ lease_status: "expiring_soon" })
      .in("id", expiringSoonLeaseIds)
      .eq("active", true);
    if (error) {
      throw error;
    }
  }

  if (expiredLeaseIds.length > 0) {
    const { error } = await supabase
      .from("leases")
      .update({ lease_status: "expired", active: false })
      .in("id", expiredLeaseIds)
      .eq("active", true);
    if (error) {
      throw error;
    }
  }
}

export async function applyLateFeesToOverdueCharges(
  supabase: SupabaseClient,
  leaseIds: string[],
  todayIso = new Date().toISOString().slice(0, 10)
): Promise<number> {
  if (leaseIds.length === 0) {
    return 0;
  }

  const { data: lateCandidates, error: candidateError } = await withChargeEditingFallback(
    () =>
      supabase
        .from("rent_charges")
        .select("id, lease_id, due_date, status, category")
        .in("lease_id", leaseIds)
        .eq("status", "pending")
        .eq("category", "rent")
        .lt("due_date", todayIso)
        .is("deleted_at", null),
    () =>
      supabase
        .from("rent_charges")
        .select("id, lease_id, due_date, status, category")
        .in("lease_id", leaseIds)
        .eq("status", "pending")
        .eq("category", "rent")
        .lt("due_date", todayIso)
  );

  if (candidateError) {
    throw candidateError;
  }

  const candidateRows = (lateCandidates ?? []) as Array<LateChargeRow & { status?: string; category?: string | null }>;
  if (candidateRows.length === 0) {
    return 0;
  }

  const candidateLeaseIds = Array.from(new Set(candidateRows.map((charge) => charge.lease_id)));
  const { data: lateLeases, error: leaseError } = await supabase
    .from("leases")
    .select("id, tenant_profile_id, unit_id, grace_period_days, late_fee_cents, lease_status")
    .in("id", candidateLeaseIds);
  if (leaseError) {
    throw leaseError;
  }

  const leaseById = new Map(((lateLeases ?? []) as LateLeaseRow[]).map((lease) => [lease.id, lease]));
  const today = new Date();
  const lateChargeRows = candidateRows.filter((charge) => {
    const lease = leaseById.get(charge.lease_id);
    if (!lease) {
      return false;
    }
    return isPastGraceWindow(charge.due_date, lease.grace_period_days ?? 5, today);
  });

  if (lateChargeRows.length === 0) {
    return 0;
  }

  const lateChargeIds = lateChargeRows.map((charge) => charge.id);
  const { error: lateUpdateError } = await supabase
    .from("rent_charges")
    .update({ status: "late" })
    .in("id", lateChargeIds);
  if (lateUpdateError) {
    throw lateUpdateError;
  }

  const { data: existingLateFeeCharges, error: existingLateFeeError } = await supabase
    .from("rent_charges")
    .select("id, parent_charge_id")
    .in("parent_charge_id", lateChargeIds)
    .eq("category", "late_fee");
  if (existingLateFeeError) {
    throw existingLateFeeError;
  }

  const lateFeesByParentChargeId = new Set(((existingLateFeeCharges ?? []) as Array<{ parent_charge_id: string | null }>).map((row) => row.parent_charge_id).filter((value): value is string => Boolean(value)));

  const lateFeeInserts = lateChargeRows
    .map((charge) => {
      const lease = leaseById.get(charge.lease_id);
      const lateFeeCents = lease?.late_fee_cents ?? 0;
      if (!lease || lateFeeCents <= 0 || lateFeesByParentChargeId.has(charge.id)) {
        return null;
      }

      return {
        lease_id: charge.lease_id,
        due_date: charge.due_date,
        amount_cents: lateFeeCents,
        status: "pending" as const,
        category: "late_fee" as const,
        parent_charge_id: charge.id
      };
    })
    .filter((row): row is { lease_id: string; due_date: string; amount_cents: number; status: "pending"; category: "late_fee"; parent_charge_id: string } => row !== null);

  if (lateFeeInserts.length > 0) {
    const { error: lateFeeInsertError } = await supabase.from("rent_charges").insert(lateFeeInserts);
    if (lateFeeInsertError) {
      throw lateFeeInsertError;
    }
  }

  const lateLeaseRows = Array.from(new Set(lateChargeRows.map((charge) => charge.lease_id))).map((leaseId) => leaseById.get(leaseId)).filter((lease): lease is LateLeaseRow => Boolean(lease));
  const lateUnitIds = Array.from(new Set(lateLeaseRows.map((lease) => lease.unit_id)));
  const { data: lateUnits, error: lateUnitsError } = lateUnitIds.length
    ? await supabase.from("units").select("id, property_id").in("id", lateUnitIds)
    : { data: [] as UnitRow[], error: null };
  if (lateUnitsError) {
    throw lateUnitsError;
  }

  const lateUnitRows = (lateUnits ?? []) as UnitRow[];
  const propertyIdByUnitId = new Map(lateUnitRows.map((unit) => [unit.id, unit.property_id]));
  const propertyDeliveryPreferences = await getPropertyNotificationDeliveryPreferences(
    supabase,
    lateUnitRows.map((unit) => unit.property_id),
    "late_rent"
  );
  const tenantIds = Array.from(
    new Set(lateLeaseRows.map((lease) => lease.tenant_profile_id).filter((id): id is string => Boolean(id)))
  );
  const { data: profiles, error: profilesError } = tenantIds.length
    ? await supabase.from("profiles").select("id, email").in("id", tenantIds)
    : { data: [] as Array<{ id: string; email: string | null }>, error: null };
  if (profilesError) {
    throw profilesError;
  }

  const emailByTenantId = new Map(((profiles ?? []) as Array<{ id: string; email: string | null }>).map((profile) => [profile.id, profile.email]));
  await Promise.all(
    lateChargeRows.flatMap((charge) => {
      const lease = leaseById.get(charge.lease_id);
      const propertyId = lease?.unit_id ? propertyIdByUnitId.get(lease.unit_id) ?? null : null;
      const notifications: Promise<unknown>[] = [];

      if (lease?.tenant_profile_id) {
        notifications.push(
          createNotificationWithDelivery({
            recipientProfileId: lease.tenant_profile_id,
            recipientEmail: emailByTenantId.get(lease.tenant_profile_id) ?? null,
            type: "late_rent",
            title: "Rent payment overdue",
            body: `Your rent charge due on ${formatDate(charge.due_date)} is now marked late.`,
            entityType: "rent_charge",
            entityId: charge.id,
            deliveryPreference: propertyId
              ? propertyDeliveryPreferences.get(propertyId)
              : undefined
          })
        );
      }

      if (propertyId) {
        notifications.push(
          notifyOwnerMembersForProperty({
            propertyId,
            type: "late_rent",
            title: "Rent charge marked late",
            body: `A rent charge due on ${formatDate(charge.due_date)} is now late.`,
            entityType: "rent_charge",
            entityId: charge.id
          })
        );
      }

      return notifications;
    })
  );

  return lateChargeRows.length;
}

export async function generateMonthlyChargesForPropertyIdsWithClient(
  supabase: SupabaseClient,
  propertyIds: string[]
): Promise<string> {
  const todayIso = new Date().toISOString().slice(0, 10);
  if (propertyIds.length === 0) {
    return "No properties found for your account.";
  }

  const { data: units, error: unitsError } = await supabase
    .from("units")
    .select("id, property_id")
    .in("property_id", propertyIds);
  if (unitsError) {
    throw unitsError;
  }

  const unitRows = (units ?? []) as UnitRow[];
  const unitIds = unitRows.map((unit) => unit.id);
  if (unitIds.length === 0) {
    await updateLeaseStatuses(supabase, propertyIds);
    return "No units found. Add a unit first.";
  }

  const { data: leases, error: leasesError } = await supabase
    .from("leases")
    .select(
      "id, unit_id, tenant_profile_id, start_date, end_date, created_at, due_day_of_month, monthly_rent_cents, grace_period_days, late_fee_cents, lease_status"
    )
    .in("unit_id", unitIds)
    .eq("active", true);
  if (leasesError) {
    throw leasesError;
  }

  const leaseRows = (leases ?? []) as LeaseRow[];
  if (leaseRows.length === 0) {
    await updateLeaseStatuses(supabase, propertyIds);
    return "No active leases found. Create an active lease first.";
  }

  const dueDatesByLeaseId = buildDueDatesByLeaseId(leaseRows, todayIso);
  if (dueDatesByLeaseId.size === 0) {
    await updateLeaseStatuses(supabase, propertyIds);
    return "No billable dates available for active leases.";
  }

  const leaseIds = leaseRows.map((lease) => lease.id);
  const targetDueDates = Array.from(new Set(Array.from(dueDatesByLeaseId.values()).flat()));
  const { data: existingCharges, error: existingChargesError } = await supabase
    .from("rent_charges")
    .select("lease_id, due_date")
    .in("lease_id", leaseIds)
    .in("due_date", targetDueDates)
    .eq("category", "rent");
  if (existingChargesError) {
    throw existingChargesError;
  }

  const existingKey = new Set(
    ((existingCharges ?? []) as ExistingChargeRow[]).map((charge) => `${charge.lease_id}::${charge.due_date}`)
  );

  const inserts = leaseRows.flatMap((lease) =>
    (dueDatesByLeaseId.get(lease.id) ?? [])
      .filter((dueDate) => !existingKey.has(`${lease.id}::${dueDate}`))
      .map((dueDate) => ({
        lease_id: lease.id,
        due_date: dueDate,
        amount_cents: lease.monthly_rent_cents,
        status: "pending" as const,
        category: "rent" as const
      }))
  );

  if (inserts.length > 0) {
    const { error } = await supabase.from("rent_charges").insert(inserts);
    if (error) throw error;
  }
  await applyLateFeesToOverdueCharges(supabase, leaseIds, todayIso);
  await updateLeaseStatuses(supabase, propertyIds);
  return inserts.length > 0
    ? `Generated ${inserts.length} new charge${inserts.length === 1 ? "" : "s"}.`
    : "No new charges generated (already up to date).";
}

export async function generateMonthlyChargesForOwner(ownerUserId: string): Promise<string> {
  const propertyIds = await getAdministeredPropertyIds(ownerUserId);
  return generateMonthlyChargesForPropertyIdsWithClient(createClient(), propertyIds);
}
