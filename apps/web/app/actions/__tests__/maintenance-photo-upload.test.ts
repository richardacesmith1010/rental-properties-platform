import { beforeEach, describe, expect, it, vi } from "vitest";
import { uploadPhotosForTicket } from "@/app/actions/maintenance-queries";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), canAdmin: vi.fn(), upload: vi.fn(), insert: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/property-access", () => ({ canUserAdministerProperty: mocks.canAdmin }));

const ticketId = "550e8400-e29b-41d4-a716-446655440001";
const html = () => new File(["<html>bad</html>"], "x.jpg", { type: "image/jpeg" });
const jpeg = (name = "Sink Leak.JPG") => new File([new Uint8Array([0xff, 0xd8, 0xff, 0])], name,
  { type: "image/jpeg" });
const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "p.jpg",
  { type: "image/jpeg" });

describe("maintenance photo byte checks", () => {
  let count = 0;
  let tenantId = "tenant-1";
  beforeEach(() => {
    vi.clearAllMocks();
    count = 0;
    tenantId = "tenant-1";
    mocks.canAdmin.mockResolvedValue(true);
    mocks.upload.mockResolvedValue({ error: null });
    mocks.insert.mockImplementation(() => ({ select: () => ({ single: async () => ({ data: { id: crypto.randomUUID() },
      error: null }) }) }));
    mocks.admin.mockImplementation(() => ({
      from: (table: string) => {
        if (table === "maintenance_tickets") return { select: () => ({ eq: () => ({
          single: async () => ({ data: { id: ticketId, property_id: "home-1", tenant_profile_id: tenantId }, error: null })
        }) }) };
        if (table === "maintenance_photos") return {
          select: () => ({ eq: () => Promise.resolve({ count, error: null }) }), insert: mocks.insert
        };
        throw new Error(table);
      },
      storage: { from: () => ({ upload: mocks.upload }) }
    }));
  });

  const upload = (files: File[], role: "tenant" | "owner" = "tenant") =>
    uploadPhotosForTicket({ ticketId, userId: "tenant-1", role, files });

  it("checks tenant and owner access before file bytes", async () => {
    tenantId = "tenant-2";
    expect(await upload([html()])).toMatchObject({ success: false,
      error: "You do not have access to this repair." });
    tenantId = "tenant-1";
    mocks.canAdmin.mockResolvedValue(false);
    expect(await upload([html()], "owner")).toMatchObject({ success: false,
      error: "You do not have access to this repair." });
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("checks the count before file bytes", async () => {
    count = 4;
    expect(await upload([html(), html()])).toMatchObject({ success: false,
      error: "You can attach up to 5 photos per ticket." });
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("rejects HTML and makes no partial upload when one of two is bad", async () => {
    expect(await upload([html()])).toMatchObject({ success: false, error: "Photos must be JPEG, PNG, or WebP." });
    expect(await upload([jpeg(), html()])).toMatchObject({ success: false,
      error: "Photos must be JPEG, PNG, or WebP." });
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("stores a JPEG using a safe name and sniffed content type", async () => {
    expect(await upload([jpeg()])).toMatchObject({ success: true, uploadedCount: 1 });
    const [key, body, options] = mocks.upload.mock.calls[0];
    expect(key).toMatch(new RegExp(`^${ticketId}/[0-9a-f-]{36}-Sink-Leak\\.jpg$`));
    expect(body.type).toBe("image/jpeg");
    expect(options.contentType).toBe("image/jpeg");
    expect(mocks.insert.mock.calls[0][0].file_type).toBe("image/jpeg");
  });

  it("stores PNG bytes as PNG even with a JPG name", async () => {
    expect(await upload([png()])).toMatchObject({ success: true });
    expect(mocks.upload.mock.calls[0][0]).toMatch(/-p\.png$/);
    expect(mocks.upload.mock.calls[0][1].type).toBe("image/png");
    expect(mocks.insert.mock.calls[0][0].file_type).toBe("image/png");
  });
});
