import { buildBrandedEmailShell, escapeHtml } from "./shell";

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
      ? `Hi ${tenantName}, your rent of ${amountFormatted} for ${propertyName} was due ${dueDate}.
        It is now overdue. Please pay as soon as possible.`
      : type === "due_today"
        ? `Hi ${tenantName}, your rent of ${amountFormatted} for ${propertyName} is due today.`
        : `Hi ${tenantName}, your rent of ${amountFormatted} for ${propertyName} is due on ${dueDate}.`;

  const bodyHtml = [
    `<p style="margin:0;">${escapeHtml(summary)}</p>`,
    `<p style="margin:16px 0 0 0;">Open your dashboard to see what you owe and pay safely.</p>`
  ].join("");

  const html = buildBrandedEmailShell({
    titleHtml: escapeHtml(type === "overdue" ? "Overdue rent reminder" : "Rent reminder"),
    bodyHtml,
    ctaText: "Pay Rent",
    ctaUrl: dashboardUrl,
    preheaderText: subject,
    footerPreferencesUrl: `${appUrl}/settings`
  });

  const text = [
    summary,
    "",
    `Pay rent: ${dashboardUrl}`,
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
      ? `Hi ${recipientName}, ${ownerName} marked the ${categoryLabel.toLowerCase()} for ${propertyName} as paid.
        The amount was ${amountFormatted} on ${paymentDate}.`
      : `Hi ${recipientName}, ${ownerName} recorded a ${categoryLabel.toLowerCase()} bill for ${propertyName}.
        The amount was ${amountFormatted} on ${paymentDate}.`;

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

