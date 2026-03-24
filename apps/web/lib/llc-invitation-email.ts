import { buildLLCInviteEmail } from "@/lib/email-templates";

interface SendLLCInvitationEmailParams {
  email: string;
  llcName: string;
  inviterName: string;
  acceptUrl: string;
}

export async function sendLLCInvitationEmail(
  params: SendLLCInvitationEmailParams
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    return false;
  }

  const { subject, html, text } = buildLLCInviteEmail({
    llcName: params.llcName,
    inviterName: params.inviterName,
    acceptUrl: params.acceptUrl
  });

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [params.email],
        subject,
        html,
        text
      })
    });

    return response.ok;
  } catch (error) {
    console.error("sendLLCInvitationEmail error:", error);
    return false;
  }
}
