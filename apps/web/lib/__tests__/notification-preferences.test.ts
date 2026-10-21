import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  areNotificationEmailsPaused,
  DEFAULT_NOTIFICATION_EMAIL_PREFERENCES,
  normalizeNotificationEmailPreferences,
  mergeDeliveryPreferences,
  resolveTenantDeliveryPreference,
  resolveCombinedNotificationDeliveryPreference,
  resolveNotificationDeliveryPreference,
  resolveNotificationPauseUntil,
  notificationPreferenceOptionsForRole,
  getNotificationPreferenceKeyForType
} from "@/lib/notification-preferences";

describe("notification preference helpers", () => {
  it("R1 returns the exact role-specific switches, order, and copy", () => {
    expect(notificationPreferenceOptionsForRole("tenant")).toEqual([
      { key: "rent_due_reminder", label: "Rent reminders", description: "Email me 3 days before rent is due." },
      { key: "late_rent", label: "Late rent", description: "Email me when my rent is late." },
      { key: "delinquency_escalation", label: "Overdue rent", description: "Email me again if rent stays unpaid." },
      { key: "payment_received", label: "Receipts", description: "Email me when my payment is recorded." },
      { key: "maintenance_updates", label: "Repairs", description: "Email me when my repair is started or fixed." },
      { key: "lease_expiration", label: "Lease ending", description: "Email me before my lease ends." }
    ]);
    expect(notificationPreferenceOptionsForRole("owner")).toEqual([
      { key: "rent_due_reminder", label: "Rent reminders",
        description: "Let Domus remind my tenants 3 days before rent is due." },
      { key: "late_rent", label: "Late rent",
        description: "Email me when rent is late. Let Domus tell my tenant too." },
      { key: "delinquency_escalation", label: "Overdue rent",
        description: "Email me if rent stays unpaid. Let Domus remind my tenant too." },
      { key: "payment_received", label: "Payments", description: "Email me when a payment is recorded." },
      { key: "maintenance_updates", label: "Repairs", description: "Email me when a tenant reports a repair." },
      { key: "lease_expiration", label: "Lease ending",
        description: "Email me before a lease ends. Let Domus tell my tenant too." }
    ]);
    expect(notificationPreferenceOptionsForRole("manager")).toEqual([
      { key: "late_rent", label: "Late rent", description: "Email me when rent is late." },
      { key: "delinquency_escalation", label: "Overdue rent",
        description: "Email me again if rent stays unpaid." },
      { key: "payment_received", label: "Payments", description: "Email me when a payment is recorded." },
      { key: "maintenance_updates", label: "Repairs", description: "Email me when a tenant reports a repair." },
      { key: "lease_expiration", label: "Lease ending", description: "Email me before a lease ends." },
      { key: "manager_invoice", label: "My invoices", description: "Email me when an owner pays my fee." }
    ]);
  });

  it("R5 maps repair started to the repairs email preference", () => {
    expect(getNotificationPreferenceKeyForType("ticket_in_progress")).toBe("maintenance_updates");
  });

  it("R6 keeps the forward and rollback type sets exact and swaps constraints without a gap", () => {
    const sql = readFileSync(resolve(process.cwd(), "../../supabase/migrations/20261101_sprint244b_ticket_in_progress_type.sql"), "utf8");
    const expected = ["new_ticket", "late_rent", "ticket_resolved", "payment_recorded", "lease_updated",
      "document_sent", "document_signed", "application_reviewed", "rent_due_reminder", "invite_accepted",
      "owner_message", "announcement", "lease_expiring_soon", "lease_expired", "delinquency_escalation",
      "distribution_change_requested", "distribution_change_approved", "distribution_change_rejected",
      "withdrawal_requested", "withdrawal_approved", "withdrawal_rejected", "withdrawal_completed"];
    const clauses = [...sql.matchAll(/add constraint notifications_type_check_v[12] check \(type in \(([\s\S]*?)\)\) not valid;/g)];
    expect(clauses).toHaveLength(2);
    const types = (clause: string) => [...clause.matchAll(/'([^']+)'/g)].map((match) => match[1]);
    expect(types(clauses[0][1])).toEqual([...expected, "ticket_in_progress"]);
    expect(types(clauses[1][1])).toEqual(expected);
    for (const version of ["v2", "v1"]) {
      expect(sql).toContain(`validate constraint notifications_type_check_${version};`);
      expect(sql).toContain(`rename constraint notifications_type_check_${version} to notifications_type_check;`);
    }
    expect(sql.indexOf("validate constraint notifications_type_check_v2"))
      .toBeLessThan(sql.indexOf("drop constraint notifications_type_check;"));
    expect(sql).toContain("delete from notifications where type = 'ticket_in_progress';");
  });
  it.each([
    ["rent_due_reminder", "rent_due_reminder"],
    ["late_rent", "late_rent"],
    ["delinquency_escalation", "delinquency_escalation"],
    ["lease_expiring_soon", "lease_expiration"]
  ] as const)("N1 and N3 tenant %s consent blocks email and keeps in-app", (type, key) => {
    const owner = resolveTenantDeliveryPreference(null, type);
    const tenant = resolveTenantDeliveryPreference({ notification_preferences: { [key]: false } }, type);
    const merged = mergeDeliveryPreferences(owner, tenant);
    expect(merged.emailEnabled).toEqual(false);
    expect(merged.inAppEnabled).toEqual(true);
    expect(merged.emailBlockReason).toEqual(`${key} emails are disabled`);
  });

  it("N1 tenant pause blocks only email with the pause reason", () => {
    const owner = resolveTenantDeliveryPreference(null, "rent_due_reminder");
    const tenant = resolveTenantDeliveryPreference({
      notifications_paused_until: "9999-12-31T23:59:59.000Z"
    }, "rent_due_reminder");
    expect(mergeDeliveryPreferences(owner, tenant)).toEqual({
      emailEnabled: false, inAppEnabled: true,
      emailBlockReason: "email notifications are paused until resumed"
    });
  });

  it("N2 owner denial takes precedence over tenant permission", () => {
    const owner = resolveTenantDeliveryPreference({
      notification_preferences: { rent_due_reminder: false }
    }, "rent_due_reminder");
    const tenant = resolveTenantDeliveryPreference(null, "rent_due_reminder");
    expect(mergeDeliveryPreferences(owner, tenant)).toEqual({
      emailEnabled: false, inAppEnabled: true,
      emailBlockReason: "rent_due_reminder emails are disabled"
    });
  });
  it("returns false when the pause window is not active", () => {
    expect(areNotificationEmailsPaused(null)).toBe(false);
    expect(
      areNotificationEmailsPaused(
        "2026-03-21T12:00:00.000Z",
        new Date("2026-03-22T12:00:00.000Z").getTime()
      )
    ).toBe(false);
  });

  it("returns true when notifications are paused into the future", () => {
    expect(
      areNotificationEmailsPaused(
        "2026-03-23T12:00:00.000Z",
        new Date("2026-03-22T12:00:00.000Z").getTime()
      )
    ).toBe(true);
  });

  it("disables email delivery when a specific type is turned off", () => {
    expect(
      resolveNotificationDeliveryPreference(
        {
          preferences: {
            ...DEFAULT_NOTIFICATION_EMAIL_PREFERENCES,
            late_rent: false
          },
          pausedUntil: null,
          schemaReady: true
        },
        "late_rent"
      )
    ).toMatchObject({
      emailEnabled: false,
      inAppEnabled: true
    });
  });

  it("disables email delivery when the pause window is active", () => {
    expect(
      resolveNotificationDeliveryPreference(
        {
          preferences: { ...DEFAULT_NOTIFICATION_EMAIL_PREFERENCES },
          pausedUntil: "9999-12-31T23:59:59.000Z",
          schemaReady: true
        },
        "rent_due_reminder"
      )
    ).toMatchObject({
      emailEnabled: false,
      inAppEnabled: true
    });
  });

  it("defaults to enabled email delivery when no preference is stored", () => {
    expect(normalizeNotificationEmailPreferences(null)).toEqual(
      DEFAULT_NOTIFICATION_EMAIL_PREFERENCES
    );
  });

  it("calculates the 24 hour and 1 week pause windows from the current time", () => {
    const baseDate = new Date("2026-03-22T15:30:00.000Z");

    expect(resolveNotificationPauseUntil("24_hours", baseDate)).toBe(
      "2026-03-23T15:30:00.000Z"
    );
    expect(resolveNotificationPauseUntil("1_week", baseDate)).toBe(
      "2026-03-29T15:30:00.000Z"
    );
  });

  it("uses the far-future sentinel when paused until resumed", () => {
    expect(resolveNotificationPauseUntil("until_resumed")).toBe(
      "9999-12-31T23:59:59.000Z"
    );
  });

  it("blocks owner-controlled delivery when any controlling owner has paused emails", () => {
    const combined = resolveCombinedNotificationDeliveryPreference(
      [
        {
          preferences: { ...DEFAULT_NOTIFICATION_EMAIL_PREFERENCES },
          pausedUntil: null,
          schemaReady: true
        },
        {
          preferences: { ...DEFAULT_NOTIFICATION_EMAIL_PREFERENCES },
          pausedUntil: "9999-12-31T23:59:59.000Z",
          schemaReady: true
        }
      ],
      "rent_due_reminder"
    );

    expect(combined).toMatchObject({
      emailEnabled: false,
      inAppEnabled: true
    });
  });
});
