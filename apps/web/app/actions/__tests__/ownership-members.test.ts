import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePathMock = vi.hoisted(() => vi.fn());
const createAdminClientMock = vi.hoisted(() => vi.fn());
const canUserAdministerOwnershipAccountMock = vi.hoisted(() => vi.fn());
const getUniqueOwnershipJoinCodeMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn());
const parseFormDataMock = vi.hoisted(() => vi.fn());
const requireAuthMock = vi.hoisted(() => vi.fn());
const ensureCapabilityEnabledMock = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: createAdminClientMock }));
vi.mock("@/lib/ownership", () => ({
  canUserAdministerOwnershipAccount: canUserAdministerOwnershipAccountMock,
  getUniqueOwnershipJoinCode: getUniqueOwnershipJoinCodeMock
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: checkRateLimitMock }));
vi.mock("@/lib/validations", () => ({
  createOwnershipAccountSchema: {},
  addOwnershipMemberSchema: {},
  linkPropertyToOwnershipAccountSchema: {},
  removeOwnershipMemberSchema: {},
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

import { createOwnershipAccount, removeOwnershipMember } from "@/app/actions/ownership";

function createOwnershipAdminClient() {
  const accountInsertMock = vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn().mockResolvedValue({ data: { id: "account-1" }, error: null })
    }))
  }));
  const memberInsertMock = vi.fn().mockResolvedValue({ error: null });

  return {
    client: {
      from: vi.fn((table: string) => {
        if (table === "ownership_accounts") {
          return { insert: accountInsertMock };
        }
        if (table === "ownership_account_members") {
          return { insert: memberInsertMock };
        }
        return {};
      })
    },
    accountInsertMock,
    memberInsertMock
  };
}

function createRemoveMemberAdminClient() {
  const selectChain = {
    eq: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { account_id: "account-1", profile_id: "member-1", active: true },
          error: null
        })
      }))
    }))
  };
  const updateEqSecondMock = vi.fn().mockResolvedValue({ error: null });
  const updateEqFirstMock = vi.fn(() => ({ eq: updateEqSecondMock }));
  const updateMock = vi.fn(() => ({ eq: updateEqFirstMock }));

  return {
    client: {
      from: vi.fn((table: string) => {
        if (table === "ownership_account_members") {
          return {
            select: vi.fn(() => selectChain),
            update: updateMock
          };
        }
        return {};
      })
    },
    updateMock,
    updateEqFirstMock,
    updateEqSecondMock
  };
}

describe("ownership member actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimitMock.mockReturnValue({ allowed: true, remaining: 10 });
    ensureCapabilityEnabledMock.mockResolvedValue(null);
    requireAuthMock.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("creates LLC accounts with a generated join code", async () => {
    const admin = createOwnershipAdminClient();
    createAdminClientMock.mockReturnValue(admin.client);
    parseFormDataMock.mockReturnValue({
      success: true,
      data: { accountType: "llc", displayName: "J&MSP" }
    });
    getUniqueOwnershipJoinCodeMock.mockResolvedValue("ABC123");

    const result = await createOwnershipAccount(null, new FormData());

    expect(result).toEqual({ success: true });
    expect(getUniqueOwnershipJoinCodeMock).toHaveBeenCalledTimes(1);
    expect(admin.accountInsertMock).toHaveBeenCalledWith({
      account_type: "llc",
      display_name: "J&MSP",
      created_by_profile_id: "user-1",
      join_code: "ABC123"
    });
    expect(admin.memberInsertMock).toHaveBeenCalledWith({
      account_id: "account-1",
      profile_id: "user-1",
      member_role: "owner",
      active: true,
      can_receive_critical_alerts: true
    });
  });

  it("blocks LLC self-removal", async () => {
    parseFormDataMock.mockReturnValue({
      success: true,
      data: { accountId: "account-1", profileId: "user-1" }
    });

    const result = await removeOwnershipMember(null, new FormData());

    expect(result).toEqual({
      success: false,
      error: "You cannot remove yourself from this LLC."
    });
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it("soft-removes an LLC member and revalidates owner views", async () => {
    const admin = createRemoveMemberAdminClient();
    createAdminClientMock.mockReturnValue(admin.client);
    parseFormDataMock.mockReturnValue({
      success: true,
      data: { accountId: "account-1", profileId: "member-1" }
    });
    canUserAdministerOwnershipAccountMock.mockResolvedValue(true);

    const result = await removeOwnershipMember(null, new FormData());

    expect(result).toEqual({ success: true, message: "LLC member removed." });
    expect(canUserAdministerOwnershipAccountMock).toHaveBeenCalledWith("user-1", "account-1");
    expect(admin.updateMock).toHaveBeenCalledWith({ active: false });
    expect(revalidatePathMock).toHaveBeenCalledWith("/owner");
    expect(revalidatePathMock).toHaveBeenCalledWith("/manager");
  });
});
