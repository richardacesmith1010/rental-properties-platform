import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { shouldRecordSuccessfulDelivery } from "@/lib/idempotency";

export type NotificationType = "new_ticket" | "late_rent";

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
      emailResult = await sendNotificationEmail({
        to: params.recipientEmail,
        subject: params.title,
        text: params.body
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

interface SendNotificationEmailParams {
  to?: string | null;
  subject: string;
  text: string;
}

async function sendNotificationEmail({ to, subject, text }: SendNotificationEmailParams): Promise<{
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
        text
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
