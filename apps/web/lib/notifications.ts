import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildNotificationEmail } from "@/lib/email-templates";
import { shouldRecordSuccessfulDelivery } from "@/lib/idempotency";
import { ensureInboxThreadForEvent } from "@/lib/inbox";

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
  | "achievement_unlocked";

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

interface CreateNotificationParams {
  recipientProfileId: string;
  recipientEmail?: string | null;
  type: NotificationType;
  title: string;
  body: string;
  entityType: string;
  entityId?: string | null;
  propertyId?: string | null;
  actorProfileId?: string | null;
}

function getNotificationCta(type: NotificationType) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://domusbase.com";

  switch (type) {
    case "rent_due_reminder":
    case "late_rent":
      return { text: "Pay Now", url: `${baseUrl}/tenant` };
    case "payment_recorded":
      return { text: "View Dashboard", url: `${baseUrl}/tenant` };
    case "new_ticket":
    case "document_signed":
    case "invite_accepted":
      return { text: "View Dashboard", url: `${baseUrl}/owner` };
    case "ticket_resolved":
      return { text: "View Details", url: `${baseUrl}/tenant` };
    case "document_sent":
      return { text: "Review Document", url: `${baseUrl}/tenant` };
    default:
      return { text: "Open Domus", url: baseUrl };
  }
}

export async function createNotificationWithDelivery(params: CreateNotificationParams) {
  try {
    const admin = createAdminClient();

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

    const { data: existingDeliveries } = await admin
      .from("notification_deliveries")
      .select("channel, status")
      .eq("notification_id", notification.id);

    const deliveryRows = (existingDeliveries ?? []).map((row) => ({
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

    let emailResult: {
      status: "sent" | "failed";
      providerRef: string | null;
      errorMessage: string | null;
    } | null = null;

    if (shouldRecordSuccessfulDelivery(deliveryRows, "email")) {
      const cta = getNotificationCta(params.type);
      emailResult = await sendNotificationEmail({
        to: params.recipientEmail,
        subject: params.title,
        text: params.body,
        html: buildNotificationEmail({
          title: params.title,
          body: params.body,
          ctaText: cta.text,
          ctaUrl: cta.url
        })
      });
    }

    if (emailResult) {
      await insertDeliveryRecord(admin, {
        notification_id: notification.id,
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
      .select("id, email")
      .in("id", recipientIds);

    for (const profile of profiles ?? []) {
      await createNotificationWithDelivery({
        recipientProfileId: profile.id,
        recipientEmail: profile.email,
        type: params.type,
        title: params.title,
        body: params.body,
        entityType: params.entityType,
        entityId: params.entityId ?? null
      });
    }
  } catch (error) {
    console.error("Failed to notify owner members:", error);
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
