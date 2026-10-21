import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { sendNotificationEmail, insertDeliveryRecord } from "@/lib/notification-email";
import { createAdminClient } from "@/lib/supabase/admin";
import { ANNOUNCEMENT_NOTIFICATION_TYPE } from "@/lib/announcements";
import { buildNotificationEmail } from "@/lib/email-templates";
import { shouldRecordSuccessfulDelivery } from "@/lib/idempotency";
import {
  DEFAULT_NOTIFICATION_EMAIL_PREFERENCES,
  mergeDeliveryPreferences,
  resolveNotificationDeliveryPreference,
  resolveTenantDeliveryPreference,
  type NotificationDeliveryPreference
} from "@/lib/notification-preferences";
import {
  getPrimaryNotificationAction,
  toAbsoluteNotificationUrl,
  type NotificationRecipientRole
} from "@/lib/notification-actions";
import { notificationMode, notificationAllowlist, isNotificationRecipientAllowed } from "@/lib/notifications-switch";
export {
  formatRelativeNotificationTime,
  getNotificationActionLink,
  groupNotificationsByRecency
} from "@/lib/notification-feed";
export type { GroupedNotifications, NotificationActionLink } from "@/lib/notification-feed";

export type NotificationType =
  | "new_ticket"
  | "late_rent"
  | "ticket_resolved"
  | "payment_recorded"
  | "lease_updated"
  | "document_sent"
  | "document_signed"
  | "application_reviewed"
  | "rent_due_reminder"
  | "invite_accepted"
  | "owner_message"
  | "lease_expiring_soon"
  | "lease_expired"
  | "delinquency_escalation"
  | "distribution_change_requested"
  | "distribution_change_approved"
  | "distribution_change_rejected"
  | "withdrawal_requested"
  | "withdrawal_approved"
  | "withdrawal_rejected"
  | "withdrawal_completed"
  | typeof ANNOUNCEMENT_NOTIFICATION_TYPE;

export interface NotificationDTO {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  entityType: string;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

interface NotificationEmailContent {
  subject: string;
  text: string;
  html?: string;
}

export async function getNotificationsForUser(userId: string, limit = 20): Promise<NotificationDTO[]> {
  const supabase = createClient();

  const { data } = await supabase
    .from("notifications")
    .select("id, type, title, body, entity_type, entity_id, read_at, created_at")
    .eq("recipient_profile_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => ({
    id: row.id,
    type: row.type as NotificationType,
    title: row.title,
    body: row.body,
    entityType: row.entity_type,
    entityId: row.entity_id,
    readAt: row.read_at,
    createdAt: row.created_at
  }));
}

export async function markNotificationReadForUser(
  supabase: SupabaseClient,
  userId: string,
  notificationId: string
) {
  return supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("recipient_profile_id", userId);
}

export async function markAllNotificationsReadForUser(
  supabase: SupabaseClient,
  userId: string
) {
  return supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_profile_id", userId)
    .is("read_at", null);
}

interface CreateNotificationParams {
  recipientProfileId: string;
  recipientEmail?: string | null;
  recipientRole?: NotificationRecipientRole;
  type: NotificationType;
  title: string;
  body: string;
  entityType: string;
  entityId?: string | null;
  propertyId?: string | null;
  actorProfileId?: string | null;
  emailContent?: NotificationEmailContent;
  deliveryPreference?: NotificationDeliveryPreference;
  emailMode?: "default" | "never";
  emailKey?: string;
}

function buildNotificationPlainText(params: {
  title: string;
  body: string;
  ctaText: string;
  ctaUrl: string;
}) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://domusbase.com";

  return [
    params.title,
    "",
    params.body,
    "",
    `${params.ctaText}: ${params.ctaUrl}`,
    "",
    `Manage notification preferences: ${appUrl}/settings`
  ].join("\n");
}

export type NotificationSkipReason =
  | "off" | "test_not_allowed" | "preferences" | "paused" | "self" | "duplicate" | "error";
export interface NotificationDeliveryResult {
  inApp: { status: "sent" | "skipped"; reason?: NotificationSkipReason };
  email: { status: "sent" | "failed" | "skipped"; reason?: NotificationSkipReason };
}

function skipped(reason: NotificationSkipReason): NotificationDeliveryResult {
  return { inApp: { status: "skipped", reason }, email: { status: "skipped", reason } };
}

