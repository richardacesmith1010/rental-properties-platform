import {
  ANNOUNCEMENT_ENTITY_TYPE,
  ANNOUNCEMENT_NOTIFICATION_TYPE
} from "@/lib/announcements";

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

import {
  buildDashboardHref,
  getNotificationText,
  includesEvery,
  resolveChargeActions,
  resolveMaintenanceActions,
  resolveLeaseActions,
  resolvePaymentActions,
  resolveDocumentActions,
  resolveInboxActions,
  resolveApplicationActions,
  resolveInvitationActions,
  resolveOwnershipActions,
  resolveManagerPaymentActions,
  resolveAnnouncementActions,
} from "./notification-action-resolvers";

export function getNotificationActions(
  notification: NotificationActionSource,
  role: NotificationRecipientRole
): NotificationActionDefinition[] {
  if (
    notification.type === ANNOUNCEMENT_NOTIFICATION_TYPE ||
    notification.entityType === ANNOUNCEMENT_ENTITY_TYPE
  ) {
    return resolveAnnouncementActions(role);
  }

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
    notification.type === ANNOUNCEMENT_NOTIFICATION_TYPE ||
    notification.entityType === ANNOUNCEMENT_ENTITY_TYPE
  ) {
    return { severity: "info", eyebrow: "Announcement" };
  }

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
