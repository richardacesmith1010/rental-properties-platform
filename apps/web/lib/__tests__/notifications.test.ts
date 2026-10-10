import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.hoisted(() => vi.fn());
const createAdminClientMock = vi.hoisted(() => vi.fn());
const buildNotificationEmailMock = vi.hoisted(() => vi.fn());
const shouldRecordSuccessfulDeliveryMock = vi.hoisted(() => vi.fn());
const ensureInboxThreadForEventMock = vi.hoisted(() => vi.fn());
const getNotificationPreferenceMock = vi.hoisted(() => vi.fn());
const getUserNotificationPreferenceSettingsMapMock = vi.hoisted(() => vi.fn());
const resolveNotificationDeliveryPreferenceMock = vi.hoisted(() => vi.fn());
const defaultNotificationPreferences = vi.hoisted(() => ({
  rent_due_reminder: true,
  late_rent: true,
  payment_received: true,
  maintenance_updates: true,
  lease_expiration: true,
  delinquency_escalation: true,
  manager_invoice: true
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: createAdminClientMock }));
vi.mock("@/lib/email-templates", () => ({ buildNotificationEmail: buildNotificationEmailMock }));
vi.mock("@/lib/idempotency", () => ({ shouldRecordSuccessfulDelivery: shouldRecordSuccessfulDeliveryMock }));
vi.mock("@/lib/inbox", () => ({ ensureInboxThreadForEvent: ensureInboxThreadForEventMock }));
vi.mock("@/lib/notification-preferences", () => ({
  DEFAULT_NOTIFICATION_EMAIL_PREFERENCES: defaultNotificationPreferences,
  getNotificationPreference: getNotificationPreferenceMock,
  getUserNotificationPreferenceSettingsMap: getUserNotificationPreferenceSettingsMapMock,
  resolveNotificationDeliveryPreference: resolveNotificationDeliveryPreferenceMock
}));

import { createNotificationWithDelivery, getNotificationsForUser, notifyPropertyTeam } from "@/lib/notifications";
import {
  createNotificationAdminClient, notificationDeliveryInserts, notificationUpserts
} from "./notification-test-helpers";

