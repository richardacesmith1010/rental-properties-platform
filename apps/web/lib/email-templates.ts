import { getFeedbackTypeMeta, type FeedbackType } from "@/lib/feedback";

export interface EmailTemplateParams {
  title: string;
  body: string;
  ctaText?: string;
  ctaUrl?: string;
  preheaderText?: string;
}

interface BrandedEmailShellParams {
  titleHtml: string;
  bodyHtml: string;
  ctaText: string;
  ctaUrl: string;
  preheaderText?: string;
  footerPreferencesUrl?: string;
}

interface RentReminderEmailParams {
  tenantName: string;
  amountFormatted: string;
  dueDate: string;
  propertyName: string;
  type: "upcoming" | "due_today" | "overdue";
  dashboardUrl: string;
}

interface ManagerPaymentEmailParams {
  recipientName: string;
  ownerName: string;
  propertyName: string;
  categoryLabel: string;
  amountFormatted: string;
  description: string;
  paymentDate: string;
  invoiceUrl: string;
  invoiceNumber: string;
  status: "pending" | "paid";
}

interface PropertyMessageEmailParams {
  recipientName: string;
  senderName: string;
  propertyName: string;
  messageContent: string;
  dashboardUrl: string;
}

interface FeedbackEmailParams {
  type: FeedbackType;
  message: string;
  email: string | null;
  userName: string | null;
  userRole: string | null;
  pageUrl: string;
}

