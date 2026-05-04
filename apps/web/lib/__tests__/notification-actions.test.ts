import { describe, expect, it } from "vitest";
import {
  getNotificationActions,
  getPrimaryNotificationAction,
  toAbsoluteNotificationUrl
} from "@/lib/notification-actions";

describe("notification actions", () => {
  const lateRentNotification = {
    id: "notification-1",
    type: "late_rent",
    title: "Rent is overdue",
    body: "Angel's rent is overdue.",
    entityType: "rent_charge",
    entityId: "charge-1",
    readAt: null,
    createdAt: "2026-03-24T10:00:00.000Z"
  };

  it("returns owner actions for late rent notifications", () => {
    const actions = getNotificationActions(lateRentNotification, "owner");

    expect(actions).toHaveLength(3);
    expect(actions[0]).toMatchObject({ label: "Send Reminder", kind: "send_reminder" });
    expect(actions[1]).toMatchObject({ label: "Waive Charge", kind: "waive_charge" });
    expect(actions[2]).toMatchObject({
      label: "View Charge",
      href: "/owner?section=charges&chargeId=charge-1"
    });
  });

  it("returns a tenant pay action for late rent notifications", () => {
    const actions = getNotificationActions(lateRentNotification, "tenant");

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ label: "Pay Rent", href: "/tenant?section=charges&pay=charge-1" });
  });

  it("maps maintenance notifications to role-aware labels", () => {
    const notification = {
      type: "new_ticket",
      title: "New maintenance ticket",
      body: "Leaking sink submitted.",
      entityType: "maintenance_ticket",
      entityId: "ticket-1"
    };

    expect(getNotificationActions(notification, "owner")[0]?.label).toBe("Review Ticket");
    expect(getNotificationActions(notification, "tenant")[0]?.label).toBe("Track Your Ticket");
    expect(getNotificationActions(notification, "manager")[0]?.label).toBe("Respond to Ticket");
  });

  it("builds an absolute URL for email CTAs", () => {
    expect(toAbsoluteNotificationUrl("/tenant?section=charges", "https://domusbase.com")).toBe(
      "https://domusbase.com/tenant?section=charges"
    );
  });

  it("returns a primary action for payment notifications", () => {
    const action = getPrimaryNotificationAction(
      {
        type: "payment_recorded",
        title: "Payment received",
        body: "Thank you.",
        entityType: "rent_charge",
        entityId: "charge-9"
      },
      "owner"
    );

    expect(action).toMatchObject({ label: "View Receipt", href: "/payments/receipt/charge-9" });
  });

  it("falls back to content matching when a notification title describes a payment", () => {
    const actions = getNotificationActions(
      {
        type: "achievement_unlocked",
        title: "Payment received",
        body: "Payment received for Unit 1A.",
        entityType: "note",
        entityId: "charge-2"
      },
      "owner"
    );

    expect(actions[0]).toMatchObject({ label: "View Receipt", href: "/payments/receipt/charge-2" });
  });

  it("uses a generic details action for unknown notifications", () => {
    const actions = getNotificationActions(
      {
        type: "achievement_unlocked",
        title: "System update",
        body: "A new update is available.",
        entityType: "system",
        entityId: null
      },
      "owner"
    );

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ label: "View Details", href: "/owner" });
  });

  it("routes tenant invite acceptance notices to the tenant context", () => {
    const actions = getNotificationActions(
      {
        type: "invite_accepted",
        title: "Tenant invite accepted",
        body: "Angel accepted the invitation and can now access Domus.",
        entityType: "invitation",
        entityId: "invite-1"
      },
      "owner"
    );

    expect(actions[0]).toMatchObject({
      label: "View Tenant",
      href: "/owner?section=leases&invitationId=invite-1"
    });
  });

  it("routes announcements back to the notifications section", () => {
    const actions = getNotificationActions(
      {
        type: "announcement",
        title: "Boil water advisory",
        body: "Please boil tap water until further notice.",
        entityType: "announcement",
        entityId: "announcement-1"
      },
      "tenant"
    );

    expect(actions[0]).toMatchObject({
      label: "Read Announcement",
      href: "/tenant?section=notifications"
    });
  });
});