describe("notifications utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DOMUS_NOTIFICATIONS_ENABLED", "true");
    vi.spyOn(console, "error").mockImplementation(() => {});
    buildNotificationEmailMock.mockReturnValue("<p>Email</p>");
    shouldRecordSuccessfulDeliveryMock.mockReturnValue(true);
    ensureInboxThreadForEventMock.mockResolvedValue(undefined);
    getNotificationPreferenceMock.mockResolvedValue({ inAppEnabled: true, emailEnabled: false });
    getUserNotificationPreferenceSettingsMapMock.mockResolvedValue(new Map());
    resolveNotificationDeliveryPreferenceMock.mockReturnValue({
      inAppEnabled: true,
      emailEnabled: true,
      emailBlockReason: null
    });
    createClientMock.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: "notification-1",
                    type: "late_rent",
                    title: "Late rent",
                    body: "Past due",
                    entity_type: "rent_charge",
                    entity_id: "charge-1",
                    read_at: null,
                    created_at: "2026-03-01T00:00:00.000Z"
                  }
                ],
                error: null
              })
            }))
          }))
        }))
      }))
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("maps notification rows for getNotificationsForUser", async () => {
    const result = await getNotificationsForUser("user-1");

    expect(result).toEqual([
      {
        id: "notification-1",
        type: "late_rent",
        title: "Late rent",
        body: "Past due",
        entityType: "rent_charge",
        entityId: "charge-1",
        readAt: null,
        createdAt: "2026-03-01T00:00:00.000Z"
      }
    ]);
  });

  it("creates a notification record and in-app delivery", async () => {
    const admin = createNotificationAdminClient({ existingDeliveries: [] });
    createAdminClientMock.mockReturnValue(admin);

    await createNotificationWithDelivery({
      recipientProfileId: "user-1",
      recipientEmail: "user@example.com",
      type: "late_rent",
      title: "Late rent",
      body: "Past due",
      entityType: "rent_charge",
      entityId: "charge-1"
    });

    expect(admin.from).toHaveBeenCalledWith("notifications");
    expect(admin.from).toHaveBeenCalledWith("notification_deliveries");
  });

  it.each(["late_rent", "announcement"] as const)(
    "makes no database or fetch calls for %s when notifications are off",
    async (type) => {
      vi.stubEnv("DOMUS_NOTIFICATIONS_ENABLED", "false");
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      vi.spyOn(console, "info").mockImplementation(() => {});

      await createNotificationWithDelivery({
        recipientProfileId: "user-1",
        recipientEmail: "user@example.com",
        type,
        title: "Skipped",
        body: "Skipped",
        entityType: "test",
        entityId: "entity-1"
      });

      expect(createAdminClientMock).not.toHaveBeenCalled();
      expect(getNotificationPreferenceMock).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(console.info).toHaveBeenCalledWith(`[notifications] off: skipped ${type}`);
    }
  );

  it("handles missing email gracefully", async () => {
    const admin = createNotificationAdminClient({ existingDeliveries: [] });
    createAdminClientMock.mockReturnValue(admin);
    getNotificationPreferenceMock.mockResolvedValueOnce({ inAppEnabled: true, emailEnabled: true });

    await expect(
      createNotificationWithDelivery({
        recipientProfileId: "user-1",
        recipientEmail: null,
        type: "late_rent",
        title: "Late rent",
        body: "Past due",
        entityType: "rent_charge",
        entityId: "charge-1"
      })
    ).resolves.toBeUndefined();
  });

  it("uses custom email content when provided", async () => {
    const admin = createNotificationAdminClient({ existingDeliveries: [] });
    createAdminClientMock.mockReturnValue(admin);
    getNotificationPreferenceMock.mockResolvedValueOnce({ inAppEnabled: false, emailEnabled: true });
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "alerts@domusbase.com");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: "email-1" })
    });
    vi.stubGlobal("fetch", fetchMock);

    await createNotificationWithDelivery({
      recipientProfileId: "user-1",
      recipientEmail: "user@example.com",
      type: "rent_due_reminder",
      title: "Rent due soon",
      body: "Body",
      entityType: "rent_charge",
      entityId: "charge-1",
      emailContent: {
        subject: "Custom reminder",
        text: "Custom text",
        html: "<p>Custom html</p>"
      }
    });

    expect(buildNotificationEmailMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"subject\":\"Custom reminder\"")
      })
    );
  });

  it("skips notification creation when all preferences are disabled", async () => {
    const admin = createNotificationAdminClient({ existingDeliveries: [] });
    createAdminClientMock.mockReturnValue(admin);
    getNotificationPreferenceMock.mockResolvedValueOnce({ inAppEnabled: false, emailEnabled: false });

    await createNotificationWithDelivery({
      recipientProfileId: "user-1",
      recipientEmail: "user@example.com",
      type: "late_rent",
      title: "Late rent",
      body: "Past due",
      entityType: "rent_charge",
      entityId: "charge-1"
    });

    expect(admin.from).not.toHaveBeenCalledWith("notifications");
  });

  it("notifies all eligible owner members for a property", async () => {
    const admin = createNotificationAdminClient({
      property: { owner_account_id: "account-1" },
      members: [
        { profile_id: "owner-1", can_receive_critical_alerts: true },
        { profile_id: "owner-2", can_receive_critical_alerts: true }
      ],
      profiles: [
        { id: "owner-1", email: "owner1@example.com" },
        { id: "owner-2", email: "owner2@example.com" }
      ]
    });
    createAdminClientMock.mockReturnValue(admin);

    await notifyPropertyTeam({
      propertyId: "property-1",
      type: "late_rent",
      title: "Late rent",
      body: "Past due",
      entityType: "rent_charge",
      entityId: "charge-1"
    });

    expect(admin.from).toHaveBeenCalledWith("profiles");
    expect(admin.from).toHaveBeenCalledWith("notifications");
  });

  it("handles properties with no eligible members", async () => {
    const admin = createNotificationAdminClient({
      property: { owner_account_id: "account-1" },
      members: [],
      profiles: []
    });
    createAdminClientMock.mockReturnValue(admin);

    await notifyPropertyTeam({
      propertyId: "property-1",
      type: "late_rent",
      title: "Late rent",
      body: "Past due",
      entityType: "rent_charge"
    });

    expect(admin.from).not.toHaveBeenCalledWith("notifications");
  });

  it("handles Supabase errors without throwing", async () => {
    const admin = createNotificationAdminClient({ throwsOnPropertyLookup: true });
    createAdminClientMock.mockReturnValue(admin);

    await expect(
      notifyPropertyTeam({
        propertyId: "property-1",
        type: "late_rent",
        title: "Late rent",
        body: "Past due",
        entityType: "rent_charge"
      })
    ).resolves.toBeUndefined();
  });
  it.each([
    { canonical: "allowed@example.com", caller: "other@example.com", allowed: true },
    { canonical: "blocked@example.com", caller: "allowed@example.com", allowed: false },
    { canonical: null, caller: "allowed@example.com", allowed: false }
  ])("test mode gates the canonical profile email: $canonical", async ({ canonical, caller, allowed }) => {
    vi.stubEnv("DOMUS_NOTIFICATIONS_ALLOWLIST", "allowed@example.com");
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "alerts@domusbase.com");
    vi.spyOn(console, "info").mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ id: "email-1" }) });
    vi.stubGlobal("fetch", fetchMock);
    getNotificationPreferenceMock.mockResolvedValue({ inAppEnabled: true, emailEnabled: true });
    const admin = createNotificationAdminClient({ profiles: [{ id: "user-1", email: canonical }] });
    createAdminClientMock.mockReturnValue(admin);
    await createNotificationWithDelivery({
      recipientProfileId: "user-1", recipientEmail: caller, type: "late_rent",
      title: "Rent late", body: "Due", entityType: "rent_charge", entityId: "charge-1"
    });
    expect(notificationUpserts(admin)).toHaveLength(allowed ? 1 : 0);
    if (!allowed) expect(admin.from).not.toHaveBeenCalledWith("notification_deliveries");
    expect(fetchMock).toHaveBeenCalledTimes(allowed ? 1 : 0);
    if (allowed) expect(JSON.parse(fetchMock.mock.calls[0][1].body).to).toEqual(["allowed@example.com"]);
  });

  it("test mode fails closed when the profile lookup errors", async () => {
    vi.stubEnv("DOMUS_NOTIFICATIONS_ALLOWLIST", "allowed@example.com");
    vi.spyOn(console, "info").mockImplementation(() => {});
    const admin = createNotificationAdminClient({ profileLookupError: true, profiles: [{ id: "user-1", email: "allowed@example.com" }] });
    createAdminClientMock.mockReturnValue(admin);
    await createNotificationWithDelivery({
      recipientProfileId: "user-1",
      recipientEmail: "allowed@example.com",
      type: "new_ticket",
      title: "Ticket",
      body: "Body",
      entityType: "ticket"
    });
    expect(notificationUpserts(admin)).toHaveLength(0);
    expect(admin.from).not.toHaveBeenCalledWith("notification_deliveries");
  });

  it("routes only authorized client managers and current account owners, without duplicates", async () => {
    const admin = createNotificationAdminClient({
      managedClient: true,
      members: [{ profile_id: "owner-1", can_receive_critical_alerts: true }],
      assignments: ["manager-1", "manager-1", "manager-2"],
      accountLinks: ["manager-1", "manager-2"],
      profiles: [
        { id: "owner-1", email: "owner@example.com" },
        { id: "manager-1", email: "one@example.com" },
        { id: "manager-2", email: "two@example.com" }
      ]
    });
    createAdminClientMock.mockReturnValue(admin);
    await notifyPropertyTeam({
      propertyId: "property-1",
      event: "rent_paid_manual",
      type: "payment_recorded",
      title: "Paid",
      body: "Body",
      entityType: "rent_charge",
      actorProfileId: "owner-1"
    });
    expect(notificationUpserts(admin).map(([row]) => row.recipient_profile_id).sort()).toEqual(["manager-1", "manager-2"]);
  });

  it("does not notify a client manager without the active account link", async () => {
    const admin = createNotificationAdminClient({
      managedClient: true,
      assignments: ["manager-1"],
      profiles: [{ id: "manager-1", email: "one@example.com" }]
    });
    createAdminClientMock.mockReturnValue(admin);
    await notifyPropertyTeam({
      propertyId: "property-1",
      event: "late_fee",
      type: "late_rent",
      title: "Late",
      body: "Body",
      entityType: "rent_charge"
    });
    expect(notificationUpserts(admin)).toHaveLength(0);
  });

  it("one owner upsert failure leaves only the other owner's matching row, deliveries, and email", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "alerts@domusbase.com");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: vi.fn().mockResolvedValue({ id: "email-1" })
    });
    vi.stubGlobal("fetch", fetchMock);
    const config = {
      members: [
        { profile_id: "owner-1", can_receive_critical_alerts: true },
        { profile_id: "owner-2", can_receive_critical_alerts: true }
      ],
      profiles: [
        { id: "owner-1", email: "one@example.com" },
        { id: "owner-2", email: "two@example.com" },
        { id: "unrelated", email: "other@example.com" }
      ],
      failingRecipients: ["owner-1"]
    };
    const admin = createNotificationAdminClient(config);
    createAdminClientMock.mockReturnValue(admin);
    await notifyPropertyTeam({
      propertyId: "property-1", event: "late_fee", type: "late_rent",
      title: "Owner notice A", body: "Charge A only", entityType: "rent_charge", entityId: "charge-a"
    });
    expect(notificationUpserts(admin).map(([row]) => [row.recipient_profile_id, row.title, row.body]))
      .toEqual([
        ["owner-1", "Owner notice A", "Charge A only"],
        ["owner-2", "Owner notice A", "Charge A only"]
      ]);
    expect(notificationDeliveryInserts(admin).map(([row]) => [row.notification_id, row.channel]))
      .toEqual([
        ["notification-owner-2", "in_app"],
        ["notification-owner-2", "email"]
      ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).to).toEqual(["two@example.com"]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).subject).toBe("Owner notice A");
    config.members = [{ profile_id: "owner-2", can_receive_critical_alerts: true }];
    await notifyPropertyTeam({
      propertyId: "property-1", event: "late_fee", type: "late_rent",
      title: "Owner notice B", body: "Charge B only", entityType: "rent_charge", entityId: "charge-b"
    });
    expect(notificationUpserts(admin).map(([row]) => [row.recipient_profile_id, row.title, row.body]))
      .toEqual([
        ["owner-1", "Owner notice A", "Charge A only"],
        ["owner-2", "Owner notice A", "Charge A only"],
        ["owner-2", "Owner notice B", "Charge B only"]
      ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      to: ["two@example.com"], subject: "Owner notice B"
    });
    expect(notificationDeliveryInserts(admin)).toHaveLength(4);
  });

  it("gates inbox mirrors in off and test but runs them on", async () => {
    const admin = createNotificationAdminClient({
      members: [{ profile_id: "owner-1", can_receive_critical_alerts: true }],
      profiles: [{ id: "owner-1", email: "owner@example.com" }]
    });
    createAdminClientMock.mockReturnValue(admin);
    const input = {
      propertyId: "property-1",
      event: "ticket_created" as const,
      type: "new_ticket" as const,
      title: "Ticket",
      body: "Body",
      entityType: "maintenance_ticket"
    };
    vi.stubEnv("DOMUS_NOTIFICATIONS_ENABLED", "false");
    await notifyPropertyTeam(input);
    vi.stubEnv("DOMUS_NOTIFICATIONS_ALLOWLIST", "owner@example.com");
    await notifyPropertyTeam(input);
    expect(notificationUpserts(admin)).toHaveLength(1);
    expect(ensureInboxThreadForEventMock).not.toHaveBeenCalled();
    vi.stubEnv("DOMUS_NOTIFICATIONS_ALLOWLIST", "");
    vi.stubEnv("DOMUS_NOTIFICATIONS_ENABLED", "true");
    await notifyPropertyTeam(input);
    expect(ensureInboxThreadForEventMock).toHaveBeenCalledTimes(1);
  });

  it("forces email off for in-app-only events even when preferences permit it", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "alerts@domusbase.com");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    getNotificationPreferenceMock.mockResolvedValue({ inAppEnabled: true, emailEnabled: true });
    const admin = createNotificationAdminClient({});
    createAdminClientMock.mockReturnValue(admin);
    await createNotificationWithDelivery({
      recipientProfileId: "user-1",
      recipientEmail: "user@example.com",
      type: "lease_updated",
      title: "Lease",
      body: "Updated",
      entityType: "lease",
      emailMode: "never"
    });
    expect(notificationUpserts(admin)).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not notify a direct-message sender even when they are the recipient", async () => {
    await createNotificationWithDelivery({
      recipientProfileId: "sender-1",
      actorProfileId: "sender-1",
      recipientEmail: "sender@example.com",
      type: "owner_message",
      title: "Message",
      body: "Body",
      entityType: "inbox_thread"
    });
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

});
