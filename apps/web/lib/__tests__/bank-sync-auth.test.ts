import { beforeEach, describe, expect, it, vi } from "vitest";
import { finishBankLink, startBankLink } from "@/app/actions/bank-connections";
import { getCurrentUserRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createLinkToken, exchangePublicToken } from "@/lib/plaid";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(() => ({})) }));
vi.mock("@/lib/auth", () => ({ getCheckedAuthUser: vi.fn(async () => ({ id: "user" })),
  getCurrentUserRole: vi.fn(), getRoleHomePath: (role: string) => `/${role}` }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/plaid", () => ({ createLinkToken: vi.fn(), exchangePublicToken: vi.fn(),
  getAccounts: vi.fn(), getInstitutionName: vi.fn(), removeItem: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(() => ({ allowed: true })) }));
const ownerAccountId = "00000000-0000-4000-8000-000000000001";
beforeEach(() => vi.clearAllMocks());

describe("Sprint 224b bank link authorization", () => {
  it("2d real requireAuth rejects managers and tenants from startBankLink and finishBankLink", async () => {
    for (const role of ["manager", "tenant"] as const) {
      vi.mocked(getCurrentUserRole).mockResolvedValue(role);
      await expect(startBankLink({ ownerAccountId })).rejects.toThrow(`redirect:/${role}`);
      await expect(finishBankLink({ ownerAccountId, publicToken: "public-token",
        selectedAccountIds: ["account"] })).rejects.toThrow(`redirect:/${role}`);
    }
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(createLinkToken).not.toHaveBeenCalled();
    expect(exchangePublicToken).not.toHaveBeenCalled();
  });
});
