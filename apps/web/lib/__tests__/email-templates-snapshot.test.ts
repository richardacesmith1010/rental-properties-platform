import { describe, expect, it } from "vitest";
import {
  buildBrandedEmailShell, buildFeedbackEmail, buildInvoiceEmailTemplate,
  buildLLCInviteEmail, buildNotificationEmail, buildOwnerMessageEmail,
  buildPropertyMessageEmail, buildRentReminderEmail, buildTenantInviteEmail, escapeHtml
} from "@/lib/email-templates";

const longName = "Alexandra & Morgan <The Very Long Tenant Name> O'Connor-Smith";
const url = "https://domusbase.com/tenant?tab=rent&unit=B";

describe("email templates original output", () => {
  it("locks every exported pure builder and optional branches", () => {
    expect({
      escapeHtml: escapeHtml(`<>&"'`),
      shell: buildBrandedEmailShell({
        titleHtml: "<strong>Title</strong>", bodyHtml: "<p>Body</p>",
        ctaText: "Open & pay", ctaUrl: url, preheaderText: "Preview <rent>",
        footerPreferencesUrl: url
      }),
      shellMinimal: buildBrandedEmailShell({
        titleHtml: "Title", bodyHtml: "Body", ctaText: "Open", ctaUrl: url
      }),
      feedback: buildFeedbackEmail({
        type: "bug", message: "Broken <button> & rent", email: "alex@example.com",
        userName: longName, userRole: "tenant", pageUrl: url
      }),
      feedbackAnonymous: buildFeedbackEmail({
        type: "feature", message: "Please add reports", email: null,
        userName: null, userRole: null, pageUrl: url
      }),
      invoice: buildInvoiceEmailTemplate({
        recipientName: longName, ownerName: "Courtney & Co", propertyName: "Oak <House>",
        categoryLabel: "Repair", amountFormatted: "$1,234.56", description: "Pipe <repair>",
        paymentDate: "October 7, 2026", invoiceUrl: url, invoiceNumber: "INV-188", status: "paid"
      }),
      invoicePending: buildInvoiceEmailTemplate({
        recipientName: "Alex", ownerName: "Courtney", propertyName: "Oak", categoryLabel: "Fee",
        amountFormatted: "$0.00", description: "Credit", paymentDate: "October 7, 2026",
        invoiceUrl: url, invoiceNumber: "INV-189", status: "pending"
      }),
      llc: buildLLCInviteEmail({ llcName: "Oak & Elm LLC", inviterName: longName, acceptUrl: url }),
      notification: buildNotificationEmail({
        title: "Rent <due>", body: "Pay & confirm\nToday", ctaText: "Pay now", ctaUrl: url,
        preheaderText: "Due today"
      }),
      notificationMinimal: buildNotificationEmail({ title: "Hello", body: "Welcome" }),
      ownerMessage: buildOwnerMessageEmail({
        tenantName: longName, ownerName: "Courtney & Co", propertyName: "Oak <House>",
        messageContent: "Please call & confirm", dashboardUrl: url
      }),
      propertyMessage: buildPropertyMessageEmail({
        recipientName: longName, senderName: "Manager <M>", propertyName: "Oak & Elm",
        messageContent: "Hello <tenant>\nPlease reply", dashboardUrl: url
      }),
      reminders: (["upcoming", "due_today", "overdue"] as const).map((type) =>
        buildRentReminderEmail({ tenantName: longName, amountFormatted: "$1,234.56",
          dueDate: "October 8, 2026", propertyName: "Oak & Elm", type, dashboardUrl: url })
      ),
      tenantInvite: buildTenantInviteEmail({
        tenantName: longName, ownerName: "Courtney & Co", propertyName: "Oak <House>",
        propertyAddress: "123 Oak & Elm St", inviteUrl: url, unitLabel: "B",
        monthlyRent: "$1,234.56", leaseStartDate: "2026-11-01", leaseEndDate: "2027-10-31"
      }),
      tenantInviteMinimal: buildTenantInviteEmail({
        tenantName: "Alex", ownerName: "Courtney", propertyAddress: "123 Oak St", inviteUrl: url
      }),
      tenantInviteStartOnly: buildTenantInviteEmail({
        tenantName: "Alex", ownerName: "Courtney", propertyAddress: "123 Oak St", inviteUrl: url,
        leaseStartDate: "2026-11-01"
      }),
      tenantInviteEndOnly: buildTenantInviteEmail({
        tenantName: "Alex", ownerName: "Courtney", propertyAddress: "123 Oak St", inviteUrl: url,
        leaseEndDate: "2027-10-31"
      })
    }).toMatchSnapshot();
  });
});
