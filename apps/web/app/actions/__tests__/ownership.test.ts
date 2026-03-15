import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePathMock = vi.hoisted(() => vi.fn());
const canUserAdministerPropertyMock = vi.hoisted(() => vi.fn());
const canUserAdministerOwnershipAccountMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn());
const parseFormDataMock = vi.hoisted(() => vi.fn());
const requireAuthMock = vi.hoisted(() => vi.fn());
const ensureCapabilityEnabledMock = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/property-access", () => ({
  canUserAdministerProperty: canUserAdministerPropertyMock
}));
vi.mock("@/lib/ownership", () => ({
  canUserAdministerOwnershipAccount: canUserAdministerOwnershipAccountMock
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: checkRateLimitMock }));
vi.mock("@/lib/validations", () => ({
  createOwnershipAccountSchema: {},
  addOwnershipMemberSchema: {},
  linkPropertyToOwnershipAccountSchema: {},
  parseFormData: parseFormDataMock
}));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: requireAuthMock }));
vi.mock("@/app/actions/shared", async () => {
  const actual = await vi.importActual<typeof import("@/app/actions/shared")>("@/app/actions/shared");
  return {
    ...actual,
    ensureCapabilityEnabled: ensureCapabilityEnabledMock
  };
});

import { linkPropertyToOwnershipAccount } from "@/app/actions/ownership";

function createSupabaseClient(updateError: { message: string } | null = null): SupabaseClient {
  return {
    from: vi.fn((table: string) => {
      if (table === "properties") {
        return {
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: updateError })
          }))
        };
      }

      return {
        update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }))
      };
    })
  } as unknown as SupabaseClient;
}

describe("ownership actions", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    checkRateLimitMock.mockReturnValue({ allowed: true, remaining: 10 });
    ensureCapabilityEnabledMock.mockResolvedValue(null);
    parseFormDataMock.mockReturnValue({
      success: true,
      data: { propertyId: "property-1", ownershipAccountId: "account-1" }
    });
    requireAuthMock.mockResolvedValue({
      user: { id: "user-1" },
      supabase: createSupabaseClient()
    });
    canUserAdministerPropertyMock.mockResolvedValue(true);
    canUserAdministerOwnershipAccountMock.mockResolvedValue(true);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("returns a friendly error when a permission lookup rejects", async () => {
    const permissionError = new Error("permission service down");
    canUserAdministerPropertyMock.mockRejectedValueOnce(permissionError);

    const result = await linkPropertyToOwnershipAccount(null, new FormData());

    expect(result).toEqual({
      success: false,
      error: "Unable to validate property and ownership account access right now."
    });
    expect(canUserAdministerOwnershipAccountMock).toHaveBeenCalledWith("user-1", "account-1");
  });

  it("links the property when both permission checks succeed", async () => {
    const result = await linkPropertyToOwnershipAccount(null, new FormData());

    expect(result).toEqual({ success: true });
    expect(revalidatePathMock).toHaveBeenCalledWith("/owner");
    expect(revalidatePathMock).toHaveBeenCalledWith("/manager");
  });
});
