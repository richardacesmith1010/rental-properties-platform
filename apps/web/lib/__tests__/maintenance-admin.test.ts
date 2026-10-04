import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  administeredIds: vi.fn(),
  administeredIdsForAccount: vi.fn()
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/property-access", () => ({
  getAdministeredPropertyIds: mocks.administeredIds,
  getAdministeredPropertyIdsForAccount: mocks.administeredIdsForAccount
}));

import { getAdminMaintenanceTickets } from "@/lib/maintenance";

type QueryResult = { data: unknown[] | null; error?: unknown };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => { resolve = resolvePromise; });
  return { promise, resolve };
}

function createQueryClient(
  rows: Record<string, unknown[]>,
  overrides: Partial<Record<string, Promise<QueryResult>>> = {}
) {
  const calls: string[] = [];
  const from = vi.fn((table: string) => {
    calls.push(table);
    const result = overrides[table] ?? Promise.resolve({ data: rows[table] ?? [], error: null });
    const builder = {
      select: vi.fn(() => builder),
      in: vi.fn(() => builder),
      order: vi.fn(() => builder),
      then: result.then.bind(result)
    };
    return builder;
  });
  return { client: { from }, calls };
}

describe("getAdminMaintenanceTickets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.administeredIds.mockResolvedValue(["property-1"]);
    mocks.administeredIdsForAccount.mockResolvedValue(["property-1"]);
  });

  it("returns early for zero pre-resolved properties without access helpers or queries", async () => {
    const admin = createQueryClient({});
    mocks.createAdminClient.mockReturnValue(admin.client);

    await expect(getAdminMaintenanceTickets("user-1", "account-1", [])).resolves.toEqual([]);
    expect(mocks.administeredIds).not.toHaveBeenCalled();
    expect(mocks.administeredIdsForAccount).not.toHaveBeenCalled();
    expect(admin.calls).toEqual([]);
  });

  it("preserves empty output for properties with no tickets", async () => {
    const admin = createQueryClient({ properties: [{ id: "property-1", name: "A" }] });
    mocks.createAdminClient.mockReturnValue(admin.client);

    await expect(getAdminMaintenanceTickets("user-1", "account-1", ["property-1"])).resolves.toEqual([]);
    expect(admin.calls).toEqual(["properties", "units", "maintenance_tickets"]);
  });

  it("returns identical enriched ticket data with tenant, vendor, photos, comments, and timeline", async () => {
    const admin = createQueryClient({
      properties: [{ id: "property-1", name: "Forum House" }],
      units: [{ id: "unit-1", unit_number: "2B" }],
      maintenance_tickets: [{
        id: "ticket-1", property_id: "property-1", unit_id: "unit-1", tenant_profile_id: "tenant-1",
        title: "Leak", description: "Kitchen sink", status: "in_progress", priority: "high",
        actual_cost_cents: 12500, created_at: "2026-01-01T00:00:00Z", resolved_at: null
      }],
      maintenance_assignments: [{
        ticket_id: "ticket-1", vendor_id: "vendor-1", status: "assigned", assigned_at: "2026-01-02T00:00:00Z"
      }],
      vendors: [{ id: "vendor-1", name: "Roman Plumbing" }],
      maintenance_photos: [{
        id: "photo-1", ticket_id: "ticket-1", uploaded_by_profile_id: "tenant-1",
        storage_path: "tickets/photo.jpg", caption: "Under sink", created_at: "2026-01-01T01:00:00Z",
        file_name: "leak.jpg", file_type: "image/jpeg", file_size_bytes: 321
      }],
      maintenance_comments: [{
        id: "comment-1", ticket_id: "ticket-1", author_id: "manager-1", body: "Vendor assigned",
        is_internal: true, created_at: "2026-01-02T01:00:00Z"
      }],
      maintenance_status_history: [{
        id: "history-1", ticket_id: "ticket-1", from_status: "open", to_status: "in_progress",
        changed_by: "manager-1", notes: "Scheduled", created_at: "2026-01-02T02:00:00Z"
      }],
      profiles: [
        { id: "tenant-1", email: "tenant@example.test", full_name: null, role: "tenant", nickname: null },
        { id: "manager-1", email: "manager@example.test", full_name: "Manager", role: "manager", nickname: "M" }
      ]
    });
    // Profile queries select different IDs, but this lightweight client returns both rows; map lookups preserve output.
    mocks.createAdminClient.mockReturnValue(admin.client);

    const tickets = await getAdminMaintenanceTickets("user-1", "account-1", ["property-1"]);

    expect(tickets).toEqual([expect.objectContaining({
      id: "ticket-1", propertyId: "property-1", propertyName: "Forum House", unitNumber: "2B",
      tenantEmail: "tenant@example.test", vendorName: "Roman Plumbing", assignmentStatus: "assigned",
      photoCount: 1, latestPhotoId: "photo-1", commentCount: 1, isFeatureReady: true,
      comments: [expect.objectContaining({ authorName: "Manager", authorRole: "manager", isInternal: true })],
      timeline: [expect.objectContaining({ changedByName: "M", fromStatus: "open", toStatus: "in_progress" })],
      photos: [expect.objectContaining({ id: "photo-1", fileName: "leak.jpg", url: "/api/assets/maintenance-photo/photo-1" })]
    })]);
    expect(mocks.administeredIdsForAccount).not.toHaveBeenCalled();
  });

  it("preserves nullable enrichment fields for a ticket without a tenant", async () => {
    const admin = createQueryClient({
      properties: [{ id: "property-1", name: "A" }],
      maintenance_tickets: [{
        id: "ticket-1", property_id: "property-1", unit_id: null, tenant_profile_id: null,
        title: "Gate", description: "Stuck", status: "open", priority: "low", actual_cost_cents: null,
        created_at: "2026-01-01T00:00:00Z", resolved_at: null
      }]
    });
    mocks.createAdminClient.mockReturnValue(admin.client);

    await expect(getAdminMaintenanceTickets("user-1", null, ["property-1"])).resolves.toEqual([
      expect.objectContaining({ tenantEmail: null, vendorName: null, assignmentStatus: null,
        photoCount: 0, comments: [], timeline: [] })
    ]);
  });

  it("starts each base read together, then starts all ticket-dependent reads together", async () => {
    const properties = deferred<QueryResult>();
    const units = deferred<QueryResult>();
    const tickets = deferred<QueryResult>();
    const profiles = deferred<QueryResult>();
    const assignments = deferred<QueryResult>();
    const comments = deferred<QueryResult>();
    const history = deferred<QueryResult>();
    const admin = createQueryClient({}, {
      properties: properties.promise,
      units: units.promise,
      maintenance_tickets: tickets.promise,
      profiles: profiles.promise,
      maintenance_assignments: assignments.promise,
      maintenance_comments: comments.promise,
      maintenance_status_history: history.promise
    });
    mocks.createAdminClient.mockReturnValue(admin.client);

    const loading = getAdminMaintenanceTickets("user-1", "account-1", ["property-1"]);
    expect(admin.calls).toEqual(["properties", "units", "maintenance_tickets"]);
    properties.resolve({ data: [{ id: "property-1", name: "A" }] });
    units.resolve({ data: [] });
    tickets.resolve({ data: [{
      id: "ticket-1", property_id: "property-1", unit_id: null, tenant_profile_id: "tenant-1",
      title: "A", description: "B", status: "open", priority: "low", actual_cost_cents: null,
      created_at: "2026-01-01", resolved_at: null
    }] });
    await vi.waitFor(() => expect(admin.calls).toEqual(expect.arrayContaining([
      "profiles", "maintenance_assignments", "maintenance_comments", "maintenance_status_history"
    ])));
    profiles.resolve({ data: [{ id: "tenant-1", email: "tenant@example.test" }] });
    assignments.resolve({ data: [] });
    comments.resolve({ data: [] });
    history.resolve({ data: [] });
    await expect(loading).resolves.toHaveLength(1);
  });

  it("keeps the existing property-access path for callers without pre-resolved IDs", async () => {
    const admin = createQueryClient({});
    mocks.createAdminClient.mockReturnValue(admin.client);
    mocks.administeredIdsForAccount.mockResolvedValue([]);

    await expect(getAdminMaintenanceTickets("user-1", "account-1")).resolves.toEqual([]);
    expect(mocks.administeredIdsForAccount).toHaveBeenCalledWith("user-1", "account-1");
  });
});
