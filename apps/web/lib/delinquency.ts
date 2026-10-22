import { addDays, daysBetween, todayDenver } from "@/lib/denver-calendar";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatCurrency, formatDate, formatUnitLabel } from "@/lib/format";
import { buildRentReminderEmail } from "@/lib/email-templates";
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
import { notificationsEnabled } from "@/lib/notifications-switch";
import { tenantEligibleForEvent } from "@/lib/notification-policy";
import { getClientHomeFlags, tracksLateRent } from "@/lib/lease-collection";

function getTenantDashboardUrl() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://domusbase.com";
  return `${baseUrl}/tenant?section=charges`;
}

function getTenantDisplayName(profile: { full_name?: string | null; email?: string | null } | null) {
  const fullName = profile?.full_name?.trim();
  if (fullName) {
    return fullName.split(/\s+/)[0] ?? fullName;
  }

  return profile?.email ?? "there";
}

export async function sendDelinquencyEscalations(supabase: SupabaseClient): Promise<string> {
  if (!notificationsEnabled()) {
    return summarizeNotificationResults("Overdue rent follow-ups", []);
  }

  const todayIso = todayDenver();

  const { data: charges, error: chargesError } = await supabase
    .from("rent_charges")
    .select("id, lease_id, due_date, amount_cents, status")
    .in("status", ["pending", "late"])
    .lte("due_date", todayIso)
    .is("deleted_at", null);
  if (chargesError) {
    throw chargesError;
  }

  let candidates = ((charges ?? []) as Array<{
    id: string;
    lease_id: string;
    due_date: string;
    amount_cents: number;
    status: string;
  }>)
    .map((charge) => ({ ...charge, daysPastDue: daysBetween(charge.due_date, todayIso) }))
    .filter((charge) => charge.daysPastDue >= 30);

  if (candidates.length === 0) {
    return summarizeNotificationResults("Overdue rent follow-ups", []);
  }

  const leaseIds = Array.from(new Set(candidates.map((charge) => charge.lease_id)));
  const { data: leases, error: leasesError } = await supabase
    .from("leases")
    .select("id, unit_id, tenant_profile_id, collects_outside_domus")
    .in("id", leaseIds);
  if (leasesError) {
    throw leasesError;
  }

  const leaseById = new Map(
    ((leases ?? []) as Array<{
      id: string;
      unit_id: string;
      tenant_profile_id: string | null;
      collects_outside_domus: boolean;
    }>).map((lease) => [lease.id, lease])
  );
  const unitIds = Array.from(new Set((leases ?? []).map((lease) => lease.unit_id)));
  const { data: units, error: unitsError } = await supabase
    .from("units")
    .select("id, property_id, unit_number")
    .in("id", unitIds);
  if (unitsError) {
    throw unitsError;
  }

  const unitById = new Map(
    ((units ?? []) as Array<{ id: string; property_id: string; unit_number: string }>).map((unit) => [unit.id, unit])
  );
  const propertyIds = Array.from(new Set((units ?? []).map((unit) => unit.property_id)));
  const clientFlags = await getClientHomeFlags(supabase, propertyIds);
  candidates = candidates.filter((charge) => {
    const lease = leaseById.get(charge.lease_id);
    const propertyId = lease ? unitById.get(lease.unit_id)?.property_id : null;
    return tracksLateRent({
      ...lease, clientHome: propertyId ? clientFlags.get(propertyId) === true : false
    });
  });
  if (candidates.length === 0) return summarizeNotificationResults("Overdue rent follow-ups", []);
  const { data: properties, error: propertiesError } = await supabase
    .from("properties")
    .select("id, name")
    .in("id", propertyIds);
  if (propertiesError) {
    throw propertiesError;
  }

  const propertyById = new Map(((properties ?? []) as Array<{ id: string; name: string }>).map((property) => [property.id, property]));
  const tenantIds = Array.from(
    new Set((leases ?? []).map((lease) => lease.tenant_profile_id).filter((id): id is string => Boolean(id)))
  );
  const { data: profiles, error: profilesError } = tenantIds.length
    ? await supabase.from("profiles")
        .select("id, email, full_name, notification_preferences, notifications_paused_until")
        .in("id", tenantIds)
    : { data: [] as Array<{
      id: string; email: string | null; full_name: string | null;
      notification_preferences?: unknown; notifications_paused_until?: string | null;
    }>, error: null };
  if (profilesError) {
    throw profilesError;
  }

  const profileById = new Map(
    ((profiles ?? []) as Array<{
      id: string; email: string | null; full_name: string | null;
      notification_preferences?: unknown; notifications_paused_until?: string | null;
    }>).map((profile) => [profile.id, profile])
  );
  const deliveryByPropertyId = await getPropertyNotificationDeliveryPreferences(
    supabase,
    propertyIds,
    "delinquency_escalation"
  );

  const work = candidates.map(async (charge) => {
    const lease = leaseById.get(charge.lease_id);
    const unit = lease ? unitById.get(lease.unit_id) : null;
    const property = unit ? propertyById.get(unit.property_id) : null;
    const tenantProfile = lease?.tenant_profile_id ? profileById.get(lease.tenant_profile_id) ?? null : null;
    if (!lease || !unit || !property) {
      return null;
    }

    const stage = charge.daysPastDue >= 90 ? "final" : charge.daysPastDue >= 60 ? "urgent" : "friendly";
    const title =
      stage === "final"
        ? "Final Overdue Rent Notice"
        : stage === "urgent"
          ? "Urgent Overdue Rent Notice"
          : "Friendly Rent Reminder";
    const unitLabel = formatUnitLabel(unit.unit_number);
    const body =
      stage === "final"
        ? `Your balance of ${formatCurrency(charge.amount_cents)} for ${unitLabel} ` +
          "is more than 90 days overdue. Please resolve it immediately."
        : stage === "urgent"
          ? `Your balance of ${formatCurrency(charge.amount_cents)} for ${unitLabel} ` +
            "is now more than 60 days overdue. Please pay as soon as possible."
          : `Your balance of ${formatCurrency(charge.amount_cents)} for ${unitLabel} ` +
            "is now 30 days overdue. Please pay when you can to avoid further escalation.";
    const reminderEmail = buildRentReminderEmail({
      tenantName: getTenantDisplayName(tenantProfile),
      amountFormatted: formatCurrency(charge.amount_cents),
      dueDate: formatDate(charge.due_date),
      propertyName: property.name,
      type: "overdue",
      dashboardUrl: getTenantDashboardUrl()
    });

    const notifications: Promise<unknown>[] = [];
    if (lease.tenant_profile_id &&
      tenantEligibleForEvent("overdue_followup", lease.collects_outside_domus)) notifications.push(
      createNotificationWithDelivery({
        recipientProfileId: lease.tenant_profile_id,
        recipientEmail: tenantProfile?.email ?? null,
        type: "delinquency_escalation",
        title,
        body,
        entityType: "rent_charge",
        entityId: charge.id,
        propertyId: unit.property_id,
        emailContent: reminderEmail,
        emailKey: `overdue-${charge.daysPastDue >= 90 ? 90 : charge.daysPastDue >= 60 ? 60 : 30}`,
        deliveryPreference: mergeDeliveryPreferences(
          deliveryByPropertyId.get(unit.property_id) ?? { emailEnabled: true, inAppEnabled: true },
          resolveTenantDeliveryPreference(tenantProfile, "delinquency_escalation")
        )
      })
    );

    notifications.push(
      notifyPropertyTeam({
          propertyId: unit.property_id,
          event: "overdue_followup",
          type: "delinquency_escalation",
          title: stage === "final" ? "Final Overdue Rent Notice Sent" : "Rent is late",
          body: stage === "final"
            ? `${unitLabel} at ${property.name} is more than 90 days overdue.`
            : `Rent due ${formatDate(charge.due_date)} is now late.`,
          entityType: "rent_charge",
          entityId: charge.id
      })
    );

    const results = await Promise.all(notifications);
    return results[0] && typeof results[0] === "object" && "inApp" in results[0]
      ? results[0] as Awaited<ReturnType<typeof createNotificationWithDelivery>> : null;
  });

  const results = await Promise.all(work);
  return summarizeNotificationResults("Overdue rent follow-ups", results);
}

