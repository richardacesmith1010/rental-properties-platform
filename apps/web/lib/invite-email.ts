import { buildTenantInviteEmail, type TenantInviteEmailParams } from "@/lib/email-templates";

export interface SendTenantInviteEmailParams extends TenantInviteEmailParams {
  tenantEmail: string;
}

export async function sendTenantInviteEmail(
  params: SendTenantInviteEmailParams
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    return false;
  }

  const { subject, html, text } = buildTenantInviteEmail(params);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [params.tenantEmail],
        subject,
        html,
        text
      })
    });

    return response.ok;
  } catch {
    return false;
  }
}
