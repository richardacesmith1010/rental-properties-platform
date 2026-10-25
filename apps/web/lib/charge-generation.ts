import { addDays, denverDateOf, denverMonth, todayDenver } from "@/lib/denver-calendar";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRentChargeWithLines } from "@/lib/charge-lines";
import { withChargeEditingFallback } from "@/lib/charge-audit";
import { automaticLateFeesEnabled } from "@/lib/late-fee-policy";
import { formatDate } from "@/lib/format";
import {
  createNotificationWithDelivery,
  notifyPropertyTeam
} from "@/lib/notifications";
import {
  getPropertyNotificationDeliveryPreferences,
  mergeDeliveryPreferences,
  resolveTenantDeliveryPreference
} from "@/lib/notification-preferences";
import { summarizeNotificationResults } from "@/lib/idempotency";
import { getAdministeredPropertyIds } from "@/lib/property-access";
import { tenantEligibleForEvent } from "@/lib/notification-policy";
import { getClientHomeFlags, isCollectedOutsideDomus, tracksLateRent } from "@/lib/lease-collection";
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
  late_fee_cents: number | null; lease_status: LeaseStatus; collects_outside_domus: boolean;
};

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
  const leaseCreatedIso = denverDateOf(lease.created_at);
  return dueDateIso >= leaseCreatedIso && dueDateIso >= lease.start_date && dueDateIso <= lease.end_date;
}