export async function sendRentDueReminders(supabase: SupabaseClient): Promise<string> {
  if (!notificationsEnabled()) {
    return summarizeNotificationResults("Reminders", []);
  }

  const targetDueDateIso = addDays(todayDenver(), 3);

  const { data: charges, error: chargesError } = await supabase
    .from("rent_charges")
    .select("id, lease_id, due_date, amount_cents")
    .eq("status", "pending")
    .eq("category", "rent")
    .eq("due_date", targetDueDateIso)
    .is("deleted_at", null);
  if (chargesError) {
    throw chargesError;
  }

  const pendingCharges = (charges ?? []) as Array<{
    id: string;
    lease_id: string;
    due_date: string;
    amount_cents: number;
  }>;
  if (pendingCharges.length === 0) {
    return summarizeNotificationResults("Reminders", []);
  }

  const leaseIds = Array.from(new Set(pendingCharges.map((charge) => charge.lease_id)));
  const { data: leases, error: leasesError } = await supabase
    .from("leases")
    .select("id, tenant_profile_id, unit_id, collects_outside_domus")
    .in("id", leaseIds);
  if (leasesError) {
    throw leasesError;
  }

  const leaseById = new Map(
    ((leases ?? []) as Array<{
      id: string; tenant_profile_id: string | null; unit_id: string;
      collects_outside_domus: boolean | null;
    }>).map((lease) => [lease.id, lease])
  );
  const unitIds = Array.from(new Set((leases ?? []).map((lease) => lease.unit_id)));
  const { data: units, error: unitsError } = unitIds.length
    ? await supabase
        .from("units")
        .select("id, property_id, unit_number")
        .in("id", unitIds)
    : { data: [] as Array<{ id: string; property_id: string; unit_number: string }>, error: null };
  if (unitsError) {
    throw unitsError;
  }

  const unitById = new Map(
    ((units ?? []) as Array<{ id: string; property_id: string; unit_number: string }>).map((unit) => [unit.id, unit])
  );
  const propertyIds = Array.from(new Set((units ?? []).map((unit) => unit.property_id)));
  const { data: properties, error: propertiesError } = propertyIds.length
    ? await supabase
        .from("properties")
        .select("id, name")
        .in("id", propertyIds)
    : { data: [] as Array<{ id: string; name: string }>, error: null };
  if (propertiesError) {
    throw propertiesError;
  }

  const propertyById = new Map(
    ((properties ?? []) as Array<{ id: string; name: string }>).map((property) => [property.id, property])
  );
  const tenantIds = Array.from(
    new Set(Array.from(leaseById.values()).map((lease) => lease.tenant_profile_id).filter((id): id is string => Boolean(id)))
  );
  const { data: profiles, error: profilesError } = tenantIds.length
    ? await supabase.from("profiles")
        .select("id, email, full_name, notification_preferences, notifications_paused_until")
        .in("id", tenantIds)
    : { data: [] as Array<{
      id: string; email: string | null; full_name: string | null;
      notification_preferences?: unknown; notifications_paused_until?: string | null;
    }>, error: null };
  if (profilesError) {
    throw profilesError;
  }

  const profileById = new Map(
    ((profiles ?? []) as Array<{
      id: string; email: string | null; full_name: string | null;
      notification_preferences?: unknown; notifications_paused_until?: string | null;
    }>).map((profile) => [profile.id, profile])
  );
  const deliveryByPropertyId = await getPropertyNotificationDeliveryPreferences(
    supabase,
    propertyIds,
    "rent_due_reminder"
  );

  const sent = await Promise.all(
    pendingCharges.map(async (charge) => {
      const lease = leaseById.get(charge.lease_id);
      const tenantId = lease?.tenant_profile_id;
      const unit = lease ? unitById.get(lease.unit_id) : null;
      const property = unit ? propertyById.get(unit.property_id) : null;

      if (!tenantId || !unit || !property || !tenantEligibleForEvent("rent_due_reminder", lease.collects_outside_domus)) {
        return null;
      }

      const profile = profileById.get(tenantId);
      const reminderEmail = buildRentReminderEmail({
        tenantName: getTenantDisplayName(profile ?? null),
        amountFormatted: formatCurrency(charge.amount_cents),
        dueDate: formatDate(charge.due_date),
        propertyName: property.name,
        type: "upcoming",
        dashboardUrl: getTenantDashboardUrl()
      });

      return createNotificationWithDelivery({
        recipientProfileId: tenantId,
        recipientEmail: profile?.email ?? null,
        type: "rent_due_reminder",
        title: "Rent Due Soon",
        body: `Your rent of ${formatCurrency(charge.amount_cents)} is due on ${formatDate(charge.due_date)}. Pay now so you stay on track.`,
        entityType: "rent_charge",
        entityId: charge.id,
        propertyId: unit.property_id,
        emailContent: reminderEmail,
        deliveryPreference: mergeDeliveryPreferences(
          deliveryByPropertyId.get(unit.property_id) ?? { emailEnabled: true, inAppEnabled: true },
          resolveTenantDeliveryPreference(profile, "rent_due_reminder")
        )
      });
    })
  );

  return summarizeNotificationResults("Reminders", sent);
}
