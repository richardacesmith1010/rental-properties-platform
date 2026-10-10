import { beforeEach, describe, expect, it, vi } from "vitest";
import { addTicketComment } from "@/app/actions/maintenance-comment-actions";
import {
  createNotificationAdminClient, notificationDeliveryInserts, notificationUpserts
} from "@/lib/__tests__/notification-test-helpers";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(), auth: vi.fn(), canAdmin: vi.fn(), rate: vi.fn(),
  team: vi.fn(), notification: vi.fn(), audit: vi.fn()
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/property-access", () => ({ canUserAdministerProperty: mocks.canAdmin }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.rate }));
vi.mock("@/lib/notifications", () => ({
  notifyPropertyTeam: mocks.team,
  createNotificationWithDelivery: mocks.notification
}));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.audit }));
vi.mock("@/lib/logger", () => ({ sideEffectError: () => () => undefined }));
vi.mock("@/lib/inbox", () => ({ ensureInboxThreadForEvent: vi.fn() }));
vi.mock("@/lib/idempotency", () => ({ shouldRecordSuccessfulDelivery: () => true }));
vi.mock("@/lib/notification-preferences", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/notification-preferences")>(),
  getUserNotificationPreferenceSettingsMap: vi.fn().mockResolvedValue(new Map()),
  resolveNotificationDeliveryPreference: () => ({ inAppEnabled: true, emailEnabled: true }),
  getNotificationPreference: vi.fn().mockResolvedValue({ inAppEnabled: true, emailEnabled: true })
}));

const ticketId = "550e8400-e29b-41d4-a716-446655440000";
const ticket = { id: ticketId, property_id: "property-1", tenant_profile_id: "tenant-1", title: "Leak" };

function form(internal = false) {
  const data = new FormData();
  data.set("ticketId", ticketId);
  data.set("body", "A new comment");
  if (internal) data.set("isInternal", "true");
  return data;
}

function adminMock() {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn((table: string) => {
    if (table === "maintenance_tickets") {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: ticket, error: null }) }) }) };
    }
    if (table === "maintenance_comments") return { insert };
    if (table === "profiles") {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({
        data: { id: "tenant-1", email: "tenant@example.com" }, error: null
      }) }) }) };
    }
    throw new Error(`unexpected table ${table}`);
  });
  return { from, insert };
}

describe("ticket comment notification recipients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rate.mockReturnValue({ allowed: true });
    mocks.canAdmin.mockResolvedValue(true);
    mocks.team.mockResolvedValue(undefined);
    mocks.notification.mockResolvedValue(undefined);
    mocks.audit.mockResolvedValue(undefined);
    mocks.admin.mockReturnValue(adminMock());
  });

  it("rejects an allowlisted tenant who does not own the stored ticket", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "other-tenant" }, role: "tenant" });
    const result = await addTicketComment(null, form());
    expect(result).toMatchObject({ success: false, error: "You do not have access to this ticket." });
    expect(mocks.team).not.toHaveBeenCalled();
    expect(mocks.notification).not.toHaveBeenCalled();
  });

  it("excludes the tenant author and makes the property-team comment in-app only", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "tenant-1" }, role: "tenant" });
    expect(await addTicketComment(null, form())).toMatchObject({ success: true });
    expect(mocks.team).toHaveBeenCalledWith(expect.objectContaining({
      event: "ticket_comment", actorProfileId: "tenant-1", emailMode: "never"
    }));
    expect(mocks.notification).not.toHaveBeenCalled();
  });

  it.each(["owner", "manager"])("notifies the tenant but not the %s author by email", async (role) => {
    mocks.auth.mockResolvedValue({ user: { id: `${role}-1` }, role });
    expect(await addTicketComment(null, form())).toMatchObject({ success: true });
    expect(mocks.team).toHaveBeenCalledWith(expect.objectContaining({
      event: "ticket_comment", actorProfileId: `${role}-1`, emailMode: "never"
    }));
    expect(mocks.notification).toHaveBeenCalledWith(expect.objectContaining({
      recipientProfileId: "tenant-1", emailMode: "never"
    }));
  });

  it("does not reveal an internal comment to the tenant", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "owner-1" }, role: "owner" });
    expect(await addTicketComment(null, form(true))).toMatchObject({ success: true });
    expect(mocks.notification).not.toHaveBeenCalled();
  });

  it.each([
    ["tenant-1", "tenant", ["dual-role", "manager-1", "owner-1", "owner-2"]],
    ["owner-1", "owner", ["dual-role", "manager-1", "owner-2", "tenant-1"]],
    ["manager-1", "manager", ["dual-role", "owner-1", "owner-2", "tenant-1"]],
    ["dual-role", "owner", ["manager-1", "owner-1", "owner-2", "tenant-1"]]
  ])("%s comment writes other participants' in-app rows only", async (actorId, role, expected) => {
    vi.stubEnv("DOMUS_NOTIFICATIONS_ENABLED", "true");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const notificationsAdmin = createNotificationAdminClient({
      members: [
        { profile_id: "owner-1", can_receive_critical_alerts: true },
        { profile_id: "owner-2", can_receive_critical_alerts: true },
        { profile_id: "dual-role", can_receive_critical_alerts: true }
      ],
      assignments: ["manager-1", "dual-role", {
        manager_profile_id: "other-home", property_id: "property-2", active: true
      }],
      profiles: ["tenant-1", "owner-1", "owner-2", "manager-1", "dual-role", "other-home"]
        .map((id) => ({ id, email: `${id}@example.com` }))
    });
    const insert = vi.fn().mockResolvedValue({ error: null });
    mocks.admin.mockReturnValue({ from: (table: string) => {
      if (table === "maintenance_tickets") return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: ticket, error: null }) }) })
      };
      if (table === "maintenance_comments") return { insert };
      return notificationsAdmin.from(table);
    } });
    const actual = await vi.importActual<typeof import("@/lib/notifications")>("@/lib/notifications");
    mocks.notification.mockImplementation(actual.createNotificationWithDelivery);
    mocks.team.mockImplementation(async (params: Parameters<typeof actual.notifyPropertyTeam>[0]) =>
      (await import("@/lib/notification-fanout")).notifyPropertyTeam(params));
    mocks.auth.mockResolvedValue({ user: { id: actorId }, role });
    expect(await addTicketComment(null, form())).toMatchObject({ success: true });
    await vi.waitFor(() => expect(notificationUpserts(notificationsAdmin)).toHaveLength(expected.length));
    expect(notificationUpserts(notificationsAdmin).map(([row]) => row.recipient_profile_id).sort())
      .toEqual(expected);
    expect(notificationDeliveryInserts(notificationsAdmin)).toHaveLength(expected.length);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
});
