import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notifyPropertyTeam } from "@/lib/notifications";
import {
  createNotificationAdminClient,
  notificationUpserts,
  type NotificationAdminConfig
} from "./notification-test-helpers";

const createAdminClientMock = vi.hoisted(() => vi.fn());
const getUserSettingsMock = vi.hoisted(() => vi.fn());
const resolvePreferenceMock = vi.hoisted(() => vi.fn());
const ensureInboxThreadMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: createAdminClientMock }));
vi.mock("@/lib/inbox", () => ({ ensureInboxThreadForEvent: ensureInboxThreadMock }));
vi.mock("@/lib/idempotency", () => ({ shouldRecordSuccessfulDelivery: () => true }));
vi.mock("@/lib/notification-preferences", () => ({
  DEFAULT_NOTIFICATION_EMAIL_PREFERENCES: {},
  getUserNotificationPreferenceSettingsMap: getUserSettingsMock,
  resolveNotificationDeliveryPreference: resolvePreferenceMock
}));

describe("notification property-team policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DOMUS_NOTIFICATIONS_ENABLED", "true");
    vi.spyOn(console, "error").mockImplementation(() => {});
    getUserSettingsMock.mockResolvedValue(new Map());
    resolvePreferenceMock.mockReturnValue({ inAppEnabled: true, emailEnabled: false });
    ensureInboxThreadMock.mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each([
    ["payment_recorded", "rent_paid_stripe", false],
    ["late_rent", "late_fee", false],
    ["new_ticket", "ticket_created", true],
    ["lease_expiring_soon", "lease_ending_soon", true],
    ["lease_expired", "lease_ended", true]
  ] as const)("ordinary manager scope for %s", async (type, event, expected) => {
    const admin = createNotificationAdminClient({
      assignments: ["manager-1"],
      profiles: [{ id: "manager-1", email: "manager@example.com" }]
    });
    createAdminClientMock.mockReturnValue(admin);
    await notifyPropertyTeam({ propertyId: "property-1", event, type, title: "Update", body: "Body", entityType: "lease" });
    expect(notificationUpserts(admin)).toHaveLength(expected ? 1 : 0);
  });

  it("test allowlist cannot authorize inactive assignment, inactive link, or wrong account", async () => {
    vi.stubEnv("DOMUS_NOTIFICATIONS_ALLOWLIST", "manager@example.com");
    const config: NotificationAdminConfig = {
      managedClient: true,
      assignments: [{ manager_profile_id: "manager-1", active: false }],
      accountLinks: ["manager-1"],
      profiles: [{ id: "manager-1", email: "manager@example.com" }]
    };
    const admin = createNotificationAdminClient(config);
    createAdminClientMock.mockReturnValue(admin);
    const input = {
      propertyId: "property-1",
      event: "late_fee" as const,
      type: "late_rent" as const,
      title: "Late",
      body: "Body",
      entityType: "rent_charge"
    };
    await notifyPropertyTeam(input);
    config.assignments = ["manager-1"];
    config.accountLinks = [{ manager_profile_id: "manager-1", active: false }];
    await notifyPropertyTeam(input);
    config.accountLinks = [];
    config.accountLinksByAccount = { "other-account": ["manager-1"] };
    await notifyPropertyTeam(input);
    expect(notificationUpserts(admin)).toHaveLength(0);
  });

  it("uses only owners from the property's current account after a move", async () => {
    const config: NotificationAdminConfig = {
      property: { owner_account_id: "account-1" },
      membersByAccount: {
        "account-1": [{ profile_id: "old-owner", can_receive_critical_alerts: true }],
        "account-2": [{ profile_id: "new-owner", can_receive_critical_alerts: true }]
      },
      profiles: [{ id: "old-owner", email: "old@example.com" }, { id: "new-owner", email: "new@example.com" }]
    };
    const admin = createNotificationAdminClient(config);
    createAdminClientMock.mockReturnValue(admin);
    const input = {
      propertyId: "property-1",
      event: "late_fee" as const,
      type: "late_rent" as const,
      title: "Late",
      body: "Body",
      entityType: "rent_charge"
    };
    await notifyPropertyTeam(input);
    config.property = { owner_account_id: "account-2" };
    await notifyPropertyTeam(input);
    expect(notificationUpserts(admin).map(([row]) => row.recipient_profile_id)).toEqual(["old-owner", "new-owner"]);
  });

  it("deduplicates an owner who is also a manager and keeps cron owners included", async () => {
    const admin = createNotificationAdminClient({
      members: [{ profile_id: "dual-role", can_receive_critical_alerts: true }],
      assignments: ["dual-role"],
      profiles: [{ id: "dual-role", email: "dual@example.com" }]
    });
    createAdminClientMock.mockReturnValue(admin);
    await notifyPropertyTeam({
      propertyId: "property-1",
      event: "ticket_created",
      type: "new_ticket",
      title: "Ticket",
      body: "Body",
      entityType: "maintenance_ticket"
    });
    await notifyPropertyTeam({
      propertyId: "property-1",
      event: "autopay_failed",
      type: "late_rent",
      title: "Failed",
      body: "Body",
      entityType: "rent_charge"
    });
    expect(notificationUpserts(admin).map(([row]) => row.recipient_profile_id)).toEqual(["dual-role", "dual-role"]);
  });

  it("keeps other recipients isolated after one upsert fails", async () => {
    const admin = createNotificationAdminClient({
      members: [
        { profile_id: "owner-1", can_receive_critical_alerts: true },
        { profile_id: "owner-2", can_receive_critical_alerts: true }
      ],
      profiles: [
        { id: "owner-1", email: "one@example.com" },
        { id: "owner-2", email: "two@example.com" }
      ],
      failingRecipients: ["owner-1"]
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
    expect(notificationUpserts(admin).map(([row]) => row.recipient_profile_id)).toEqual(["owner-1", "owner-2"]);
    expect(admin.from).toHaveBeenCalledWith("notification_deliveries");
  });

  it.each([
    ["rent_paid_stripe", "payment_recorded"],
    ["late_fee", "late_rent"],
    ["overdue_followup", "delinquency_escalation"],
    ["autopay_failed", "late_rent"],
    ["bank_payment_failed", "late_rent"]
  ] as const)("sends %s to an account-linked client manager", async (event, type) => {
    const admin = createNotificationAdminClient({
      managedClient: true,
      assignments: ["manager-1"],
      accountLinks: ["manager-1"],
      profiles: [{ id: "manager-1", email: "manager@example.com" }]
    });
    createAdminClientMock.mockReturnValue(admin);
    await notifyPropertyTeam({
      propertyId: "property-1", event, type,
      title: "Update", body: "Body", entityType: "rent_charge"
    });
    expect(notificationUpserts(admin).map(([row]) => row.recipient_profile_id)).toEqual(["manager-1"]);
  });

  it.each(["autopay_failed", "bank_payment_failed"] as const)(
    "%s reaches every owner and only client-home managers",
    async (event) => {
      const admin = createNotificationAdminClient({
        managedClient: true,
        members: [
          { profile_id: "owner-1", can_receive_critical_alerts: true },
          { profile_id: "owner-2", can_receive_critical_alerts: true }
        ],
        assignments: ["manager-1", {
          manager_profile_id: "manager-other", property_id: "property-2", active: true
        }],
        accountLinks: ["manager-1", "manager-other"],
        profiles: ["owner-1", "owner-2", "manager-1", "manager-other"]
          .map((id) => ({ id, email: `${id}@example.com` }))
      });
      createAdminClientMock.mockReturnValue(admin);
      await notifyPropertyTeam({
        propertyId: "property-1", event, type: "late_rent",
        title: "Payment failed", body: "Charge 1 failed", entityType: "rent_charge"
      });
      expect(notificationUpserts(admin).map(([row]) => row.recipient_profile_id).sort())
        .toEqual(["manager-1", "owner-1", "owner-2"]);
    }
  );

  it.each([
    ["lease_changed", "lease_updated"],
    ["ticket_resolved", "ticket_resolved"]
  ] as const)("mirrors %s in on mode without notifying the team", async (event, type) => {
    const admin = createNotificationAdminClient({
      members: [{ profile_id: "owner-1", can_receive_critical_alerts: true }],
      assignments: ["manager-1"],
      profiles: [
        { id: "owner-1", email: "owner@example.com" },
        { id: "manager-1", email: "manager@example.com" }
      ]
    });
    createAdminClientMock.mockReturnValue(admin);
    await notifyPropertyTeam({
      propertyId: "property-1", event, type,
      title: "Update", body: "Body", entityType: "maintenance_ticket"
    });
    expect(notificationUpserts(admin)).toHaveLength(0);
    expect(ensureInboxThreadMock).toHaveBeenCalledTimes(1);
  });

  it("new ticket goes to the home team and not to its tenant", async () => {
    const admin = createNotificationAdminClient({
      members: [{ profile_id: "owner-1", can_receive_critical_alerts: true }],
      profiles: [
        { id: "owner-1", email: "owner@example.com" },
        { id: "tenant-1", email: "tenant@example.com" }
      ]
    });
    createAdminClientMock.mockReturnValue(admin);
    await notifyPropertyTeam({
      propertyId: "property-1", event: "ticket_created", type: "new_ticket",
      title: "Ticket", body: "Body", entityType: "maintenance_ticket"
    });
    expect(notificationUpserts(admin).map(([row]) => row.recipient_profile_id)).toEqual(["owner-1"]);
  });

  it.each([
    ["tenant-1", ["dual-role", "manager-1", "owner-1", "owner-2"]],
    ["owner-1", ["dual-role", "manager-1", "owner-2"]],
    ["manager-1", ["dual-role", "owner-1", "owner-2"]],
    ["dual-role", ["manager-1", "owner-1", "owner-2"]]
  ])("ticket comment by %s excludes author and emails nobody", async (actorProfileId, expected) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "alerts@domusbase.com");
    resolvePreferenceMock.mockReturnValue({ inAppEnabled: true, emailEnabled: true });
    const admin = createNotificationAdminClient({
      members: [
        { profile_id: "owner-1", can_receive_critical_alerts: true },
        { profile_id: "owner-2", can_receive_critical_alerts: true },
        { profile_id: "dual-role", can_receive_critical_alerts: true }
      ],
      assignments: ["manager-1", "dual-role", {
        manager_profile_id: "other-home-manager", property_id: "property-2", active: true
      }],
      profiles: ["owner-1", "owner-2", "manager-1", "dual-role", "tenant-1", "other-home-manager"]
        .map((id) => ({ id, email: `${id}@example.com` }))
    });
    createAdminClientMock.mockReturnValue(admin);
    await notifyPropertyTeam({
      propertyId: "property-1", event: "ticket_comment", type: "new_ticket",
      title: "New maintenance comment", body: "Leak update", entityType: "maintenance_ticket",
      entityId: "ticket-1", actorProfileId, emailMode: "never"
    });
    expect(notificationUpserts(admin).map(([row]) => row.recipient_profile_id).sort()).toEqual(expected);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("isolates a failed canonical profile lookup from the next test recipient", async () => {
    vi.stubEnv("DOMUS_NOTIFICATIONS_ALLOWLIST", "one@example.com,two@example.com");
    const admin = createNotificationAdminClient({
      members: [
        { profile_id: "owner-1", can_receive_critical_alerts: true },
        { profile_id: "owner-2", can_receive_critical_alerts: true }
      ],
      profiles: [
        { id: "owner-1", email: "one@example.com" },
        { id: "owner-2", email: "two@example.com" }
      ],
      profileLookupErrorIds: ["owner-1"]
    });
    createAdminClientMock.mockReturnValue(admin);
    await notifyPropertyTeam({
      propertyId: "property-1", event: "late_fee", type: "late_rent",
      title: "Late", body: "Body", entityType: "rent_charge"
    });
    expect(notificationUpserts(admin).map(([row]) => row.recipient_profile_id)).toEqual(["owner-2"]);
  });

  it("keeps accepted tenant invitations with current owner recipients", async () => {
    const admin = createNotificationAdminClient({
      members: [{ profile_id: "owner-1", can_receive_critical_alerts: true }],
      profiles: [{ id: "owner-1", email: "owner@example.com" }]
    });
    createAdminClientMock.mockReturnValue(admin);
    await notifyPropertyTeam({
      propertyId: "property-1", type: "invite_accepted",
      title: "Tenant invite accepted", body: "Accepted", entityType: "invitation",
      actorProfileId: "tenant-1"
    });
    expect(notificationUpserts(admin).map(([row]) => row.recipient_profile_id)).toEqual(["owner-1"]);
  });

});
