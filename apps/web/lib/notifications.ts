import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ANNOUNCEMENT_NOTIFICATION_TYPE } from "@/lib/announcements";
import { buildNotificationEmail } from "@/lib/email-templates";
import { shouldRecordSuccessfulDelivery } from "@/lib/idempotency";
import { ensureInboxThreadForEvent } from "@/lib/inbox";
import {
  DEFAULT_NOTIFICATION_EMAIL_PREFERENCES,
  getNotificationPreference,
  getUserNotificationPreferenceSettingsMap,
  resolveNotificationDeliveryPreference,
  type NotificationDeliveryPreference,
  type NotificationPreferenceSettings
} from "@/lib/notification-preferences";
import {
  getPrimaryNotificationAction,
  toAbsoluteNotificationUrl,
  type NotificationRecipientRole
} from "@/lib/notification-actions";
import { isMissingSchemaError } from "@/lib/supabase-errors";
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
  | "achievement_unlocked"
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

function createFallbackNotificationSettings(): NotificationPreferenceSettings {
  return {
    preferences: { ...DEFAULT_NOTIFICATION_EMAIL_PREFERENCES },
    pausedUntil: null,
    schemaReady: false
  };
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

interface NotifyOwnerMembersParams {
  propertyId: string;
  type: NotificationType;
  title: string;
  body: string;
  entityType: string;
  entityId?: string | null;
  excludeProfileId?: string | null;
  actorProfileId?: string | null;
}

function shouldMirrorToInbox(type: NotificationType) {
  return type === "new_ticket" || type === "ticket_resolved" || type === "lease_updated";
}

export async function notifyOwnerMembersForProperty(params: NotifyOwnerMembersParams) {
  try {
    const admin = createAdminClient();

    if (shouldMirrorToInbox(params.type)) {
      await ensureInboxThreadForEvent({
        propertyId: params.propertyId,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        subject: params.title,
        messageBody: params.body,
        actorProfileId: params.actorProfileId ?? null
      });
    }

    const { data: property } = await admin
      .from("properties")
      .select("owner_account_id")
      .eq("id", params.propertyId)
      .single();

    if (!property?.owner_account_id) {
      return;
    }

    const { data: members } = await admin
      .from("ownership_account_members")
      .select("profile_id, can_receive_critical_alerts")
      .eq("account_id", property.owner_account_id)
      .eq("member_role", "owner")
      .eq("active", true);

    const recipientIds = (members ?? [])
      .filter((member) => member.can_receive_critical_alerts)
      .map((member) => member.profile_id)
      .filter((id) => id !== params.excludeProfileId);

    if (recipientIds.length === 0) {
      return;
    }

    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email, role")
      .in("id", recipientIds);

    const settingsByProfileId = await getUserNotificationPreferenceSettingsMap(
      recipientIds
    );

    for (const profile of profiles ?? []) {
      await createNotificationWithDelivery({
        recipientProfileId: profile.id,
        recipientEmail: profile.email,
        recipientRole:
          profile.role === "owner" || profile.role === "manager" || profile.role === "tenant"
            ? profile.role
            : undefined,
        type: params.type,
        title: params.title,
        body: params.body,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        deliveryPreference: resolveNotificationDeliveryPreference(
          settingsByProfileId.get(profile.id) ??
            createFallbackNotificationSettings(),
          params.type
        )
      });
    }
  } catch (error) {
    console.error("Failed to notify owner members:", error);
  }
}

interface NotifyAccountMembersParams {
  accountId: string;
  type: NotificationType;
  title: string;
  body: string;
  entityType: string;
  entityId?: string | null;
  excludeProfileId?: string | null;
}

export async function notifyAccountMembers(params: NotifyAccountMembersParams) {
  try {
    const admin = createAdminClient();
    const { data: members, error: membersError } = await admin
      .from("ownership_account_members")
      .select("profile_id")
      .eq("account_id", params.accountId)
      .eq("active", true);

    if (membersError) {
      if (!isMissingSchemaError(membersError)) {
        console.error("notifyAccountMembers member query error:", membersError);
      }
      return;
    }

    const recipientIds = (members ?? [])
      .map((member) => member.profile_id)
      .filter((profileId) => profileId !== params.excludeProfileId);

    if (recipientIds.length === 0) {
      return;
    }

    const { data: profiles, error: profilesError } = await admin
      .from("profiles")
      .select("id, email, role")
      .in("id", recipientIds);

    if (profilesError) {
      if (!isMissingSchemaError(profilesError)) {
        console.error("notifyAccountMembers profile query error:", profilesError);
      }
      return;
    }

    const settingsByProfileId = await getUserNotificationPreferenceSettingsMap(
      recipientIds
    );

    await Promise.all(
      (profiles ?? []).map((profile) =>
        createNotificationWithDelivery({
          recipientProfileId: profile.id,
          recipientEmail: profile.email,
          recipientRole:
            profile.role === "owner" || profile.role === "manager" || profile.role === "tenant"
              ? profile.role
              : undefined,
          type: params.type,
          title: params.title,
          body: params.body,
          entityType: params.entityType,
          entityId: params.entityId ?? null,
          deliveryPreference: resolveNotificationDeliveryPreference(
            settingsByProfileId.get(profile.id) ??
              createFallbackNotificationSettings(),
            params.type
          )
        })
      )
    );
  } catch (error) {
    console.error("Failed to notify account members:", error);
  }
}

export async function notifyOwnerMembersOfAcceptedTenantInvite(profileId: string) {
  try {
    const admin = createAdminClient();
    const { data: invitations } = await admin
      .from("invitations")
      .select("id, property_id, email, full_name")
      .eq("role", "tenant")
      .eq("status", "accepted")
      .eq("invited_profile_id", profileId)
      .not("property_id", "is", null);

    for (const invitation of invitations ?? []) {
      if (!invitation.property_id) {
        continue;
      }

      await notifyOwnerMembersForProperty({
        propertyId: invitation.property_id,
        type: "invite_accepted",
        title: "Tenant invite accepted",
        body: `${invitation.full_name || invitation.email} accepted the invitation and can now access Domus.`,
        entityType: "invitation",
        entityId: invitation.id,
        actorProfileId: profileId
      });
    }
  } catch (error) {
    console.error("Failed to notify owner members of accepted tenant invite:", error);
  }
}

interface SendNotificationEmailParams {
  to?: string | null;
  subject: string;
  text: string;
  html?: string;
}

async function sendNotificationEmail({
  to,
  subject,
  text,
  html
}: SendNotificationEmailParams): Promise<{
  status: "sent" | "failed";
  providerRef: string | null;
  errorMessage: string | null;
}> {
  if (!to) {
    return { status: "failed", providerRef: null, errorMessage: "Recipient email missing." };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    return {
      status: "failed",
      providerRef: null,
      errorMessage: "Email delivery not configured (missing RESEND_API_KEY or RESEND_FROM_EMAIL)."
    };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text,
        html
      }),
      cache: "no-store"
    });

    const json = await response.json();

    if (!response.ok) {
      return {
        status: "failed",
        providerRef: null,
        errorMessage: typeof json?.message === "string" ? json.message : `Resend error ${response.status}`
      };
    }

    return {
      status: "sent",
      providerRef: typeof json?.id === "string" ? json.id : null,
      errorMessage: null
    };
  } catch (error) {
    return {
      status: "failed",
      providerRef: null,
      errorMessage: error instanceof Error ? error.message : "Unknown email delivery error."
    };
  }
}

async function insertDeliveryRecord(
  admin: ReturnType<typeof createAdminClient>,
  row: {
    notification_id: string;
    channel: "in_app" | "email";
    status: "pending" | "sent" | "failed";
    provider_ref?: string | null;
    error_message?: string | null;
  }
) {
  const { error } = await admin.from("notification_deliveries").insert(row);
  if (error) {
    console.error("Failed to insert notification delivery row:", error);
  }
}
