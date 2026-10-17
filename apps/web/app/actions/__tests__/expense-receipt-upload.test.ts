import { beforeEach, describe, expect, it, vi } from "vitest";
import { createExpense, updateExpense } from "@/app/actions/expenses";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), canAdmin: vi.fn(), rate: vi.fn(),
  upload: vi.fn(), fileInsert: vi.fn(), expenseInsert: vi.fn(), expenseUpdate: vi.fn(), audit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/property-access", () => ({ canUserAdministerProperty: mocks.canAdmin }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.rate }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.audit }));

const propertyId = "550e8400-e29b-41d4-a716-446655440001";
const expenseId = "550e8400-e29b-41d4-a716-446655440002";
const form = (file: File, update = false) => {
  const data = new FormData();
  data.set(update ? "expenseId" : "propertyId", update ? expenseId : propertyId);
  data.set("category", "repair");
  data.set("amountDollars", "10");
  data.set("expenseDate", "2026-10-16");
  data.set("receiptFile", file);
  return data;
};
const html = () => new File(["<html>bad</html>"], "r.jpg", { type: "image/jpeg" });

describe("expense receipt byte checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "owner-1" } });
    mocks.canAdmin.mockResolvedValue(true);
    mocks.rate.mockReturnValue({ allowed: true });
    mocks.audit.mockResolvedValue(undefined);
    mocks.upload.mockResolvedValue({ error: null });
    mocks.fileInsert.mockImplementation(() => ({ select: () => ({ single: async () => ({
      data: { id: "receipt-1" }, error: null }) }) }));
    mocks.expenseInsert.mockImplementation(() => ({ select: () => ({ single: async () => ({
      data: { id: expenseId }, error: null }) }) }));
    mocks.expenseUpdate.mockImplementation(() => ({ eq: async () => ({ error: null }) }));
    mocks.admin.mockReturnValue({
      storage: { from: () => ({ upload: mocks.upload }) },
      from: (table: string) => {
        if (table === "property_files") return { insert: mocks.fileInsert };
        if (table === "property_expenses") return {
          insert: mocks.expenseInsert,
          update: mocks.expenseUpdate,
          select: () => ({ eq: () => ({ single: async () => ({
            data: { id: expenseId, property_id: propertyId, receipt_file_id: null }, error: null }) }) })
        };
        throw new Error(table);
      }
    });
  });

  it("requires owner auth and permission before reading receipt bytes", async () => {
    mocks.canAdmin.mockResolvedValue(false);
    expect(await createExpense(null, form(html()))).toMatchObject({ success: false,
      error: "You do not have access to this property." });
    expect(await updateExpense(null, form(html(), true))).toMatchObject({ success: false,
      error: "You do not have access to this property." });
    expect(mocks.auth.mock.calls).toEqual([["owner"], ["owner"]]);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("rejects HTML before storage, receipt metadata, or expense inserts", async () => {
    expect(await createExpense(null, form(html()))).toMatchObject({ success: false,
      error: "Receipt must be a photo or a PDF." });
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.fileInsert).not.toHaveBeenCalled();
    expect(mocks.expenseInsert).not.toHaveBeenCalled();
  });

  it("stores PDF bytes with a PDF key, body MIME, and receipt category", async () => {
    const pdf = new File(["%PDF-1.7"], "r.jpg", { type: "image/jpeg" });
    expect(await createExpense(null, form(pdf))).toMatchObject({ success: true });
    const [key, body, options] = mocks.upload.mock.calls[0];
    expect(key).toMatch(new RegExp(`^${propertyId}/receipts/[0-9a-f-]{36}\\.pdf$`));
    expect(body.type).toBe("application/pdf");
    expect(options.contentType).toBe("application/pdf");
    expect(mocks.fileInsert.mock.calls[0][0]).toMatchObject({ file_type: "pdf", category: "receipt" });
  });
});
