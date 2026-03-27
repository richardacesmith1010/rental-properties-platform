export type NotificationRecipientRole = "owner" | "manager" | "tenant";

export type NotificationActionKind =
  | "navigate"
  | "send_reminder"
  | "waive_charge"
  | "mark_manager_payment_paid";

export interface NotificationActionSource {
  type: string;
  entityType: string;
  entityId?: string | null;
  title: string;
  body: string;
}

export interface NotificationActionDefinition {
  kind: NotificationActionKind;
  label: string;
  href: string;
  variant: "default" | "outline";
  sectionId?: string;
}

export interface NotificationPresentation {
  severity: "urgent" | "attention" | "info";
  eyebrow: string;
}

function getNotificationText(notification: NotificationActionSource) {
  return [
    notification.type,
    notification.entityType,
    notification.title,
    notification.body
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function includesEvery(text: string, parts: string[]) {
  return parts.every((part) => text.includes(part));
}

function buildDashboardHref(
  role: NotificationRecipientRole,
  sectionId: string,
  params: Record<string, string | null | undefined> = {}
) {
  const search = new URLSearchParams({ section: sectionId });
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }

  return `/${role}?${search.toString()}`;
}

function receiptHref(chargeId: string | null | undefined, pdf = false) {
  if (!chargeId) {
    return "/tenant?section=charges";
  }

  return pdf ? `/api/pdf/receipt/${chargeId}` : `/payments/receipt/${chargeId}`;
}

function managerInvoiceHref(paymentId: string | null | undefined) {
  return paymentId ? `/api/pdf/invoice/${paymentId}` : "/manager?section=overview";
}

function resolveChargeActions(
  role: NotificationRecipientRole,
  notification: NotificationActionSource
): NotificationActionDefinition[] {
  const chargeId = notification.entityId ?? null;

  if (role === "owner") {
    return [
      {
        kind: "send_reminder",
        label: "Send Reminder",
        href: buildDashboardHref("owner", "charges", {
          chargeId,
          action: "remind"
        }),
        variant: "default",
        sectionId: "charges"
      },
      {
        kind: "waive_charge",
        label: "Waive Charge",
        href: buildDashboardHref("owner", "charges", {
          chargeId,
          action: "waive"
        }),
        variant: "outline",
        sectionId: "charges"
      },
      {
        kind: "navigate",
        label: "View Charge",
        href: buildDashboardHref("owner", "charges", {
          chargeId
        }),
        variant: "outline",
        sectionId: "charges"
      }
    ];
  }

  if (role === "tenant") {
    return [
      {
        kind: "navigate",
        label: "Pay Rent",
        href: buildDashboardHref("tenant", "charges", {
          pay: chargeId
        }),
        variant: "default",
        sectionId: "charges"
      }
    ];
  }

  return [
    {
      kind: "navigate",
      label: "View Charge",
      href: buildDashboardHref("manager", "charges", {
        chargeId
      }),
      variant: "default",
      sectionId: "charges"
    }
  ];
}

function resolveMaintenanceActions(
  role: NotificationRecipientRole,
  notification: NotificationActionSource
): NotificationActionDefinition[] {
  const ticketId = notification.entityId ?? null;

  if (role === "owner") {
    return [
      {
        kind: "navigate",
        label: "Review Ticket",
        href: buildDashboardHref("owner", "maintenance", { ticketId }),
        variant: "default",
        sectionId: "maintenance"
      }
    ];
  }

  if (role === "tenant") {
    return [
      {
        kind: "navigate",
        label: "Track Your Ticket",
        href: buildDashboardHref("tenant", "maintenance", { ticketId }),
        variant: "default",
        sectionId: "maintenance"
      }
    ];
  }

  return [
    {
      kind: "navigate",
      label: "Respond to Ticket",
      href: buildDashboardHref("manager", "maintenance", { ticketId }),
      variant: "default",
      sectionId: "maintenance"
    }
  ];
}

function resolveLeaseActions(
  role: NotificationRecipientRole,
  notification: NotificationActionSource
): NotificationActionDefinition[] {
  const leaseId = notification.entityId ?? null;

  if (role === "tenant") {
    return [
      {
        kind: "navigate",
        label: "Review Your Lease",
        href: buildDashboardHref("tenant", "documents", { leaseId }),
        variant: "default",
        sectionId: "documents"
      }
    ];
  }

  return [
    {
      kind: "navigate",
      label: "View Lease",
      href: buildDashboardHref(role, "leases", { leaseId }),
      variant: "default",
      sectionId: "leases"
    }
  ];
}

function resolvePaymentActions(
  role: NotificationRecipientRole,
  notification: NotificationActionSource
): NotificationActionDefinition[] {
  if (role === "owner") {
    return [
      {
        kind: "navigate",
        label: "View Receipt",
        href: receiptHref(notification.entityId ?? null),
        variant: "default"
      }
    ];
  }

  if (role === "tenant") {
    return [
      {
        kind: "navigate",
        label: "Download Receipt",
        href: receiptHref(notification.entityId ?? null, true),
        variant: "default"
      }
    ];
  }

  return [
    {
      kind: "navigate",
      label: "View Payment",
      href: buildDashboardHref("manager", "charges", {
        chargeId: notification.entityId ?? null
      }),
      variant: "default",
      sectionId: "charges"
    }
  ];
}

function resolveDocumentActions(
  role: NotificationRecipientRole,
  notification: NotificationActionSource
): NotificationActionDefinition[] {
  const packetId = notification.entityId ?? null;

  if (role === "tenant") {
    return [
      {
        kind: "navigate",
        label: "Review Document",
        href: buildDashboardHref("tenant", "documents", { packetId }),
        variant: "default",
        sectionId: "documents"
      }
    ];
  }

  return [
    {
      kind: "navigate",
      label: "View Document",
      href: buildDashboardHref(role, "documents", { packetId }),
      variant: "default",
      sectionId: "documents"
    }
  ];
}

function resolveInboxActions(
  role: NotificationRecipientRole,
  notification: NotificationActionSource
): NotificationActionDefinition[] {
  const threadId = notification.entityId ?? null;

  if (role === "tenant") {
    return [
      {
        kind: "navigate",
        label: "Reply in Messages",
        href: buildDashboardHref("tenant", "notifications", { threadId }),
        variant: "default",
        sectionId: "notifications"
      }
    ];
  }

  return [
    {
      kind: "navigate",
      label: role === "owner" ? "Open Message" : "Reply in Inbox",
      href: buildDashboardHref(role, "inbox", { threadId }),
      variant: "default",
      sectionId: "inbox"
    }
  ];
}

function resolveApplicationActions(
  role: NotificationRecipientRole,
  notification: NotificationActionSource
): NotificationActionDefinition[] {
  if (role === "tenant") {
    return [
      {
        kind: "navigate",
        label: "Open Messages",
        href: buildDashboardHref("tenant", "notifications"),
        variant: "default",
        sectionId: "notifications"
      }
    ];
  }

  return [
    {
      kind: "navigate",
      label: role === "owner" ? "View Application" : "Review Application",
      href: buildDashboardHref(role, "applications", {
        applicationId: notification.entityId ?? null
      }),
      variant: "default",
      sectionId: "applications"
    }
  ];
}

function resolveInvitationActions(
  role: NotificationRecipientRole,
  notification: NotificationActionSource
): NotificationActionDefinition[] {
  const notificationText = getNotificationText(notification);

  if (notificationText.includes("tenant invite accepted")) {
    return [
      {
        kind: "navigate",
        label: "View Tenant",
        href: buildDashboardHref(role === "tenant" ? "tenant" : role, role === "tenant" ? "notifications" : "leases", {
          invitationId: notification.entityId ?? null
        }),
        variant: "default",
        sectionId: role === "tenant" ? "notifications" : "leases"
      }
    ];
  }

  return [
    {
      kind: "navigate",
      label: role === "owner" ? "View Members" : "View Details",
      href: buildDashboardHref(role === "tenant" ? "tenant" : role, role === "tenant" ? "notifications" : "members", {
        invitationId: notification.entityId ?? null
      }),
      variant: "default",
      sectionId: role === "tenant" ? "notifications" : "members"
    }
  ];
}

function resolveOwnershipActions(
  notification: NotificationActionSource
): NotificationActionDefinition[] {
  if (notification.type === "withdrawal_completed") {
    return [
      {
        kind: "navigate",
        label: "View Payout",
        href: buildDashboardHref("owner", "ownership", {
          requestId: notification.entityId ?? null
        }),
        variant: "default",
        sectionId: "ownership"
      }
    ];
  }

  return [
    {
      kind: "navigate",
      label: "Review Account",
      href: buildDashboardHref("owner", "ownership", {
        requestId: notification.entityId ?? null
      }),
      variant: "default",
      sectionId: "ownership"
    }
  ];
}

function resolveManagerPaymentActions(
  role: NotificationRecipientRole,
  notification: NotificationActionSource
): NotificationActionDefinition[] {
  if (role === "owner") {
    return [
      {
        kind: "mark_manager_payment_paid",
        label: "Pay Manager",
        href: buildDashboardHref("owner", "manager-payments", {
          paymentId: notification.entityId ?? null
        }),
        variant: "default",
        sectionId: "manager-payments"
      }
    ];
  }

  return [
    {
      kind: "navigate",
      label: "View Invoice",
      href: managerInvoiceHref(notification.entityId ?? null),
      variant: "default"
    }
  ];
}

export function getNotificationActions(
  notification: NotificationActionSource,
  role: NotificationRecipientRole
): NotificationActionDefinition[] {
  if (
    notification.type === "owner_message" ||
    notification.entityType === "inbox_thread"
  ) {
    return resolveInboxActions(role, notification);
  }

  if (notification.type === "payment_recorded") {
    return resolvePaymentActions(role, notification);
  }

  const notificationText = getNotificationText(notification);

  if (notificationText.includes("tenant") && notificationText.includes("added")) {
    return [
      {
        kind: "navigate",
        label: "View Tenant",
        href: buildDashboardHref(role === "tenant" ? "tenant" : role, role === "tenant" ? "notifications" : "leases", {
          tenantId: notification.entityId ?? null
        }),
        variant: "default",
        sectionId: role === "tenant" ? "notifications" : "leases"
      }
    ];
  }

  if (notificationText.includes("payout")) {
    return [
      {
        kind: "navigate",
        label: "View Payout",
        href: buildDashboardHref("owner", "ownership", {
          requestId: notification.entityId ?? null
        }),
        variant: "default",
        sectionId: "ownership"
      }
    ];
  }

  if (
    notification.type === "late_rent" ||
    notification.type === "rent_due_reminder" ||
    notification.type === "delinquency_escalation" ||
    notification.entityType === "rent_charge" ||
    notification.entityType === "charge"
  ) {
    return resolveChargeActions(role, notification);
  }

  if (
    notification.type === "new_ticket" ||
    notification.type === "ticket_resolved" ||
    notification.entityType === "maintenance_ticket" ||
    notification.entityType === "ticket"
  ) {
    return resolveMaintenanceActions(role, notification);
  }

  if (
    notification.type === "lease_updated" ||
    notification.type === "lease_expiring_soon" ||
    notification.type === "lease_expired" ||
    notification.entityType === "lease"
  ) {
    return resolveLeaseActions(role, notification);
  }

  if (
    notification.type === "document_sent" ||
    notification.type === "document_signed" ||
    notification.entityType === "document_packet" ||
    notification.entityType === "property_file"
  ) {
    return resolveDocumentActions(role, notification);
  }

  if (
    notification.type === "application_reviewed" ||
    notification.entityType === "rental_application"
  ) {
    return resolveApplicationActions(role, notification);
  }

  if (
    notification.type === "invite_accepted" ||
    notification.entityType === "invitation"
  ) {
    return resolveInvitationActions(role, notification);
  }

  if (
    notification.type === "distribution_change_requested" ||
    notification.type === "distribution_change_approved" ||
    notification.type === "distribution_change_rejected" ||
    notification.type === "withdrawal_requested" ||
    notification.type === "withdrawal_approved" ||
    notification.type === "withdrawal_rejected" ||
    notification.type === "withdrawal_completed" ||
    notification.entityType === "distribution_change_request" ||
    notification.entityType === "withdrawal_request"
  ) {
    return resolveOwnershipActions(notification);
  }

  if (notification.entityType === "manager_payment") {
    return resolveManagerPaymentActions(role, notification);
  }

  if (notificationText.includes("late") || notificationText.includes("overdue")) {
    return resolveChargeActions(role, notification);
  }

  if (includesEvery(notificationText, ["lease", "created"])) {
    return resolveLeaseActions(role, notification);
  }

  if (includesEvery(notificationText, ["payment", "received"])) {
    return resolvePaymentActions(role, notification);
  }

  if (notificationText.includes("maintenance") || notificationText.includes("ticket")) {
    return resolveMaintenanceActions(role, notification);
  }

  return [
    {
      kind: "navigate",
      label: "View Details",
      href: `/${role}`,
      variant: "default"
    }
  ];
}

export function getPrimaryNotificationAction(
  notification: NotificationActionSource,
  role: NotificationRecipientRole
) {
  return getNotificationActions(notification, role)[0] ?? null;
}

export function getNotificationPresentation(
  notification: NotificationActionSource
): NotificationPresentation {
  if (
    notification.type === "late_rent" ||
    notification.type === "delinquency_escalation"
  ) {
    return { severity: "urgent", eyebrow: "Urgent" };
  }

  if (
    notification.type === "rent_due_reminder" ||
    notification.type === "lease_expiring_soon" ||
    notification.entityType === "manager_payment"
  ) {
    return { severity: "attention", eyebrow: "Needs action" };
  }

  return { severity: "info", eyebrow: "Update" };
}

export function toAbsoluteNotificationUrl(
  href: string,
  baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://domusbase.com"
) {
  return new URL(href, baseUrl).toString();
}
