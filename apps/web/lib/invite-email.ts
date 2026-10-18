import {
  buildManagerInviteEmail, buildTenantInviteEmail, type TenantInviteEmailParams
} from "@/lib/email-templates";
import {
  isNotificationRecipientAllowed, notificationAllowlist, notificationMode
} from "@/lib/notifications-switch";

export interface SendTenantInviteEmailParams extends TenantInviteEmailParams {
  tenantEmail: string;
}

type InviteMessage = { subject: string; html: string; text: string };

async function sendInviteEmail(to: string, message: InviteMessage): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject: message.subject,
        html: message.html,
        text: message.text
      })
    });

    return response.ok;
  } catch {
    return false;
  }
}

export async function sendTenantInviteEmail(params: SendTenantInviteEmailParams): Promise<boolean> {
  return sendInviteEmail(params.tenantEmail, buildTenantInviteEmail(params));
}

export function canSendBrandedManagerInvite(email: string): boolean {
  try {
    const mode = notificationMode();
    return mode === "test" && isNotificationRecipientAllowed("test", email, notificationAllowlist());
  } catch {
    return false;
  }
}

export async function sendManagerInviteEmail(params: {
  email: string;
  inviterName: string;
  homeNames: string[];
  inviteUrl: string;
}): Promise<boolean> {
  if (!canSendBrandedManagerInvite(params.email)) return false;
  return sendInviteEmail(params.email, buildManagerInviteEmail(params));
}