export interface TenantInviteEmailParams {
  tenantName: string;
  ownerName: string;
  propertyName?: string | null;
  propertyAddress: string;
  inviteUrl: string;
  unitLabel?: string | null;
  monthlyRent?: string | null;
  leaseStartDate?: string | null;
  leaseEndDate?: string | null;
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildBrandedEmailShell({
  titleHtml,
  bodyHtml,
  ctaText,
  ctaUrl,
  preheaderText,
  footerPreferencesUrl,
}: BrandedEmailShellParams) {
  const safeCtaText = escapeHtml(ctaText);
  const safeCtaUrl = escapeHtml(ctaUrl);
  const safePreferencesUrl = footerPreferencesUrl ? escapeHtml(footerPreferencesUrl) : null;
  const safePreheaderText = preheaderText ? escapeHtml(preheaderText) : null;

  return `
<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:24px;background-color:#f5f3ff;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    ${safePreheaderText ? `
    <span style="display:none;font-size:1px;color:#f5f3ff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
      ${safePreheaderText}
    </span>` : ""}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;border-collapse:collapse;">
            <tr>
              <td style="padding:20px 24px;background:linear-gradient(135deg,#7C3AED 0%,#5B21B6 100%);border-radius:20px 20px 0 0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                  <tr>
                    <td style="vertical-align:middle;">
                      <img
                        src="https://domusbase.com/images/mascot/poses/happy.png"
                        alt="Domus mascot"
                        width="72"
                        height="48"
                        style="display:block;border:0;outline:none;text-decoration:none;"
                      />
                    </td>
                    <td style="padding-left:12px;vertical-align:middle;">
                      <div style="font-size:20px;font-weight:700;line-height:1.2;color:#ffffff;">Domus</div>
                      <div style="margin-top:4px;font-size:12px;line-height:1.4;color:rgba(255,255,255,0.78);">
                        Rental Property Management
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 24px;background-color:#ffffff;border-left:1px solid #ddd6fe;border-right:1px solid #ddd6fe;">
                <div style="font-size:24px;font-weight:700;line-height:1.3;color:#111827;">${titleHtml}</div>
                <div style="margin-top:14px;font-size:15px;line-height:1.7;color:#475569;">
                  ${bodyHtml}
                </div>
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:24px;border-collapse:collapse;">
                  <tr>
                    <td align="center" bgcolor="#10B981" style="border-radius:999px;">
                      <a
                        href="${safeCtaUrl}"
                        style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:700;line-height:1;text-decoration:none;color:#ffffff;"
                      >
                        ${safeCtaText}
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 24px;background-color:#f8fafc;border:1px solid #ddd6fe;border-top:none;border-radius:0 0 20px 20px;">
                <div style="font-size:12px;line-height:1.6;color:#64748b;">
                  Domus - Rental Property Management<br />
                  Manage rent, maintenance, documents, and notifications in one place.
                </div>
                ${safePreferencesUrl ? `
                <div style="margin-top:8px;font-size:12px;line-height:1.6;color:#64748b;">
                  <a href="${safePreferencesUrl}" style="color:#7C3AED;text-decoration:underline;">
                    Manage notification preferences
                  </a>
                </div>` : ""}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();
}

export function buildNotificationEmail({
  title,
  body,
  ctaText = "Open Domus",
  ctaUrl = "https://domusbase.com",
  preheaderText,
}: EmailTemplateParams) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://domusbase.com";
  const safeTitle = escapeHtml(title);
  const safeBody = escapeHtml(body).replaceAll("\n", "<br />");

  return buildBrandedEmailShell({
    titleHtml: safeTitle,
    bodyHtml: safeBody,
    ctaText,
    ctaUrl,
    preheaderText,
    footerPreferencesUrl: `${appUrl}/settings`,
  });
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
    `<div style="margin:16px 0 0 0;padding:16px;border-radius:16px;background-color:#f8fafc;border:1px solid #e2e8f0;color:#334155;">"${safeMessage}"</div>`,
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

export function buildTenantInviteEmail({
  tenantName,
  ownerName,
  propertyName,
  propertyAddress,
  inviteUrl,
  unitLabel,
  monthlyRent,
  leaseStartDate,
  leaseEndDate
}: TenantInviteEmailParams) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://domusbase.com";
  const subject = `${ownerName} invited you to Domus`;
  const unitSummary = unitLabel ? `, ${unitLabel}` : "";
  const locationSummary = propertyName
    ? `${propertyName} (${propertyAddress})`
    : propertyAddress;
  const leaseSummary =
    leaseStartDate && leaseEndDate
      ? `Lease term: ${leaseStartDate} to ${leaseEndDate}.`
      : leaseStartDate
        ? `Lease start: ${leaseStartDate}.`
        : leaseEndDate
          ? `Lease end: ${leaseEndDate}.`
          : null;

  const bodyHtml = [
    `<p style="margin:0;">Hi ${escapeHtml(tenantName)},</p>`,
    `<p style="margin:16px 0 0 0;">${escapeHtml(ownerName)} invited you to Domus to manage your rental at <strong>${escapeHtml(locationSummary)}${unitLabel ? escapeHtml(unitSummary) : ""}</strong>.</p>`,
    monthlyRent
      ? `<p style="margin:16px 0 0 0;">Your monthly rent is <strong>${escapeHtml(monthlyRent)}</strong>.</p>`
      : "",
    leaseSummary
      ? `<p style="margin:16px 0 0 0;">${escapeHtml(leaseSummary)}</p>`
      : "",
    `<p style="margin:16px 0 0 0;">Accept the invitation to set your password, view your lease, submit maintenance requests, and pay rent in one place.</p>`
  ]
    .filter(Boolean)
    .join("");

  const html = buildBrandedEmailShell({
    titleHtml: "Welcome to Domus",
    bodyHtml,
    ctaText: "Accept Invitation & Set Up Your Account",
    ctaUrl: inviteUrl,
    preheaderText: `${ownerName} invited you to Domus`,
    footerPreferencesUrl: `${appUrl}/settings`
  });

  const text = [
    `Hi ${tenantName},`,
    "",
    `${ownerName} invited you to Domus to manage your rental at ${locationSummary}${unitSummary}.`,
    monthlyRent ? `Monthly rent: ${monthlyRent}` : null,
    leaseSummary,
    "",
    `Accept invitation: ${inviteUrl}`,
    "",
    "Domus makes it easy to pay rent, submit maintenance requests, and view your lease."
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}

export function buildRentReminderEmail({
  tenantName,
  amountFormatted,
  dueDate,
  propertyName,
  type,
  dashboardUrl,
}: RentReminderEmailParams) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://domusbase.com";
  const subject =
    type === "overdue"
      ? `Overdue Rent: ${amountFormatted} was due ${dueDate}`
      : type === "due_today"
        ? `Rent Due Today: ${amountFormatted}`
        : `Rent Reminder: ${amountFormatted} due on ${dueDate}`;

  const summary =
    type === "overdue"
      ? `Hi ${tenantName}, your rent of ${amountFormatted} for ${propertyName} was due on ${dueDate} and is now overdue. Please pay as soon as possible.`
      : type === "due_today"
        ? `Hi ${tenantName}, your rent of ${amountFormatted} for ${propertyName} is due today.`
        : `Hi ${tenantName}, your rent of ${amountFormatted} for ${propertyName} is due on ${dueDate}.`;

  const bodyHtml = [
    `<p style="margin:0;">${escapeHtml(summary)}</p>`,
    `<p style="margin:16px 0 0 0;">Open your tenant dashboard to review the charge and pay securely.</p>`
  ].join("");

  const html = buildBrandedEmailShell({
    titleHtml: escapeHtml(type === "overdue" ? "Overdue rent reminder" : "Rent reminder"),
    bodyHtml,
    ctaText: "Pay Now",
    ctaUrl: dashboardUrl,
    preheaderText: subject,
    footerPreferencesUrl: `${appUrl}/settings`
  });

  const text = [
    summary,
    "",
    `Pay now: ${dashboardUrl}`,
    "",
    `Manage notification preferences: ${appUrl}/settings`
  ].join("\n");

  return { subject, html, text };
}

export function buildInvoiceEmailTemplate({
  recipientName,
  ownerName,
  propertyName,
  categoryLabel,
  amountFormatted,
  description,
  paymentDate,
  invoiceUrl,
  invoiceNumber,
  status
}: ManagerPaymentEmailParams) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://domusbase.com";
  const subject =
    status === "paid"
      ? `Invoice ${invoiceNumber} from ${ownerName} - ${amountFormatted} paid`
      : `Invoice ${invoiceNumber} from ${ownerName} - ${amountFormatted}`;

  const summary =
    status === "paid"
      ? `Hi ${recipientName}, ${ownerName} marked the ${categoryLabel.toLowerCase()} for ${propertyName} totaling ${amountFormatted} as paid on ${paymentDate}.`
      : `Hi ${recipientName}, ${ownerName} recorded a ${categoryLabel.toLowerCase()} invoice for ${propertyName} totaling ${amountFormatted} on ${paymentDate}.`;

  const bodyHtml = [
    `<p style="margin:0;">${escapeHtml(summary)}</p>`,
    `<p style="margin:16px 0 0 0;">Description: <strong>${escapeHtml(description)}</strong></p>`,
    `<p style="margin:16px 0 0 0;">Invoice number: <strong>${escapeHtml(invoiceNumber)}</strong></p>`,
    `<p style="margin:16px 0 0 0;">Property: <strong>${escapeHtml(propertyName)}</strong></p>`,
    `<p style="margin:16px 0 0 0;">Amount: <strong>${escapeHtml(amountFormatted)}</strong></p>`,
    `<p style="margin:16px 0 0 0;">Open Domus to download the PDF invoice and review the payment record.</p>`
  ].join("");

  const html = buildBrandedEmailShell({
    titleHtml: escapeHtml(status === "paid" ? "Manager payment confirmed" : "Manager payment invoice"),
    bodyHtml,
    ctaText: "Open Invoice",
    ctaUrl: invoiceUrl,
    preheaderText: subject,
    footerPreferencesUrl: `${appUrl}/settings`
  });

  const text = [
    summary,
    `Description: ${description}`,
    `Invoice number: ${invoiceNumber}`,
    `Property: ${propertyName}`,
    `Amount: ${amountFormatted}`,
    "",
    `Open invoice: ${invoiceUrl}`,
    "",
    `Manage notification preferences: ${appUrl}/settings`
  ].join("\n");

  return { subject, html, text };
}

export function buildManagerPaymentEmail(params: ManagerPaymentEmailParams) {
  return buildInvoiceEmailTemplate(params);
}

export function buildFeedbackEmail({
  type,
  message,
  email,
  userName,
  userRole,
  pageUrl
}: FeedbackEmailParams) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://domusbase.com";
  const typeMeta = getFeedbackTypeMeta(type);
  const subjectLabel =
    type === "bug" ? "Bug report" : type === "feature" ? "Feature request" : "Feedback";
  const submitter = userName ?? email ?? "Anonymous";
  const fromLine = [email, userRole ? `(${userRole})` : null].filter(Boolean).join(" ");
  const safeMessage = escapeHtml(message).replaceAll("\n", "<br />");
  const subject = `[Domus Feedback] ${subjectLabel} from ${submitter}`;
  const opsUrl = `${appUrl}/ops?section=feedback`;

  const html = `
<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;border-collapse:collapse;">
      <tr>
        <td style="padding:24px;border:1px solid #e2e8f0;border-radius:20px;background:#ffffff;">
          <div style="font-size:20px;font-weight:700;color:#111827;">${typeMeta.emoji} ${escapeHtml(subjectLabel)}</div>
          <div style="margin-top:16px;font-size:14px;line-height:1.7;color:#334155;">
            <p style="margin:0;"><strong>From:</strong> ${escapeHtml(submitter)}${fromLine ? ` - ${escapeHtml(fromLine)}` : ""}</p>
            <p style="margin:8px 0 0 0;"><strong>Page:</strong> ${escapeHtml(pageUrl)}</p>
            <p style="margin:8px 0 0 0;"><strong>Type:</strong> ${escapeHtml(typeMeta.label)}</p>
          </div>
          <div style="margin-top:20px;padding:16px;border-radius:16px;border:1px solid #e2e8f0;background:#f8fafc;font-size:14px;line-height:1.7;color:#0f172a;">
            ${safeMessage}
          </div>
          <div style="margin-top:24px;">
            <a href="${escapeHtml(opsUrl)}" style="display:inline-block;border-radius:999px;background:#7c3aed;padding:12px 20px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">
              View all feedback
            </a>
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();

  const text = [
    `${typeMeta.emoji} ${subjectLabel}`,
    `From: ${submitter}${fromLine ? ` - ${fromLine}` : ""}`,
    `Page: ${pageUrl}`,
    `Type: ${typeMeta.label}`,
    "",
    message,
    "",
    `View all feedback: ${opsUrl}`
  ].join("\n");

  return { subject, html, text };
}
