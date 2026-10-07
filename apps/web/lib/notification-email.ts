import { createAdminClient } from "@/lib/supabase/admin";

interface SendNotificationEmailParams {
  to?: string | null;
  subject: string;
  text: string;
  html?: string;
}

export async function sendNotificationEmail({
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

export async function insertDeliveryRecord(
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