export function getCandidateMonths(baseDate: Date | string = todayDenver()) {
  const month = typeof baseDate === "string" ? baseDate.slice(0, 7) : denverMonth(baseDate);
  const [baseYear, calendarMonth] = month.split("-").map(Number);
  const baseMonth = calendarMonth - 1;
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
  const dueDatesByLeaseId = new Map<string, string[]>();
  for (const lease of leases) {
    const dueDates = getCandidateMonths(todayIso)
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
export function isPastGraceWindow(dueDateIso: string, gracePeriodDays: number, today: string | Date) {
  const todayIso = typeof today === "string" ? today : todayDenver(today);
  return todayIso > addDays(dueDateIso, gracePeriodDays);
}

export async function updateLeaseStatuses(supabase: SupabaseClient, propertyIds: string[]) {
  if (propertyIds.length === 0) {
    return;
  }

  const todayIso = todayDenver();
  const thirtyDaysFromNowIso = addDays(todayIso, 30);

  const { data: propertyUnits, error: unitsError } = await supabase.from("units").select("id").in("property_id", propertyIds);
  if (unitsError) throw unitsError;
  const unitIds = (propertyUnits ?? []).map((unit) => unit.id);
  if (unitIds.length === 0) {
    return;
  }

  const { data: activeLeases, error: leasesError } = await supabase
    .from("leases")
    .select("id, end_date, lease_status, active")
    .in("unit_id", unitIds)
    .eq("active", true);
  if (leasesError) throw leasesError;

  const expiringSoonLeaseIds: string[] = [];
  const expiredLeaseIds: string[] = [];
  for (const lease of (activeLeases ?? []) as Array<{ id: string; end_date: string; lease_status: LeaseStatus; active: boolean }>) {
    const status = lease.lease_status ?? "active";
    if (status === "terminated" || status === "renewed") {
      continue;
    }

    if (lease.end_date < todayIso) {
      expiredLeaseIds.push(lease.id);
      continue;
    }

    if (status === "active" && lease.end_date <= thirtyDaysFromNowIso) {
      expiringSoonLeaseIds.push(lease.id);
    }
  }

  if (expiringSoonLeaseIds.length > 0) {
    const { error } = await supabase
      .from("leases")
      .update({ lease_status: "expiring_soon", active: true })
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
  todayIso = todayDenver()
): Promise<string> {
  if (leaseIds.length === 0) {
    return summarizeNotificationResults("Late notices", []);
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
    return summarizeNotificationResults("Late notices", []);
  }
  const candidateLeaseIds = Array.from(new Set(candidateRows.map((charge) => charge.lease_id)));
  const { data: lateLeases, error: leaseError } = await supabase
    .from("leases")
    .select("id, tenant_profile_id, unit_id, grace_period_days, late_fee_cents, lease_status, collects_outside_domus")
    .in("id", candidateLeaseIds);
  if (leaseError) {
    throw leaseError;
  }
  const leaseById = new Map(((lateLeases ?? []) as LateLeaseRow[]).map((lease) => [lease.id, lease]));
  const unitIds = [...new Set((lateLeases ?? []).map((lease) => lease.unit_id))];
  const { data: units, error: unitError } = unitIds.length
    ? await supabase.from("units").select("id, property_id").in("id", unitIds)
    : { data: [] as UnitRow[], error: null };
  if (unitError) throw unitError;
  const latePropertyIdByUnitId = new Map((units ?? []).map((unit) => [unit.id, unit.property_id]));
  const clientFlags = await getClientHomeFlags(supabase, [...latePropertyIdByUnitId.values()]);
  const lateStatusChargeRows = candidateRows.filter((charge) => {
    const lease = leaseById.get(charge.lease_id);
    const propertyId = lease ? latePropertyIdByUnitId.get(lease.unit_id) : null;
    if (!lease || !tracksLateRent({
      ...lease, clientHome: propertyId ? clientFlags.get(propertyId) === true : false
    })) {
      return false;
    }
    return isPastGraceWindow(charge.due_date, lease.grace_period_days ?? 5, todayIso);
  });
  const feesEnabled = automaticLateFeesEnabled();
  let pausedFeeCount = 0;
  const lateFeeChargeRows = candidateRows.filter((charge) => {
    const lease = leaseById.get(charge.lease_id);
    if (!lease || isCollectedOutsideDomus(lease)) {
      return false;
    }
    const pastGrace = isPastGraceWindow(charge.due_date, lease.grace_period_days ?? 5, todayIso);
    if (!feesEnabled && pastGrace && (lease.late_fee_cents ?? 0) > 0) pausedFeeCount += 1;
    return feesEnabled && pastGrace;
  });
  if (pausedFeeCount > 0) {
    console.log("[late-fees] paused:", pausedFeeCount, "fee(s) not added");
  }
  if (lateStatusChargeRows.length === 0 && lateFeeChargeRows.length === 0) {
    return summarizeNotificationResults("Late notices", []);
  }
  const lateStatusChargeIds = lateStatusChargeRows.map((charge) => charge.id);
  if (lateStatusChargeIds.length > 0) {
    const { error: lateUpdateError } = await supabase
      .from("rent_charges")
      .update({ status: "late" })
      .in("id", lateStatusChargeIds)
      .in("status", ["pending"]);
    if (lateUpdateError) {
      throw lateUpdateError;
    }
  }
  const lateFeeChargeIds = lateFeeChargeRows.map((charge) => charge.id);
  const { data: existingLateFeeCharges, error: existingLateFeeError } = lateFeeChargeIds.length > 0
    ? await supabase
        .from("rent_charges")
        .select("id, parent_charge_id")
        .in("parent_charge_id", lateFeeChargeIds)
        .eq("category", "late_fee")
        .is("deleted_at", null)
    : { data: [] as Array<{ parent_charge_id: string | null }>, error: null };
  if (existingLateFeeError) {
    throw existingLateFeeError;
  }
  const lateFeesByParentChargeId = new Set(
    ((existingLateFeeCharges ?? []) as Array<{ parent_charge_id: string | null }>)
      .map((row) => row.parent_charge_id)
      .filter((value): value is string => Boolean(value))
  );
  const lateFeeInserts = lateFeeChargeRows
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
    .filter((row): row is {
      lease_id: string; due_date: string; amount_cents: number;
      status: "pending"; category: "late_fee"; parent_charge_id: string;
    } => row !== null);
  if (lateFeeInserts.length > 0) {
    const { error: lateFeeInsertError } = await supabase.from("rent_charges").insert(lateFeeInserts);
    if (lateFeeInsertError && lateFeeInsertError.code !== "23505") {
      throw lateFeeInsertError;
    }
  }

  const notificationChargeRows = lateStatusChargeRows;
  if (notificationChargeRows.length === 0) return summarizeNotificationResults("Late notices", []);
  const lateLeaseRows = Array.from(new Set(notificationChargeRows.map((charge) => charge.lease_id)))
    .map((leaseId) => leaseById.get(leaseId))
    .filter((lease): lease is LateLeaseRow => Boolean(lease));
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
    ? await supabase.from("profiles").select("id, email, notification_preferences, notifications_paused_until").in("id", tenantIds)
    : { data: [] as Array<{
      id: string; email: string | null; notification_preferences?: unknown;
      notifications_paused_until?: string | null;
    }>, error: null };
  if (profilesError) {
    throw profilesError;
  }

  const profileByTenantId = new Map(
    ((profiles ?? []) as Array<{
      id: string; email: string | null; notification_preferences?: unknown;
      notifications_paused_until?: string | null;
    }>)
      .map((profile) => [profile.id, profile])
  );
  const results = await Promise.all(
    notificationChargeRows.map(async (charge) => {
      const lease = leaseById.get(charge.lease_id);
      const propertyId = lease?.unit_id ? propertyIdByUnitId.get(lease.unit_id) ?? null : null;
      const notifications: Promise<unknown>[] = [];

      if (lease?.tenant_profile_id && tenantEligibleForEvent("late_fee", lease.collects_outside_domus)) {
        notifications.push(
          createNotificationWithDelivery({
            recipientProfileId: lease.tenant_profile_id,
            recipientEmail: profileByTenantId.get(lease.tenant_profile_id)?.email ?? null,
            type: "late_rent",
            title: "Rent payment overdue",
            body: `Your rent due ${formatDate(charge.due_date)} is now late.`,
            entityType: "rent_charge",
            entityId: charge.id,
            deliveryPreference: mergeDeliveryPreferences(
              propertyId
                ? propertyDeliveryPreferences.get(propertyId) ?? { emailEnabled: true, inAppEnabled: true }
                : { emailEnabled: true, inAppEnabled: true },
              resolveTenantDeliveryPreference(profileByTenantId.get(lease.tenant_profile_id), "late_rent")
            )
          })
        );
      }

      if (propertyId) {
        notifications.push(
          notifyPropertyTeam({
            propertyId,
            event: "late_fee",
            type: "late_rent",
            title: "Rent is late",
            body: `Rent due ${formatDate(charge.due_date)} is now late.`,
            entityType: "rent_charge",
            entityId: charge.id
          })
        );
      }

      const deliveries = await Promise.all(notifications);
      return deliveries[0] && typeof deliveries[0] === "object" && "inApp" in deliveries[0]
        ? deliveries[0] as Awaited<ReturnType<typeof createNotificationWithDelivery>> : null;
    })
  );

  return summarizeNotificationResults("Late notices", results);
}

export async function generateMonthlyChargesForPropertyIdsWithClient(
  supabase: SupabaseClient,
  propertyIds: string[]
): Promise<string> {
  const todayIso = todayDenver();
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
      "id, unit_id, tenant_profile_id, start_date, end_date, created_at, \
       due_day_of_month, monthly_rent_cents, grace_period_days, late_fee_cents, lease_status"
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
    .eq("category", "rent")
    .is("deleted_at", null);
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

  const admin = createAdminClient();
  let createdCount = 0;
  for (const charge of inserts) {
    if (await createRentChargeWithLines(admin, charge.lease_id, charge.due_date,
      charge.amount_cents)) createdCount += 1;
  }
  await applyLateFeesToOverdueCharges(supabase, leaseIds, todayIso);
  await updateLeaseStatuses(supabase, propertyIds);
  return createdCount > 0
    ? "Rent added for this month."
    : "Rent is already up to date.";
}

export async function generateMonthlyChargesForOwner(ownerUserId: string): Promise<string> {
  const propertyIds = await getAdministeredPropertyIds(ownerUserId);
  return generateMonthlyChargesForPropertyIdsWithClient(createClient(), propertyIds);
}