export async function createNotificationWithDelivery(
  params: CreateNotificationParams
): Promise<NotificationDeliveryResult> {
  if (params.emailKey !== undefined && !/^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$/.test(params.emailKey)) {
    throw new TypeError("Invalid email key");
  }
  const mode = notificationMode();
  if (mode === "off") return skipped("off");
  if (params.actorProfileId && params.actorProfileId === params.recipientProfileId) return skipped("self");

  try {
    const admin = createAdminClient();
    const { data: canonicalProfile, error: profileError } = await admin.from("profiles")
      .select("email, role, notification_preferences, notifications_paused_until")
      .eq("id", params.recipientProfileId).maybeSingle();
    if (profileError) {
      console.error(`[notifications] profile_lookup: ${profileError.code ?? "unknown"}`);
      return skipped("error");
    }
    const recipientEmail = canonicalProfile?.email ?? null;
    if (mode === "test" && !isNotificationRecipientAllowed(mode, recipientEmail, notificationAllowlist())) {
      return skipped("test_not_allowed");
    }
    const hasCurrentSettings = canonicalProfile && "notification_preferences" in canonicalProfile;
    const currentPreference = hasCurrentSettings
      ? resolveTenantDeliveryPreference(canonicalProfile, params.type)
      : resolveNotificationDeliveryPreference({
          preferences: { ...DEFAULT_NOTIFICATION_EMAIL_PREFERENCES }, pausedUntil: null, schemaReady: false
        }, params.type);
    const preference = params.deliveryPreference
      ? hasCurrentSettings
        ? mergeDeliveryPreferences(params.deliveryPreference, currentPreference)
        : params.deliveryPreference
      : currentPreference;
    const inApp: NotificationDeliveryResult["inApp"] = preference.inAppEnabled
      ? { status: "skipped", reason: "error" }
      : { status: "skipped", reason: "preferences" };
    const email: NotificationDeliveryResult["email"] = preference.emailEnabled && params.emailMode !== "never"
      ? { status: "skipped", reason: "error" }
      : {
          status: "skipped",
          reason: preference.emailBlockReason?.includes("paused") ? "paused" : "preferences"
        };
    if (!preference.inAppEnabled && (!preference.emailEnabled || params.emailMode === "never")) {
      return { inApp, email };
    }

    const profileRole = canonicalProfile?.role;
    const recipientRole: NotificationRecipientRole = params.recipientRole ??
      (profileRole === "owner" || profileRole === "manager" || profileRole === "tenant" ? profileRole : "owner");
    const { data: notification, error: upsertError } = await admin.from("notifications")
      .upsert({
        recipient_profile_id: params.recipientProfileId,
        type: params.type,
        title: params.title,
        body: params.body,
        entity_type: params.entityType,
        entity_id: params.entityId ?? null
      }, { onConflict: "recipient_profile_id,type,entity_type,entity_id" })
      .select("id").single();
    if (upsertError || !notification) {
      console.error(`[notifications] upsert: ${upsertError?.code ?? "missing_row"}`);
      return { inApp, email };
    }

    if (preference.inAppEnabled) {
      const { data: rows, error: lookupError } = await admin.from("notification_deliveries")
        .select("channel, status").eq("notification_id", notification.id);
      if (lookupError) {
        console.error(`[notifications] in_app_lookup: ${lookupError.code ?? "unknown"}`);
      } else if (!shouldRecordSuccessfulDelivery(rows ?? [], "in_app")) {
        inApp.reason = "duplicate";
      } else if (await insertDeliveryRecord(admin, {
        notification_id: notification.id, channel: "in_app", status: "sent"
      })) {
        inApp.status = "sent";
        delete inApp.reason;
      }
    }

    if (preference.emailEnabled && params.emailMode !== "never") {
      const primaryAction = getPrimaryNotificationAction({
        type: params.type,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        title: params.title,
        body: params.body
      }, recipientRole) ?? { label: "Open Domus", href: "/", variant: "default" };
      const ctaUrl = toAbsoluteNotificationUrl(primaryAction.href);
      const emailContent = params.emailContent ?? {
        subject: params.title,
        text: buildNotificationPlainText({
          title: params.title, body: params.body, ctaText: primaryAction.label, ctaUrl
        }),
        html: buildNotificationEmail({
          title: params.title, body: params.body, ctaText: primaryAction.label,
          ctaUrl, preheaderText: params.title
        })
      };
      const outcome = await sendNotificationEmail(admin, {
        notificationId: notification.id,
        emailKey: params.emailKey,
        to: recipientEmail,
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html
      });
      email.status = outcome.status;
      if (outcome.reason) email.reason = outcome.reason;
      else delete email.reason;
    }
    return { inApp, email };
  } catch (error) {
    console.error(`[notifications] delivery: ${error instanceof Error ? error.name : "unknown"}`);
    return skipped("error");
  }
}

export {
  notifyPropertyTeam,
  notifyOwnerOfStripeIssue,
  notifyAccountMembers,
  notifyOwnerMembersOfAcceptedTenantInvite
} from "@/lib/notification-fanout";
