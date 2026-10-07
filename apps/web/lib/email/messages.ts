import { buildBrandedEmailShell, escapeHtml } from "./shell";

interface PropertyMessageEmailParams {
  recipientName: string;
  senderName: string;
  propertyName: string;
  messageContent: string;
  dashboardUrl: string;
}

export function buildPropertyMessageEmail({
  recipientName,
  senderName,
  propertyName,
  messageContent,
  dashboardUrl
}: PropertyMessageEmailParams) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://domusbase.com";
  const subject = `Message from ${senderName} about ${propertyName}`;
  const safeMessage = escapeHtml(messageContent).replaceAll("\n", "<br />");

  const bodyHtml = [
    `<p style="margin:0;">Hi ${escapeHtml(recipientName)},</p>`,
    `<p style="margin:16px 0 0 0;">${escapeHtml(senderName)} sent you a message about <strong>${escapeHtml(propertyName)}</strong>.</p>`,
    `<div style="margin:16px 0 0 0;padding:16px;border-radius:16px;${
    ""
    }background-color:#F5F5F1;border:1px solid #E6E6E0;color:#3A3F45;">"${safeMessage}"</div>`,
    `<p style="margin:16px 0 0 0;">Open Domus to reply or review the conversation.</p>`
  ].join("");

  const html = buildBrandedEmailShell({
    titleHtml: escapeHtml(`Message from ${senderName}`),
    bodyHtml,
    ctaText: "View in Domus",
    ctaUrl: dashboardUrl,
    preheaderText: subject,
    footerPreferencesUrl: `${appUrl}/settings`
  });

  const text = [
    `Hi ${recipientName},`,
    "",
    `${senderName} sent you a message about ${propertyName}:`,
    "",
    `"${messageContent}"`,
    "",
    `View in Domus: ${dashboardUrl}`,
    "",
    `Manage notification preferences: ${appUrl}/settings`
  ].join("\n");

  return { subject, html, text };
}

export function buildOwnerMessageEmail(params: {
  tenantName: string;
  ownerName: string;
  propertyName: string;
  messageContent: string;
  dashboardUrl: string;
}) {
  return buildPropertyMessageEmail({
    recipientName: params.tenantName,
    senderName: params.ownerName,
    propertyName: params.propertyName,
    messageContent: params.messageContent,
    dashboardUrl: params.dashboardUrl
  });
}

