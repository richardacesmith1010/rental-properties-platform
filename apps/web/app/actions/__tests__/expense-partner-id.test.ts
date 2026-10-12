import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ inserts: 0 }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: async () => ({ user: { id: "user" } }) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true }) }));
vi.mock("@/lib/property-access", () => ({ canUserAdministerProperty: async () => true }));
vi.mock("@/lib/audit", () => ({ logAudit: async () => undefined }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({
  from: () => ({ insert: () => { mocks.inserts += 1; return {
    select: () => ({ single: async () => ({ data: { id: "new-bill" }, error: null }) })
  }; } })
}) }));
import { createExpense } from "@/app/actions/expenses";

describe("expense create for partner attribution", () => {
  it("returns the saved expense id while creating one bill", async () => {
    mocks.inserts = 0;
    const form = new FormData();
    for (const [key, value] of Object.entries({ propertyId: "11111111-1111-4111-8111-111111111111",
      category: "improvement", amountDollars: "12.34", expenseDate: "2026-10-12", recurring: "false" })) {
      form.set(key, value);
    }
    expect(await createExpense(null, form)).toEqual({ success: true, expenseId: "new-bill" });
    expect(mocks.inserts).toBe(1);
  });
});
