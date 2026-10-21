import { describe, expect, it } from "vitest";
import {
  areNotificationEmailsPaused,
  DEFAULT_NOTIFICATION_EMAIL_PREFERENCES,
  normalizeNotificationEmailPreferences,
  mergeDeliveryPreferences,
  resolveTenantDeliveryPreference,
  resolveCombinedNotificationDeliveryPreference,
  resolveNotificationDeliveryPreference,
  resolveNotificationPauseUntil
} from "@/lib/notification-preferences";

describe("notification preference helpers", () => {
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
