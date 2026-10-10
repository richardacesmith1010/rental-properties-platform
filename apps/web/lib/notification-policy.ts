import type { NotificationType } from "@/lib/notifications";

export type NotificationEvent =
  | "rent_paid_manual" | "rent_paid_stripe" | "late_fee" | "overdue_followup" | "autopay_failed"
  | "bank_payment_failed" | "rent_due_reminder" | "ticket_created" | "ticket_comment" | "ticket_resolved"
  | "lease_ending_soon" | "lease_ended" | "lease_changed";

export interface EventRule {
  type: NotificationType;
  owners: boolean;
  managers: "all_homes" | "client_homes" | "none";
  tenant: "always" | "in_domus_only" | "never";
  email: boolean;
  excludeActor: boolean;
}

const rules: Record<NotificationEvent, EventRule> = {
  rent_paid_manual: {
    type: "payment_recorded", owners: true, managers: "client_homes",
    tenant: "in_domus_only", email: true, excludeActor: true
  },
  rent_paid_stripe: {
    type: "payment_recorded", owners: true, managers: "client_homes",
    tenant: "in_domus_only", email: true, excludeActor: false
  },
  late_fee: {
    type: "late_rent", owners: true, managers: "client_homes",
    tenant: "in_domus_only", email: true, excludeActor: false
  },
  overdue_followup: {
    type: "delinquency_escalation", owners: true, managers: "client_homes",
    tenant: "in_domus_only", email: true, excludeActor: false
  },
  autopay_failed: {
    type: "late_rent", owners: true, managers: "client_homes",
    tenant: "always", email: true, excludeActor: false
  },
  bank_payment_failed: {
    type: "late_rent", owners: true, managers: "client_homes",
    tenant: "always", email: true, excludeActor: false
  },
  rent_due_reminder: {
    type: "rent_due_reminder", owners: false, managers: "none",
    tenant: "in_domus_only", email: true, excludeActor: false
  },
  ticket_created: {
    type: "new_ticket", owners: true, managers: "all_homes",
    tenant: "never", email: true, excludeActor: true
  },
  ticket_comment: {
    type: "new_ticket", owners: true, managers: "all_homes",
    tenant: "always", email: false, excludeActor: true
  },
  ticket_resolved: {
    type: "ticket_resolved", owners: false, managers: "none",
    tenant: "always", email: true, excludeActor: false
  },
  lease_ending_soon: {
    type: "lease_expiring_soon", owners: true, managers: "all_homes",
    tenant: "always", email: true, excludeActor: false
  },
  lease_ended: {
    type: "lease_expired", owners: true, managers: "all_homes",
    tenant: "always", email: true, excludeActor: false
  },
  lease_changed: {
    type: "lease_updated", owners: false, managers: "none",
    tenant: "always", email: false, excludeActor: true
  }
};

export function rulesFor(event: NotificationEvent): EventRule {
  return rules[event];
}

export function tenantEligibleForEvent(event: NotificationEvent, outsideDomus: unknown): boolean {
  const scope = rulesFor(event).tenant;
  return scope === "always" || (scope === "in_domus_only" && outsideDomus === false);
}
