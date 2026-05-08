"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { formatCurrency, formatDate, formatUnitLabel } from "@/lib/format";
import { sideEffectError } from "@/lib/logger";
import {
  createNotificationWithDelivery,
  markAllNotificationsReadForUser,
  markNotificationReadForUser
} from "@/lib/notifications";
import { updateNotificationPreference } from "@/lib/notification-preferences";
import { getAdministeredPropertyIds } from "@/lib/property-access";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  markNotificationReadSchema,
  parseFormData,
  sendBatchPaymentReminderSchema,
  updateNotificationPreferenceSchema
} from "@/lib/validations";
import { requireAuth } from "./auth-helpers";
import { ensureCapabilityEnabled, type ActionState } from "./shared";

function revalidateNotificationPaths() {
  revalidatePath("/owner");
  revalidatePath("/tenant");
  revalidatePath("/manager");
}

async function updateSingleNotificationReadState(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user, supabase } = await requireAuth("owner", "manager", "tenant");
  if (!checkRateLimit(`markNotificationRead:${user.id}`, 60, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const capabilityError = await ensureCapabilityEnabled("notificationsEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = parseFormData(markNotificationReadSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { notificationId } = parsed.data;
  const { error } = await markNotificationReadForUser(supabase, user.id, notificationId);

  if (error) {
    return { success: false, error: "Failed to mark notification as read." };
  }

  revalidateNotificationPaths();
  return { success: true };
}

async function updateAllNotificationsReadState(
  _prev: ActionState,
  _formData: FormData
): Promise<ActionState> {
  const { user, supabase } = await requireAuth("owner", "manager", "tenant");
  if (!checkRateLimit(`markAllNotificationsRead:${user.id}`, 20, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const capabilityError = await ensureCapabilityEnabled("notificationsEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const { error } = await markAllNotificationsReadForUser(supabase, user.id);

  if (error) {
    return { success: false, error: "Failed to mark notifications as read." };
  }

  revalidateNotificationPaths();
  return { success: true, message: "All notifications cleared." };
}

export async function dismissNotification(
  prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return updateSingleNotificationReadState(prev, formData);
}

export async function markNotificationRead(
  prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return updateSingleNotificationReadState(prev, formData);
}

export async function clearAllNotifications(
  prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return updateAllNotificationsReadState(prev, formData);
}

export async function markAllNotificationsRead(
  prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return updateAllNotificationsReadState(prev, formData);
}

export async function saveNotificationPreference(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner", "manager", "tenant");
  if (!checkRateLimit(`saveNotificationPreference:${user.id}`, 30, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const parsed = parseFormData(updateNotificationPreferenceSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  try {
    await updateNotificationPreference(
      user.id,
      parsed.data.notificationType,
      parsed.data.emailEnabled ?? false,
      parsed.data.inAppEnabled ?? false
    );
  } catch {
    return { success: false, error: "Failed to update notification preference." };
  }

  revalidatePath("/settings");
  return { success: true, message: "Preference updated." };
}

export async function sendBatchPaymentReminder(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner");
  if (!checkRateLimit(`sendBatchPaymentReminder:${user.id}`, 10, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const capabilityError = await ensureCapabilityEnabled("notificationsEnabled");
  if (capabilityError) {
    return capabilityError;
  }

  const parsed = sendBatchPaymentReminderSchema.safeParse({
    chargeIds: formData
      .getAll("chargeIds")
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Select at least one charge."
    };
  }

  const chargeIds = Array.from(new Set(parsed.data.chargeIds));
  const admin = createAdminClient();
  const { data: charges, error: chargeError } = await admin
    .from("rent_charges")
    .select("id, lease_id, due_date, amount_cents")
    .in("id", chargeIds);

  if (chargeError) {
    return { success: false, error: "Unable to load the selected charges right now." };
  }

  if (!charges || charges.length !== chargeIds.length) {
    return { success: false, error: "Some selected charges could not be found." };
  }

  const leaseIds = Array.from(new Set(charges.map((charge) => charge.lease_id)));
  const { data: leases, error: leaseError } = await admin
    .from("leases")
    .select("id, tenant_profile_id, unit_id")
    .in("id", leaseIds);

  if (leaseError) {
    return { success: false, error: "Unable to load lease details for the selected charges." };
  }

  const leaseRows = leases ?? [];
  const unitIds = Array.from(new Set(leaseRows.map((lease) => lease.unit_id)));
  const { data: units, error: unitError } = await admin
    .from("units")
    .select("id, property_id, unit_number")
    .in("id", unitIds);

  if (unitError) {
    return { success: false, error: "Unable to load unit details for the selected charges." };
  }

  const unitRows = units ?? [];
  const propertyIds = Array.from(new Set(unitRows.map((unit) => unit.property_id)));
  const administeredPropertyIds = await getAdministeredPropertyIds(user.id);
  const hasUnauthorizedCharge = propertyIds.some(
    (propertyId) => !administeredPropertyIds.includes(propertyId)
  );

  if (hasUnauthorizedCharge) {
    return { success: false, error: "You do not have access to one or more selected charges." };
  }

  const { data: properties, error: propertyError } = await admin
    .from("properties")
    .select("id, name")
    .in("id", propertyIds);

  if (propertyError) {
    return { success: false, error: "Unable to load property details for the selected charges." };
  }

  const leaseById = new Map(leaseRows.map((lease) => [lease.id, lease]));
  const unitById = new Map(unitRows.map((unit) => [unit.id, unit]));
  const propertyById = new Map((properties ?? []).map((property) => [property.id, property]));
  const tenantProfileIds = Array.from(
    new Set(
      leaseRows
        .map((lease) => lease.tenant_profile_id)
        .filter((profileId): profileId is string => Boolean(profileId))
    )
  );
  const { data: tenantProfiles, error: tenantProfileError } = tenantProfileIds.length
    ? await admin
        .from("profiles")
        .select("id, email, role")
        .in("id", tenantProfileIds)
    : { data: [], error: null };

  if (tenantProfileError) {
    return { success: false, error: "Unable to load tenant contact details for reminders." };
  }

  const tenantProfileById = new Map((tenantProfiles ?? []).map((profile) => [profile.id, profile]));

  const notifications = charges.flatMap((charge) => {
    const lease = leaseById.get(charge.lease_id);
    const unit = lease ? unitById.get(lease.unit_id) : undefined;
    const property = unit ? propertyById.get(unit.property_id) : undefined;
    if (!lease?.tenant_profile_id || !unit) {
      return [];
    }

    return [
      {
        recipient_profile_id: lease.tenant_profile_id,
        type: "rent_due_reminder" as const,
        title: "Payment reminder",
        body: `${property?.name ?? "Your property"} • ${formatUnitLabel(unit.unit_number)}: ${formatCurrency(charge.amount_cents)} is due ${formatDate(charge.due_date)}.`,
        entity_type: "charge",
        entity_id: charge.id
      }
    ];
  });

  if (notifications.length === 0) {
    return { success: false, error: "Selected charges do not have eligible tenants for reminders." };
  }

  await Promise.all(
    notifications.map(async (notification) => {
      const tenantProfile = tenantProfileById.get(notification.recipient_profile_id);
      await createNotificationWithDelivery({
        recipientProfileId: notification.recipient_profile_id,
        recipientEmail: tenantProfile?.email ?? null,
        recipientRole:
          tenantProfile?.role === "tenant" || tenantProfile?.role === "owner" || tenantProfile?.role === "manager"
            ? tenantProfile.role
            : undefined,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        entityType: notification.entity_type,
        entityId: notification.entity_id
      });
    })
  );

  void logAudit({
    userId: user.id,
    action: "send_batch_payment_reminder",
    entityType: "charge",
    metadata: {
      chargeCount: notifications.length,
      chargeIds
    }
  }).catch(
    sideEffectError("sendBatchPaymentReminder", "log_audit", {
      userId: user.id,
      entityType: "charge"
    })
  );

  revalidatePath("/owner");
  revalidatePath("/tenant");
  return {
    success: true,
    message: `${notifications.length} reminder${notifications.length === 1 ? "" : "s"} sent.`
  };
}

/* ─── Phase 10: Automations + Inbox + Leasing ─── */
