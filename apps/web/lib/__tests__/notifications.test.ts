import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.hoisted(() => vi.fn());
const createAdminClientMock = vi.hoisted(() => vi.fn());
const buildNotificationEmailMock = vi.hoisted(() => vi.fn());
const shouldRecordSuccessfulDeliveryMock = vi.hoisted(() => vi.fn());
const ensureInboxThreadForEventMock = vi.hoisted(() => vi.fn());
const getNotificationPreferenceMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: createAdminClientMock }));
vi.mock("@/lib/email-templates", () => ({ buildNotificationEmail: buildNotificationEmailMock }));
vi.mock("@/lib/idempotency", () => ({ shouldRecordSuccessfulDelivery: shouldRecordSuccessfulDeliveryMock }));
vi.mock("@/lib/inbox", () => ({ ensureInboxThreadForEvent: ensureInboxThreadForEventMock }));
vi.mock("@/lib/notification-preferences", () => ({ getNotificationPreference: getNotificationPreferenceMock }));

import { createNotificationWithDelivery, getNotificationsForUser, notifyOwnerMembersForProperty } from "@/lib/notifications";

interface NotificationAdminConfig {
  notificationId?: string;
  existingDeliveries?: Array<{ channel: string; status: string }>;
  property?: { owner_account_id: string | null } | null;
  members?: Array<{ profile_id: string; can_receive_critical_alerts: boolean }>;
  profiles?: Array<{ id: string; email: string | null }>;
  throwsOnPropertyLookup?: boolean;
}

function createNotificationAdminClient(config: NotificationAdminConfig): SupabaseClient {
  const deliveryInsertMock = vi.fn().mockResolvedValue({ error: null });
  const notificationsUpsertMock = vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn().mockResolvedValue({ data: { id: config.notificationId ?? "notification-1" }, error: null })
    }))
  }));

  const from = vi.fn((table: string) => {
    if (table === "notifications") {
      return {
        upsert: notificationsUpsertMock
      };
    }

    if (table === "notification_deliveries") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ data: config.existingDeliveries ?? [], error: null })
        })),
        insert: deliveryInsertMock
      };
    }

    if (table === "properties") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: config.throwsOnPropertyLookup
              ? vi.fn().mockRejectedValue(new Error("property lookup failed"))
              : vi.fn().mockResolvedValue({ data: config.property ?? { owner_account_id: "account-1" }, error: null })
          }))
        }))
      };
    }

    if (table === "ownership_account_members") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ data: config.members ?? [], error: null })
            }))
          }))
        }))
      };
    }

    if (table === "profiles") {
      return {
        select: vi.fn(() => ({
          in: vi.fn().mockResolvedValue({ data: config.profiles ?? [], error: null })
        }))
      };
    }

    return {
      select: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }))
    };
  });

  return { from } as unknown as SupabaseClient;
}

describe("notifications utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    buildNotificationEmailMock.mockReturnValue("<p>Email</p>");
    shouldRecordSuccessfulDeliveryMock.mockReturnValue(true);
    ensureInboxThreadForEventMock.mockResolvedValue(undefined);
    getNotificationPreferenceMock.mockResolvedValue({ inAppEnabled: true, emailEnabled: false });
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

    await notifyOwnerMembersForProperty({
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

    await notifyOwnerMembersForProperty({
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
      notifyOwnerMembersForProperty({
        propertyId: "property-1",
        type: "late_rent",
        title: "Late rent",
        body: "Past due",
        entityType: "rent_charge"
      })
    ).resolves.toBeUndefined();
  });
});
