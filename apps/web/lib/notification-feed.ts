import {
  ANNOUNCEMENT_ENTITY_TYPE,
  ANNOUNCEMENT_NOTIFICATION_TYPE
} from "@/lib/announcements";

export interface NotificationActionLink {
  label: string;
  sectionId: string;
}

export interface GroupedNotifications<T extends { createdAt: string }> {
  today: T[];
  thisWeek: T[];
  earlier: T[];
}

export function formatRelativeNotificationTime(
  dateString: string,
  now = new Date()
): string {
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  if (diffMins < 1) {
    return "Just now";
  }
  if (diffMins < 60) {
    return `${diffMins}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  if (diffDays === 1) {
    return "Yesterday";
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
}

export function groupNotificationsByRecency<T extends { createdAt: string }>(
  notifications: T[],
  now = new Date()
): GroupedNotifications<T> {
  const today: T[] = [];
  const thisWeek: T[] = [];
  const earlier: T[] = [];

  for (const notification of notifications) {
    const date = new Date(notification.createdAt);
    const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);

    if (diffDays <= 0) {
      today.push(notification);
    } else if (diffDays < 7) {
      thisWeek.push(notification);
    } else {
      earlier.push(notification);
    }
  }

  return { today, thisWeek, earlier };
}

export function getNotificationActionLink(notification: {
  type: string;
  entityType: string;
}): NotificationActionLink | null {
  if (
    notification.type === ANNOUNCEMENT_NOTIFICATION_TYPE ||
    notification.entityType === ANNOUNCEMENT_ENTITY_TYPE
  ) {
    return { label: "Read Announcement", sectionId: "notifications" };
  }

  if (
    notification.type === "owner_message" ||
    notification.entityType === "inbox_thread"
  ) {
    return { label: "Open Inbox", sectionId: "inbox" };
  }

  if (
    notification.type === "late_rent" ||
    notification.type === "rent_due_reminder" ||
    notification.type === "delinquency_escalation" ||
    notification.entityType === "rent_charge"
  ) {
    return { label: "View Charge", sectionId: "charges" };
  }

  if (notification.type === "payment_recorded" || notification.entityType === "payment") {
    return { label: "View Payment", sectionId: "payments" };
  }

  if (
    notification.type === "new_ticket" ||
    notification.type === "ticket_resolved" ||
    notification.entityType === "maintenance_ticket" ||
    notification.entityType === "ticket"
  ) {
    return { label: "View Ticket", sectionId: "maintenance" };
  }

  if (
    notification.type === "lease_updated" ||
    notification.type === "lease_expiring_soon" ||
    notification.type === "lease_expired" ||
    notification.entityType === "lease"
  ) {
    return { label: "View Lease", sectionId: "leases" };
  }

  if (
    notification.type === "document_sent" ||
    notification.type === "document_signed" ||
    notification.entityType === "document_packet" ||
    notification.entityType === "property_file"
  ) {
    return { label: "View Document", sectionId: "documents" };
  }

  if (
    notification.type === "application_reviewed" ||
    notification.entityType === "rental_application"
  ) {
    return { label: "View Application", sectionId: "applications" };
  }

  if (notification.type === "invite_accepted" || notification.entityType === "invitation") {
    return { label: "View Invite", sectionId: "invitations" };
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
    return { label: "View Account", sectionId: "ownership" };
  }

  return null;
}
