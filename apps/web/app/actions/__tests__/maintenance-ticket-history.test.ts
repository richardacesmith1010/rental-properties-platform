import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMaintenanceTicket } from "@/app/actions/maintenance-ticket-actions";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), admin: vi.fn(), canAdmin: vi.fn(), rate: vi.fn(),
  history: vi.fn(), team: vi.fn(), audit: vi.fn(), sideEffectError: vi.fn(),
  sideEffectHandler: vi.fn()
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/property-access", () => ({ canUserAdministerProperty: mocks.canAdmin }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.rate }));
vi.mock("@/lib/maintenance", () => ({ logMaintenanceStatusChange: mocks.history }));
vi.mock("@/lib/notifications", () => ({ notifyPropertyTeam: mocks.team, createNotificationWithDelivery: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.audit }));
vi.mock("@/lib/logger", () => ({ sideEffectError: mocks.sideEffectError }));
vi.mock("@/app/actions/maintenance-queries", () => ({
  getMaintenancePhotoFiles: () => [], uploadPhotosForTicket: vi.fn()
}));

const unitId = "550e8400-e29b-41d4-a716-446655440001";
const ticketId = "550e8400-e29b-41d4-a716-446655440002";
type Event = { name: string; client?: object };

function form(extra: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    unitId, title: "Leaking sink", description: "Water is under the sink.", priority: "medium", ...extra
  })) data.set(key, value);
  return data;
}

