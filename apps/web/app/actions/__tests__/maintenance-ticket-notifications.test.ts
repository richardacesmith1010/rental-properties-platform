import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMaintenanceTicket, updateTicketStatus } from "@/app/actions/maintenance-ticket-actions";
import {
  createNotificationAdminClient, notificationUpserts
} from "@/lib/__tests__/notification-test-helpers";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), admin: vi.fn(), canAdmin: vi.fn(), rate: vi.fn(),
  team: vi.fn(), notification: vi.fn(), audit: vi.fn(), history: vi.fn()
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/property-access", () => ({ canUserAdministerProperty: mocks.canAdmin }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.rate }));
vi.mock("@/lib/maintenance", () => ({ logMaintenanceStatusChange: mocks.history }));
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
  resolveNotificationDeliveryPreference: () => ({ inAppEnabled: true, emailEnabled: false }),
  getNotificationPreference: vi.fn().mockResolvedValue({ inAppEnabled: true, emailEnabled: false })
}));
vi.mock("@/app/actions/maintenance-queries", () => ({
  getMaintenancePhotoFiles: () => [], uploadPhotosForTicket: vi.fn()
}));

const ticketId = "550e8400-e29b-41d4-a716-446655440000";
let currentStatus = "open";
let currentTenant: string | null = "tenant-1";

function form(status: string) {
  const data = new FormData();
  data.set("ticketId", ticketId);
  data.set("status", status);
  return data;
}

