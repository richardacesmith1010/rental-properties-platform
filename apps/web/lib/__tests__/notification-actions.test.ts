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

    expect(actions).toHaveLength(2);
    expect(actions[0]).toMatchObject({ label: "Send Reminder", kind: "send_reminder" });
    expect(actions[1]).toMatchObject({ label: "Waive Charge", kind: "waive_charge" });
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
});
