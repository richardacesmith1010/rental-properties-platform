import type { SupabaseClient } from "@supabase/supabase-js";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  createNotificationWithDelivery,
  notifyOwnerMembersForProperty
} from "@/lib/notifications";

function differenceInDays(fromDate: string, toDate: string) {
  const from = new Date(`${fromDate}T00:00:00.000Z`);
  const to = new Date(`${toDate}T00:00:00.000Z`);
  return Math.floor((to.getTime() - from.getTime()) / 86400000);
}

export async function sendDelinquencyEscalations(supabase: SupabaseClient): Promise<string> {
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const recentThreshold = new Date(today);
  recentThreshold.setUTCDate(recentThreshold.getUTCDate() - 30);

  const { data: charges, error: chargesError } = await supabase
    .from("rent_charges")
    .select("id, lease_id, due_date, amount_cents, status")
    .in("status", ["pending", "late"])
    .lte("due_date", todayIso);
  if (chargesError) {
    throw chargesError;
  }

  const candidates = ((charges ?? []) as Array<{
    id: string;
    lease_id: string;
    due_date: string;
    amount_cents: number;
    status: string;
  }>)
    .map((charge) => ({ ...charge, daysPastDue: differenceInDays(charge.due_date, todayIso) }))
    .filter((charge) => charge.daysPastDue >= 30);

  if (candidates.length === 0) {
    return "Delinquency escalations sent: 0.";
  }

  const { data: existingNotifications, error: existingError } = await supabase
    .from("notifications")
    .select("entity_id")
    .eq("type", "delinquency_escalation")
    .eq("entity_type", "rent_charge")
    .in("entity_id", candidates.map((charge) => charge.id))
    .gte("created_at", recentThreshold.toISOString());
  if (existingError) {
    throw existingError;
  }

  const alreadySent = new Set(
    ((existingNotifications ?? []) as Array<{ entity_id: string | null }>)
      .map((row) => row.entity_id)
      .filter((entityId): entityId is string => Boolean(entityId))
  );

  const leaseIds = Array.from(new Set(candidates.map((charge) => charge.lease_id)));
  const { data: leases, error: leasesError } = await supabase
    .from("leases")
    .select("id, unit_id, tenant_profile_id")
    .in("id", leaseIds);
  if (leasesError) {
    throw leasesError;
  }

  const leaseById = new Map(
    ((leases ?? []) as Array<{ id: string; unit_id: string; tenant_profile_id: string | null }>).map((lease) => [lease.id, lease])
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
    ? await supabase.from("profiles").select("id, email").in("id", tenantIds)
    : { data: [] as Array<{ id: string; email: string | null }>, error: null };
  if (profilesError) {
    throw profilesError;
  }

  const profileById = new Map(((profiles ?? []) as Array<{ id: string; email: string | null }>).map((profile) => [profile.id, profile]));

  const work = candidates.filter((charge) => !alreadySent.has(charge.id)).map(async (charge) => {
    const lease = leaseById.get(charge.lease_id);
    const unit = lease ? unitById.get(lease.unit_id) : null;
    const property = unit ? propertyById.get(unit.property_id) : null;
    const tenantProfile = lease?.tenant_profile_id ? profileById.get(lease.tenant_profile_id) ?? null : null;
    if (!lease?.tenant_profile_id || !unit || !property) {
      return 0;
    }

    const stage = charge.daysPastDue >= 90 ? "final" : charge.daysPastDue >= 60 ? "urgent" : "friendly";
    const title =
      stage === "final"
        ? "Final Delinquency Notice"
        : stage === "urgent"
          ? "Urgent Rent Delinquency Notice"
          : "Friendly Rent Reminder";
    const body =
      stage === "final"
        ? `Your balance of ${formatCurrency(charge.amount_cents)} for Unit ${unit.unit_number} is more than 90 days overdue. Please resolve it immediately.`
        : stage === "urgent"
          ? `Your balance of ${formatCurrency(charge.amount_cents)} for Unit ${unit.unit_number} is now more than 60 days overdue. Please pay as soon as possible.`
          : `Your balance of ${formatCurrency(charge.amount_cents)} for Unit ${unit.unit_number} is now 30 days overdue. Please pay when you can to avoid further escalation.`;

    const notifications = [
      createNotificationWithDelivery({
        recipientProfileId: lease.tenant_profile_id,
        recipientEmail: tenantProfile?.email ?? null,
        type: "delinquency_escalation",
        title,
        body,
        entityType: "rent_charge",
        entityId: charge.id,
        propertyId: unit.property_id
      })
    ];

    if (stage === "final") {
      notifications.push(
        notifyOwnerMembersForProperty({
          propertyId: unit.property_id,
          type: "delinquency_escalation",
          title: "Final Delinquency Notice Sent",
          body: `Unit ${unit.unit_number} at ${property.name} is more than 90 days delinquent.`,
          entityType: "rent_charge",
          entityId: charge.id
        })
      );
    }

    await Promise.all(notifications);

    return 1;
  });

  const results = await Promise.all(work);
  return `Delinquency escalations sent: ${results.reduce<number>((sum, value) => sum + value, 0)}.`;
}

export async function sendRentDueReminders(supabase: SupabaseClient): Promise<string> {
  const targetDate = new Date();
  targetDate.setUTCDate(targetDate.getUTCDate() + 3);
  const targetDueDateIso = targetDate.toISOString().slice(0, 10);

  const { data: charges, error: chargesError } = await supabase
    .from("rent_charges")
    .select("id, lease_id, due_date, amount_cents")
    .eq("status", "pending")
    .eq("category", "rent")
    .eq("due_date", targetDueDateIso);
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
    return "Reminders sent: 0.";
  }

  const leaseIds = Array.from(new Set(pendingCharges.map((charge) => charge.lease_id)));
  const { data: leases, error: leasesError } = await supabase
    .from("leases")
    .select("id, tenant_profile_id")
    .in("id", leaseIds);
  if (leasesError) {
    throw leasesError;
  }

  const leaseById = new Map(
    ((leases ?? []) as Array<{ id: string; tenant_profile_id: string | null }>).map((lease) => [lease.id, lease])
  );
  const tenantIds = Array.from(
    new Set(Array.from(leaseById.values()).map((lease) => lease.tenant_profile_id).filter((id): id is string => Boolean(id)))
  );
  const { data: profiles, error: profilesError } = tenantIds.length
    ? await supabase.from("profiles").select("id, email").in("id", tenantIds)
    : { data: [] as Array<{ id: string; email: string | null }>, error: null };
  if (profilesError) {
    throw profilesError;
  }

  const profileById = new Map(((profiles ?? []) as Array<{ id: string; email: string | null }>).map((profile) => [profile.id, profile]));

  await Promise.all(
    pendingCharges.map(async (charge) => {
      const tenantId = leaseById.get(charge.lease_id)?.tenant_profile_id;
      if (!tenantId) {
        return;
      }

      const profile = profileById.get(tenantId);
      await createNotificationWithDelivery({
        recipientProfileId: tenantId,
        recipientEmail: profile?.email ?? null,
        type: "rent_due_reminder",
        title: "Rent Due Soon",
        body: `Your rent of ${formatCurrency(charge.amount_cents)} is due on ${formatDate(charge.due_date)}. Pay now to keep your streak going!`,
        entityType: "rent_charge",
        entityId: charge.id
      });
    })
  );

  return `Reminders sent: ${pendingCharges.length}.`;
}
