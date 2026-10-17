import { beforeEach, describe, expect, it, vi } from "vitest";
import { uploadPropertyFile } from "@/app/actions/document-templates";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), canAdmin: vi.fn(), rate: vi.fn(),
  capability: vi.fn(), upload: vi.fn(), insert: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/property-access", () => ({ canUserAdministerProperty: mocks.canAdmin,
  getAdministeredOwnerAccountIds: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.rate }));
vi.mock("@/app/actions/shared", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/app/actions/shared")>(), ensureCapabilityEnabled: mocks.capability
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

const propertyId = "550e8400-e29b-41d4-a716-446655440001";
const input = (content: string | Uint8Array, name: string, type = "application/octet-stream") => {
  const form = new FormData();
  form.set("propertyId", propertyId);
  form.set("category", "lease_agreement");
  form.set("visibility", "owner_manager");
  form.set("file", new File([content], name, { type }));
  return form;
};

describe("property vault byte checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "owner-1" } });
    mocks.canAdmin.mockResolvedValue(true);
    mocks.rate.mockReturnValue({ allowed: true });
    mocks.capability.mockResolvedValue(null);
    mocks.upload.mockResolvedValue({ error: null });
    mocks.insert.mockResolvedValue({ error: null });
    mocks.admin.mockReturnValue({ storage: { from: () => ({ upload: mocks.upload }) },
      from: () => ({ insert: mocks.insert }) });
  });

  it("checks owner or manager permission before file bytes", async () => {
    mocks.canAdmin.mockResolvedValue(false);
    expect(await uploadPropertyFile(null, input("<html>", "lease.docx"))).toMatchObject({ success: false,
      error: "You do not have access to this property." });
    expect(mocks.auth).toHaveBeenCalledWith("owner", "manager");
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("rejects HTML and a plain ZIP before storage or inserts", async () => {
    const error = "This file type is not allowed. Use a photo, PDF, Word, Excel, or text file.";
    expect(await uploadPropertyFile(null, input("<html>", "lease.docx"))).toMatchObject({ success: false, error });
    expect(await uploadPropertyFile(null, input(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), "evil.docx")))
      .toMatchObject({ success: false, error });
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("stores OOXML Word and text with resolved types", async () => {
    const word = new Uint8Array([0x50, 0x4b, 0x03, 0x04,
      ...new TextEncoder().encode("[Content_Types].xml word/document.xml")]);
    expect(await uploadPropertyFile(null, input(word, "Lease.DOCX"))).toMatchObject({ success: true });
    expect(mocks.upload.mock.calls[0][0]).toMatch(new RegExp(`^${propertyId}/[0-9a-f-]{36}\\.docx$`));
    expect(mocks.upload.mock.calls[0][1].type)
      .toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(mocks.insert.mock.calls[0][0].file_type).toBe("document");
    expect(await uploadPropertyFile(null, input("a,b\n1,2", "rent.csv"))).toMatchObject({ success: true });
    expect(mocks.upload.mock.calls[1][0]).toMatch(/\.csv$/);
    expect(mocks.upload.mock.calls[1][1].type).toBe("text/csv");
  });

  it("uses JPEG bytes even when the name and MIME claim another type", async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0]);
    expect(await uploadPropertyFile(null, input(jpeg, "x.pdf", "application/pdf"))).toMatchObject({ success: true });
    expect(mocks.upload.mock.calls[0][0]).toMatch(/\.jpg$/);
    expect(mocks.upload.mock.calls[0][1].type).toBe("image/jpeg");
    expect(mocks.insert.mock.calls[0][0].file_type).toBe("image");
    expect(await uploadPropertyFile(null, input(jpeg, "scan.png", "image/png"))).toMatchObject({ success: true });
    expect(mocks.upload.mock.calls[1][0]).toMatch(/\.jpg$/);
    expect(mocks.upload.mock.calls[1][1].type).toBe("image/jpeg");
    expect(mocks.insert.mock.calls[1][0].file_type).toBe("image");
  });
});
