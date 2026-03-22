import { logAudit } from "@/lib/audit";
import { buildInvoiceEmailTemplate } from "@/lib/email-templates";

export interface InvoiceEmailParams {
  managerName: string;
  managerEmail: string;
  ownerName: string;
  ownerEmail?: string | null;
  amount: string;
  description: string;
  propertyName: string;
  invoiceNumber: string;
  date: string;
  invoiceUrl: string;
  status: "pending" | "paid";
}

export interface SendInvoiceEmailParams extends InvoiceEmailParams {
  attachmentFileName: string;
  attachmentContentBase64: string;
  actorUserId?: string;
  paymentId?: string;
  propertyId?: string;
}

export function buildInvoiceEmail(params: InvoiceEmailParams) {
  return buildInvoiceEmailTemplate({
    recipientName: params.managerName,
    ownerName: params.ownerName,
    propertyName: params.propertyName,
    categoryLabel: params.status === "paid" ? "Payment confirmation" : "Manager invoice",
    amountFormatted: params.amount,
    description: params.description,
    paymentDate: params.date,
    invoiceUrl: params.invoiceUrl,
    invoiceNumber: params.invoiceNumber,
    status: params.status
  });
}

export async function sendInvoiceEmail(params: SendInvoiceEmailParams): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    return false;
  }

  const { subject, html, text } = buildInvoiceEmail(params);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [params.managerEmail],
        cc:
          params.ownerEmail && params.ownerEmail !== params.managerEmail
            ? [params.ownerEmail]
            : undefined,
        subject,
        html,
        text,
        attachments: [
          {
            filename: params.attachmentFileName,
            content: params.attachmentContentBase64
          }
        ]
      })
    });

    if (!response.ok) {
      return false;
    }

    if (params.actorUserId && params.paymentId) {
      await logAudit({
        userId: params.actorUserId,
        action: "send_manager_invoice",
        entityType: "manager_payment",
        entityId: params.paymentId,
        metadata: {
          propertyId: params.propertyId,
          managerEmail: params.managerEmail,
          ownerEmail: params.ownerEmail ?? null,
          invoiceNumber: params.invoiceNumber,
          status: params.status
        }
      });
    }

    return true;
  } catch {
    return false;
  }
}