describe("initial maintenance status history", () => {
  let userClient: { from: ReturnType<typeof vi.fn> };
  let ticketInsert: ReturnType<typeof vi.fn>;
  let lease: { id: string } | null;
  let unit: { id: string; property_id: string } | null;
  let insertError: { message: string } | null;
  let events: Event[];
  let adminClients: object[];

  beforeEach(() => {
    vi.clearAllMocks();
    lease = { id: "lease-1" };
    unit = { id: unitId, property_id: "property-1" };
    insertError = null;
    events = [];
    adminClients = [];
    ticketInsert = vi.fn(() => ({ select: () => ({ single: async () => {
      events.push({ name: "insert resolved" });
      return { data: insertError ? null : { id: ticketId }, error: insertError };
    } }) }));
    userClient = { from: vi.fn((table: string) => {
      if (table === "units") return { select: () => ({ eq: () => ({ single: async () => ({ data: unit }) }) }) };
      if (table === "leases") return { select: () => ({ eq: () => ({ eq: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: lease }) })
      }) }) }) };
      if (table === "maintenance_tickets") return { insert: ticketInsert };
      throw new Error(`Unexpected user table: ${table}`);
    }) };
    mocks.auth.mockResolvedValue({ supabase: userClient, user: { id: "tenant-1" }, role: "tenant" });
    mocks.rate.mockReturnValue({ allowed: true });
    mocks.canAdmin.mockResolvedValue(true);
    mocks.history.mockImplementation(async () => { events.push({ name: "history completed" }); });
    mocks.admin.mockImplementation(() => {
      const client = { from: (table: string) => {
        if (table === "properties" || table === "profiles") return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({
            data: table === "properties" ? { id: "property-1", name: "Home" } : { email: "user@example.com" },
            error: null
          }) }) })
        };
        throw new Error(`Unexpected admin table: ${table}`);
      } };
      adminClients.push(client);
      events.push({ name: "admin created", client });
      return client;
    });
    mocks.team.mockResolvedValue(undefined);
    mocks.audit.mockResolvedValue(undefined);
    mocks.sideEffectError.mockReturnValue(mocks.sideEffectHandler);
  });

  function expectHistory(actorId: string) {
    expect(mocks.history).toHaveBeenCalledTimes(1);
    const [client, ...values] = mocks.history.mock.calls[0];
    expect(adminClients).toContain(client);
    expect(client).not.toBe(userClient);
    expect(values).toEqual([ticketId, null, "submitted", actorId]);
    return client as object;
  }

  it("uses the admin client for a tenant with an active lease", async () => {
    expect(await createMaintenanceTicket(null, form())).toMatchObject({ success: true });
    expectHistory("tenant-1");
  });

  it("waits for the history write before resolving the action", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    mocks.history.mockImplementation(() => pending);
    let resolved = false;
    const result = createMaintenanceTicket(null, form()).then((value) => { resolved = true; return value; });
    await vi.waitFor(() => expect(mocks.history).toHaveBeenCalledOnce());
    expect(resolved).toBe(false);
    release();
    expect(await result).toMatchObject({ success: true });
    expect(resolved).toBe(true);
  });

  it("keeps a thrown history failure non-fatal and reports its context", async () => {
    // Ordinary Supabase insert errors are consumed by logMaintenanceStatusChange and tested in maintenance-timeline.test.ts.
    const failure = new Error("History service unavailable");
    mocks.history.mockRejectedValue(failure);
    expect(await createMaintenanceTicket(null, form())).toMatchObject({ success: true });
    expectHistory("tenant-1");
    expect(mocks.sideEffectError).toHaveBeenCalledWith("createMaintenanceTicket", "log_status_history", {
      userId: "tenant-1", entityType: "ticket", entityId: ticketId
    });
    expect(mocks.sideEffectHandler).toHaveBeenCalledWith(failure);
  });

  it("does not create history when the tenant has no active lease", async () => {
    lease = null;
    expect(await createMaintenanceTicket(null, form())).toMatchObject({
      success: false, error: "You can only send repairs for your leased unit."
    });
    expect(ticketInsert).not.toHaveBeenCalled();
    expect(mocks.history).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("does not create history when the ticket insert fails", async () => {
    insertError = { message: "Insert failed" };
    expect(await createMaintenanceTicket(null, form())).toMatchObject({ success: false });
    expect(ticketInsert).toHaveBeenCalledOnce();
    expect(mocks.history).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("does not create history for a manager denied access", async () => {
    mocks.auth.mockResolvedValue({ supabase: userClient, user: { id: "manager-1" }, role: "manager" });
    mocks.canAdmin.mockResolvedValue(false);
    expect(await createMaintenanceTicket(null, form())).toMatchObject({
      success: false, error: "You do not have access to this unit."
    });
    expect(ticketInsert).not.toHaveBeenCalled();
    expect(mocks.history).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("does not create history for invalid form input", async () => {
    const data = form();
    data.delete("title");
    expect(await createMaintenanceTicket(null, data)).toMatchObject({
      success: false, error: expect.stringContaining("expected string")
    });
    expect(ticketInsert).not.toHaveBeenCalled();
    expect(mocks.history).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("creates the history admin client after insert and completes history before returning", async () => {
    mocks.history.mockImplementation(async (client) => {
      events.push({ name: "history called", client });
      events.push({ name: "history completed" });
    });
    const result = await createMaintenanceTicket(null, form()).then((value) => {
      events.push({ name: "action resolved" });
      return value;
    });
    expect(result).toMatchObject({ success: true });
    const historyClient = expectHistory("tenant-1");
    const insertIndex = events.findIndex((event) => event.name === "insert resolved");
    const adminIndex = events.findIndex((event) => event.name === "admin created" && event.client === historyClient);
    const callIndex = events.findIndex((event) => event.name === "history called" && event.client === historyClient);
    const historyIndex = events.findIndex((event) => event.name === "history completed");
    const resultIndex = events.findIndex((event) => event.name === "action resolved");
    expect(insertIndex).toBeGreaterThanOrEqual(0);
    expect(adminIndex).toBeGreaterThan(insertIndex);
    expect(callIndex).toBeGreaterThan(adminIndex);
    expect(historyIndex).toBeGreaterThan(callIndex);
    expect(resultIndex).toBeGreaterThan(historyIndex);
  });

  it.each(["manager", "owner"])("keeps %s-created ticket history", async (role) => {
    mocks.auth.mockResolvedValue({ supabase: userClient, user: { id: `${role}-1` }, role });
    expect(await createMaintenanceTicket(null, form())).toMatchObject({ success: true });
    expect(mocks.canAdmin).toHaveBeenCalledWith(`${role}-1`, "property-1");
    expectHistory(`${role}-1`);
  });

  it("ignores forged history fields in the form", async () => {
    const forgedId = "550e8400-e29b-41d4-a716-446655440003";
    const data = form({
      from_status: "resolved", to_status: "closed", notes: "forged", changed_by: forgedId, ticketId: forgedId
    });
    expect(await createMaintenanceTicket(null, data)).toMatchObject({ success: true });
    expectHistory("tenant-1");
    expect(mocks.history.mock.calls[0]).toHaveLength(5);
  });

  it("does not create history when the unit is missing", async () => {
    unit = null;
    expect(await createMaintenanceTicket(null, form())).toMatchObject({ success: false, error: "Unit not found." });
    expect(ticketInsert).not.toHaveBeenCalled();
    expect(mocks.history).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });
});
