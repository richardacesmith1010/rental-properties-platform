import { beforeEach, describe, expect, it, vi } from "vitest";

const accessMocks = vi.hoisted(() => ({
  getAdministeredProperties: vi.fn(),
  getAdministeredPropertyIds: vi.fn(),
  getAdministeredPropertyIdsForAccount: vi.fn()
}));

function profileQuery(columns: string) {
  const chain = {
    eq: vi.fn(() => chain),
    limit: vi.fn(async () => ({ data: [], error: null })),
    order: vi.fn(() => chain),
    single: vi.fn(async () => columns === "id, role"
      ? { data: { id: "user-1", role: "owner" }, error: null }
      : {
          data: { id: "user-1", email: "", full_name: "Owner", phone: null },
          error: null
        })
  };
  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tableName: string) => ({
      select: (columns: string) => {
        if (tableName !== "profiles") {
          throw new Error(`Unexpected table query: ${tableName}`);
        }
        return profileQuery(columns);
      }
    })
  })
}));
vi.mock("@/lib/property-access", () => accessMocks);
vi.mock("@/lib/payment-fees", () => ({ getManagerFeesForProperties: vi.fn() }));

import { getDashboardData } from "@/lib/dashboard";
import { getPortfolioData } from "@/lib/portfolio";

describe("owner property ID reuse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accessMocks.getAdministeredProperties.mockResolvedValue([]);
    accessMocks.getAdministeredPropertyIds.mockResolvedValue([]);
    accessMocks.getAdministeredPropertyIdsForAccount.mockResolvedValue([]);
  });

  it("keeps dashboard output identical and skips property access when IDs are supplied", async () => {
    const resolvedInternally = await getDashboardData("user-1", null);
    expect(accessMocks.getAdministeredPropertyIds).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    const supplied = await getDashboardData("user-1", null, []);

    expect(supplied).toEqual(resolvedInternally);
    expect(accessMocks.getAdministeredPropertyIds).not.toHaveBeenCalled();
    expect(accessMocks.getAdministeredPropertyIdsForAccount).not.toHaveBeenCalled();
    expect(accessMocks.getAdministeredProperties).not.toHaveBeenCalled();
  });

  it("keeps portfolio output identical and skips property access when IDs are supplied", async () => {
    const resolvedInternally = await getPortfolioData("user-1", null);
    expect(accessMocks.getAdministeredProperties).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    const supplied = await getPortfolioData("user-1", null, []);

    expect(supplied).toEqual(resolvedInternally);
    expect(accessMocks.getAdministeredPropertyIds).not.toHaveBeenCalled();
    expect(accessMocks.getAdministeredPropertyIdsForAccount).not.toHaveBeenCalled();
    expect(accessMocks.getAdministeredProperties).not.toHaveBeenCalled();
  });
});
