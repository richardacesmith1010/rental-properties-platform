import type { NotificationActionDefinition, NotificationActionSource, NotificationRecipientRole } from "./notification-actions";

export function getNotificationText(notification: NotificationActionSource) {
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

export function includesEvery(text: string, parts: string[]) {
  return parts.every((part) => text.includes(part));
}

export function buildDashboardHref(
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

export function resolveChargeActions(
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
        label: "Waive payment",
        href: buildDashboardHref("owner", "charges", {
          chargeId,
          action: "waive"
        }),
        variant: "outline",
        sectionId: "charges"
      },
      {
        kind: "navigate",
        label: "View payment",
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
      label: "View payment",
      href: buildDashboardHref("manager", "charges", {
        chargeId
      }),
      variant: "default",
      sectionId: "charges"
    }
  ];
}

export function resolveMaintenanceActions(
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

export function resolveLeaseActions(
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

export function resolvePaymentActions(
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

export function resolveDocumentActions(
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

export function resolveInboxActions(
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

export function resolveApplicationActions(
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

export function resolveInvitationActions(
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

export function resolveOwnershipActions(
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

export function resolveManagerPaymentActions(
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

export function resolveAnnouncementActions(role: NotificationRecipientRole) {
  return [
    {
      kind: "navigate" as const,
      label: "Read Announcement",
      href: buildDashboardHref(role, "notifications"),
      variant: "default" as const,
      sectionId: "notifications"
    }
  ];
}
