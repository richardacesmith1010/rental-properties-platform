import { beforeEach, expect, it, vi } from "vitest";
import { createMaintenanceTicket } from "@/app/actions/maintenance-ticket-actions";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), rate: vi.fn(), upload: vi.fn(),
  insert: vi.fn(), history: vi.fn(), team: vi.fn(), audit: vi.fn(), capability: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.rate }));
vi.mock("@/lib/maintenance", () => ({ logMaintenanceStatusChange: mocks.history }));
vi.mock("@/lib/notifications", () => ({ notifyPropertyTeam: mocks.team,
  createNotificationWithDelivery: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.audit }));
vi.mock("@/app/actions/shared", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/app/actions/shared")>(), ensureCapabilityEnabled: mocks.capability
}));
vi.mock("@/app/actions/maintenance-queries", () => ({
  getMaintenancePhotoFiles: (data: FormData) => data.getAll("photos"), uploadPhotosForTicket: mocks.upload
}));

const unitId = "550e8400-e29b-41d4-a716-446655440001";
const ticketId = "550e8400-e29b-41d4-a716-446655440002";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rate.mockReturnValue({ allowed: true });
  mocks.capability.mockResolvedValue(null);
  mocks.upload.mockResolvedValue({ success: false, error: "Photos must be JPEG, PNG, or WebP." });
  mocks.history.mockResolvedValue(undefined);
  mocks.team.mockResolvedValue(undefined);
  mocks.audit.mockResolvedValue(undefined);
  mocks.insert.mockImplementation(() => ({ select: () => ({ single: async () => ({
    data: { id: ticketId }, error: null }) }) }));
  mocks.auth.mockResolvedValue({ user: { id: "tenant-1" }, role: "tenant", supabase: {
    from: (table: string) => {
      if (table === "units") return { select: () => ({ eq: () => ({ single: async () => ({
        data: { id: unitId, property_id: "home-1" }, error: null }) }) }) };
      if (table === "leases") return { select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({
        maybeSingle: async () => ({ data: { id: "lease-1" }, error: null }) }) }) }) }) };
      if (table === "maintenance_tickets") return { insert: mocks.insert };
      throw new Error(table);
    }
  } });
  mocks.admin.mockReturnValue({ from: (table: string) => ({ select: () => ({ eq: () => ({
    maybeSingle: async () => ({ data: table === "properties" ? { name: "Home" } : { email: "tenant@example.test" },
      error: null }) }) }) }) });
});

it("keeps the repair when its photo upload fails and returns the unfinished message", async () => {
  const form = new FormData();
  form.set("unitId", unitId);
  form.set("title", "Sink leak");
  form.set("description", "Water pools under the sink.");
  form.set("priority", "medium");
  form.set("photos", new File(["bad"], "bad.jpg", { type: "image/jpeg" }));
  expect(await createMaintenanceTicket(null, form)).toMatchObject({ success: true,
    message: "Maintenance request submitted, but the photo upload did not finish." });
  expect(mocks.insert).toHaveBeenCalledOnce();
  expect(mocks.upload).toHaveBeenCalledOnce();
});
