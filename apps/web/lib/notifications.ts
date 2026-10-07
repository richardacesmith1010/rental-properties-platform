import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { sendNotificationEmail, insertDeliveryRecord } from "@/lib/notification-email";
import { createAdminClient } from "@/lib/supabase/admin";
import { ANNOUNCEMENT_NOTIFICATION_TYPE } from "@/lib/announcements";
import { buildNotificationEmail } from "@/lib/email-templates";
import { shouldRecordSuccessfulDelivery } from "@/lib/idempotency";
import {
  getNotificationPreference,
  type NotificationDeliveryPreference
} from "@/lib/notification-preferences";
import {
  getPrimaryNotificationAction,
  toAbsoluteNotificationUrl,
  type NotificationRecipientRole
} from "@/lib/notification-actions";
import { notificationsEnabled } from "@/lib/notifications-switch";
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

async function resolveRecipientRole(
  admin: SupabaseClient,
  recipientProfileId: string,
  providedRole?: NotificationRecipientRole
): Promise<NotificationRecipientRole> {
  if (providedRole) {
    return providedRole;
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", recipientProfileId)
    .maybeSingle();

  return profile?.role === "owner" || profile?.role === "manager" || profile?.role === "tenant"
    ? profile.role
    : "owner";
}

export async function createNotificationWithDelivery(params: CreateNotificationParams) {
  if (!notificationsEnabled()) {
    console.info(`[notifications] off: skipped ${params.type}`);
    return;
  }

  try {
    const admin = createAdminClient();
    const preference =
      params.deliveryPreference ??
      (await getNotificationPreference(params.recipientProfileId, params.type));
    const shouldCreateInApp = preference.inAppEnabled;
    const shouldSendEmail = preference.emailEnabled;

    if (!shouldCreateInApp && !shouldSendEmail) {
      return;
    }

    let notificationId: string | null = null;
    let deliveryRows: Array<{
      channel: "in_app" | "email";
      status: "pending" | "sent" | "failed";
    }> = [];

    if (shouldCreateInApp) {
      const { data: notification, error } = await admin
        .from("notifications")
        .upsert(
          {
            recipient_profile_id: params.recipientProfileId,
            type: params.type,
            title: params.title,
            body: params.body,
            entity_type: params.entityType,
            entity_id: params.entityId ?? null
          },
          { onConflict: "recipient_profile_id,type,entity_type,entity_id" }
        )
        .select("id")
        .single();

      if (error || !notification) {
        return;
      }

      notificationId = notification.id;

      const { data: existingDeliveries } = await admin
        .from("notification_deliveries")
        .select("channel, status")
        .eq("notification_id", notification.id);

      deliveryRows = (existingDeliveries ?? []).map((row) => ({
        channel: row.channel as "in_app" | "email",
        status: row.status as "pending" | "sent" | "failed"
      }));

      if (shouldRecordSuccessfulDelivery(deliveryRows, "in_app")) {
        await insertDeliveryRecord(admin, {
          notification_id: notification.id,
          channel: "in_app",
          status: "sent"
        });
      }
    }

    let emailResult: {
      status: "sent" | "failed";
      providerRef: string | null;
      errorMessage: string | null;
    } | null = null;

    if (
      !shouldSendEmail &&
      params.recipientEmail &&
      preference.emailBlockReason
    ) {
      // Email delivery skipped — preference or pause active
    }

    if (shouldSendEmail && shouldRecordSuccessfulDelivery(deliveryRows, "email")) {
      const recipientRole = await resolveRecipientRole(
        admin,
        params.recipientProfileId,
        params.recipientRole
      );
      const primaryAction =
        getPrimaryNotificationAction(
          {
            type: params.type,
            entityType: params.entityType,
            entityId: params.entityId ?? null,
            title: params.title,
            body: params.body
          },
          recipientRole
        ) ?? {
          label: "Open Domus",
          href: "/",
          variant: "default"
        };
      const ctaUrl = toAbsoluteNotificationUrl(primaryAction.href);
      const emailContent = params.emailContent ?? {
        subject: params.title,
        text: buildNotificationPlainText({
          title: params.title,
          body: params.body,
          ctaText: primaryAction.label,
          ctaUrl
        }),
        html: buildNotificationEmail({
          title: params.title,
          body: params.body,
          ctaText: primaryAction.label,
          ctaUrl,
          preheaderText: params.title
        })
      };

      emailResult = await sendNotificationEmail({
        to: params.recipientEmail,
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html
      });
    }

    if (emailResult && notificationId) {
      await insertDeliveryRecord(admin, {
        notification_id: notificationId,
        channel: "email",
        status: emailResult.status,
        provider_ref: emailResult.providerRef,
        error_message: emailResult.errorMessage
      });
    }
  } catch (error) {
    console.error("Failed to create notification delivery records:", error);
  }
}


export {
  notifyOwnerMembersForProperty,
  notifyOwnerOfStripeIssue,
  notifyAccountMembers,
  notifyOwnerMembersOfAcceptedTenantInvite
} from "@/lib/notification-fanout";
