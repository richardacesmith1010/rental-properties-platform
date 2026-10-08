import { describe, expect, it, vi } from "vitest";

const admin = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: admin }));
import { canUserAdministerOwnershipAccount } from "@/lib/ownership";

describe("client owner authority", () => {
  it("does not grant a linked manager owner access", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle }), maybeSingle
    }) });
    admin.mockReturnValue({ from: vi.fn().mockReturnValue({ select: () => ({ eq }) }) });
    expect(await canUserAdministerOwnershipAccount("manager", "client")).toBe(false);
  });
});