describe("resolved ticket notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentStatus = "open";
    currentTenant = "tenant-1";
    const supabase = {
      from: vi.fn(() => ({
        select: () => ({ eq: () => ({ single: async () => ({
          data: {
            id: ticketId, property_id: "property-1", tenant_profile_id: currentTenant,
            title: "Leak", status: currentStatus
          }, error: null
        }) }) }),
        update: (data: { status: string }) => ({ eq: async () => {
          currentStatus = data.status;
          return { error: null };
        } })
      }))
    };
    mocks.auth.mockResolvedValue({ user: { id: "manager-1" }, supabase });
    mocks.admin.mockReturnValue({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({
        data: { id: "tenant-1", email: "tenant@example.com" }, error: null
      }) }) }) })
    });
    mocks.canAdmin.mockResolvedValue(true);
    mocks.rate.mockReturnValue({ allowed: true });
    mocks.team.mockResolvedValue(undefined);
    mocks.notification.mockResolvedValue(undefined);
    mocks.history.mockResolvedValue(undefined);
    mocks.audit.mockResolvedValue(undefined);
  });

  it("notifies the stored tenant and property team when resolved", async () => {
    expect(await updateTicketStatus(null, form("resolved"))).toMatchObject({ success: true });
    expect(mocks.notification).toHaveBeenCalledWith(expect.objectContaining({
      recipientProfileId: "tenant-1", type: "ticket_resolved"
    }));
    expect(mocks.team).toHaveBeenCalledWith(expect.objectContaining({
      event: "ticket_resolved", type: "ticket_resolved"
    }));
  });

  it("R4 sends the exact tenant notice when a repair starts, with no team notice", async () => {
    expect(await updateTicketStatus(null, form("in_progress"))).toMatchObject({ success: true });
    expect(mocks.notification.mock.calls).toEqual([[{
      recipientProfileId: "tenant-1", recipientEmail: "tenant@example.com",
      type: "ticket_in_progress", title: "Your repair has started",
      body: 'Work has started on "Leak".', entityType: "maintenance_ticket", entityId: ticketId,
      actorProfileId: "manager-1"
    }]]);
    expect(mocks.team).not.toHaveBeenCalled();
  });

  it("R4 sends nothing for unchanged status or a repair with no tenant", async () => {
    currentStatus = "in_progress";
    await updateTicketStatus(null, form("in_progress"));
    currentStatus = "open";
    currentTenant = null;
    await updateTicketStatus(null, form("in_progress"));
    expect(mocks.notification).not.toHaveBeenCalled();
    expect(mocks.team).not.toHaveBeenCalled();
  });

  it("R4 keeps resolved tenant and team calls after a repair starts", async () => {
    await updateTicketStatus(null, form("in_progress"));
    await updateTicketStatus(null, form("resolved"));
    expect(mocks.notification.mock.calls).toEqual([
      [{ recipientProfileId: "tenant-1", recipientEmail: "tenant@example.com",
        type: "ticket_in_progress", title: "Your repair has started", body: 'Work has started on "Leak".',
        entityType: "maintenance_ticket", entityId: ticketId, actorProfileId: "manager-1" }],
      [{ recipientProfileId: "tenant-1", recipientEmail: "tenant@example.com",
        type: "ticket_resolved", title: "Maintenance Request Resolved",
        body: 'Your maintenance request "Leak" has been resolved.',
        entityType: "maintenance_ticket", entityId: ticketId }]
    ]);
    expect(mocks.team.mock.calls).toEqual([[{
      propertyId: "property-1", event: "ticket_resolved", type: "ticket_resolved", title: "Repair resolved",
      body: '"Leak" was marked resolved.', entityType: "maintenance_ticket", entityId: ticketId,
      actorProfileId: "manager-1"
    }]]);
  });

  it("R4 keeps the closed team notice only", async () => {
    await updateTicketStatus(null, form("closed"));
    expect(mocks.notification).not.toHaveBeenCalled();
    expect(mocks.team.mock.calls).toEqual([[{
      propertyId: "property-1", event: "ticket_resolved", type: "ticket_resolved", title: "Repair resolved",
      body: '"Leak" was marked closed.', entityType: "maintenance_ticket", entityId: ticketId,
      actorProfileId: "manager-1"
    }]]);
  });

  it("R4 calls delivery again after a repair reopens and restarts", async () => {
    await updateTicketStatus(null, form("in_progress"));
    await updateTicketStatus(null, form("open"));
    await updateTicketStatus(null, form("in_progress"));
    expect(mocks.notification.mock.calls).toEqual([
      [{ recipientProfileId: "tenant-1", recipientEmail: "tenant@example.com",
        type: "ticket_in_progress", title: "Your repair has started", body: 'Work has started on "Leak".',
        entityType: "maintenance_ticket", entityId: ticketId, actorProfileId: "manager-1" }],
      [{ recipientProfileId: "tenant-1", recipientEmail: "tenant@example.com",
        type: "ticket_in_progress", title: "Your repair has started", body: 'Work has started on "Leak".',
        entityType: "maintenance_ticket", entityId: ticketId, actorProfileId: "manager-1" }]
    ]);
    expect(mocks.team).not.toHaveBeenCalled();
  });

  it("creating a tenant ticket writes rows only for owners and this home's managers", async () => {
    vi.stubEnv("DOMUS_NOTIFICATIONS_ENABLED", "true");
    const admin = createNotificationAdminClient({
      members: [{ profile_id: "owner-1", can_receive_critical_alerts: true }],
      assignments: ["manager-1", {
        manager_profile_id: "manager-other", property_id: "property-2", active: true
      }],
      profiles: ["tenant-1", "owner-1", "manager-1", "manager-other"]
        .map((id) => ({ id, email: `${id}@example.com` }))
    });
    mocks.admin.mockReturnValue(admin);
    const actual = await vi.importActual<typeof import("@/lib/notifications")>("@/lib/notifications");
    mocks.notification.mockImplementation(actual.createNotificationWithDelivery);
    mocks.team.mockImplementation(async (params) =>
      (await import("@/lib/notification-fanout")).notifyPropertyTeam(params));
    const supabase = { from: vi.fn((table: string) => {
      if (table === "units") return { select: () => ({ eq: () => ({
        single: async () => ({ data: { id: "550e8400-e29b-41d4-a716-446655440001", property_id: "property-1" } })
      }) }) };
      if (table === "leases") return { select: () => ({ eq: () => ({ eq: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { id: "lease-1" } }) })
      }) }) }) };
      if (table === "maintenance_tickets") return { insert: () => ({ select: () => ({
        single: async () => ({ data: { id: ticketId }, error: null })
      }) }) };
      throw new Error(`Unexpected table ${table}`);
    }) };
    mocks.auth.mockResolvedValue({ user: { id: "tenant-1" }, role: "tenant", supabase });
    const data = new FormData();
    data.set("unitId", "550e8400-e29b-41d4-a716-446655440001");
    data.set("title", "Leak");
    data.set("description", "Kitchen sink leaks");
    data.set("priority", "medium");
    expect(await createMaintenanceTicket(null, data)).toMatchObject({ success: true });
    await vi.waitFor(() => expect(notificationUpserts(admin)).toHaveLength(2));
    expect(notificationUpserts(admin).map(([row]) => row.recipient_profile_id).sort())
      .toEqual(["manager-1", "owner-1"]);
    vi.unstubAllEnvs();
  });
});
