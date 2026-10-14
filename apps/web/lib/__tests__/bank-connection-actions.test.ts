import { beforeEach, describe, expect, it, vi } from "vitest";
import { finishBankLink, refreshBank, startBankLink, startBankRelink } from "@/app/actions/bank-connections";
import { encryptBankToken, decryptBankToken } from "@/lib/bank-feed/token-crypto";
import { bankFeedInstitution } from "@/lib/bank-feed/match";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(() => ({ allowed: true })) }));
vi.mock("@/lib/bank-feed/sync", () => ({ syncConnection: vi.fn(async () => true) }));
vi.mock("@/lib/plaid", () => ({ createLinkToken: vi.fn(async () => ({ linkToken: "link-token" })),
  exchangePublicToken: vi.fn(async () => ({ accessToken: "access-secret", itemId: "item-1" })),
  getAccounts: vi.fn(async () => [
    { accountId: "plaid-one", name: "Checking", mask: "1234", subtype: "checking" },
    { accountId: "plaid-two", name: "Savings", mask: null, subtype: "savings" }
  ]), getInstitutionName: vi.fn(async () => "Navy Federal"), removeItem: vi.fn(async () => {}) }));

import { requireAuth } from "@/app/actions/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncConnection } from "@/lib/bank-feed/sync";
import { removeItem, createLinkToken, getAccounts } from "@/lib/plaid";

const OWNER_ACCOUNT = "00000000-0000-4000-8000-000000000001";
const input = { ownerAccountId: OWNER_ACCOUNT, publicToken: "public-secret",
  selectedAccountIds: ["plaid-one", "plaid-two"] };

function fakeAdmin(options: { member?: boolean; rpcError?: string; upload?: boolean;
  connectionStatus?: string } = {}) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const rows = options.upload ? [{ id: "upload", nickname: "Old", institution: "Navy Federal", source: "upload" }] : [];
  const from = (table: string) => {
    const query = {
      select: () => query, eq: () => query,
      single: async () => ({ data: { access_token_ciphertext: encryptBankToken("synthetic-access") }, error: null }),
      maybeSingle: async () => ({ data: table === "bank_connections"
        ? { id: "connection-1", owner_account_id: OWNER_ACCOUNT, status: options.connectionStatus ?? "ok" }
        : table === "ownership_account_members" && options.member !== false
          ? { profile_id: "owner" } : null, error: null }),
      then: (resolve: (value: unknown) => void) => Promise.resolve({ data: rows, error: null }).then(resolve)
    };
    return query;
  };
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args });
    return { data: "connection-1", error: options.rpcError ? { code: options.rpcError } : null };
  });
  return { from, rpc, calls };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("BANK_TOKEN_KEY", Buffer.alloc(32, 9).toString("base64"));
  vi.mocked(requireAuth).mockResolvedValue({ user: { id: "owner" }, role: "owner" } as never);
});

describe("Sprint 224 link actions", () => {
  it("maps Plaid's bank name to the existing statement institution for account matching", () => {
    expect(bankFeedInstitution("Navy Federal Credit Union")).toBe("navy_federal");
    expect(bankFeedInstitution("Fidelity Investments")).toBe("fidelity");
    expect(bankFeedInstitution("Regional Bank")).toBe("Regional Bank");
  });
  it("saves N selected authoritative accounts and only ciphertext, then syncs", async () => {
    const admin = fakeAdmin();
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    const result = await finishBankLink({ ...input, bankName: "Forged", mask: "9999" });
    expect(result.success).toBe(true);
    const call = admin.calls[0];
    expect(call.name).toBe("create_bank_connection");
    expect(call.args.p_institution_name).toBe("Navy Federal");
    expect(call.args.p_accounts).toEqual([
      { accountId: "plaid-one", nickname: "Checking ••1234", mask: "1234", subtype: "checking",
        institution: "navy_federal" },
      { accountId: "plaid-two", nickname: "Savings", mask: null, subtype: "savings",
        institution: "navy_federal" }
    ]);
    expect(call.args.p_ciphertext).toMatch(/^v1:/);
    expect(call.args.p_ciphertext).not.toContain("access-secret");
    expect(decryptBankToken(call.args.p_ciphertext as string)).toBe("access-secret");
    expect(syncConnection).toHaveBeenCalledWith("connection-1");
  });

  it("rejects duplicate or empty selected IDs before token exchange", async () => {
    const admin = fakeAdmin(); vi.mocked(createAdminClient).mockReturnValue(admin as never);
    expect((await finishBankLink({ ...input, selectedAccountIds: [] })).success).toBe(false);
    expect((await finishBankLink({ ...input, selectedAccountIds: ["plaid-one", "plaid-one"] })).success).toBe(false);
    expect(admin.calls).toHaveLength(0);
  });

  it("rejects a non-member before Plaid work", async () => {
    vi.mocked(createAdminClient).mockReturnValue(fakeAdmin({ member: false }) as never);
    expect((await startBankLink({ ownerAccountId: OWNER_ACCOUNT })).success).toBe(false);
    expect(createLinkToken).not.toHaveBeenCalled();
  });
  it("6b0 refreshBank skips pending_account_match without starting sync", async () => {
    vi.mocked(createAdminClient).mockReturnValue(fakeAdmin({ connectionStatus: "pending_account_match" }) as never);
    expect(await refreshBank({ connectionId: OWNER_ACCOUNT }))
      .toEqual({ success: false, error: "Finish connecting" });
    expect(syncConnection).not.toHaveBeenCalled();
  });

  it("rejects foreign selected IDs and removes the exchanged item", async () => {
    vi.mocked(createAdminClient).mockReturnValue(fakeAdmin() as never);
    const result = await finishBankLink({ ...input, selectedAccountIds: ["foreign"] });
    expect(result.success).toBe(false);
    expect(removeItem).toHaveBeenCalledWith("access-secret");
  });

  it("compensates an RPC failure and returns exact duplicate copy", async () => {
    vi.mocked(createAdminClient).mockReturnValue(fakeAdmin({ rpcError: "23505" }) as never);
    const result = await finishBankLink(input);
    expect(result).toEqual({ success: false, error: "This bank is already connected." });
    expect(removeItem).toHaveBeenCalledWith("access-secret");
    expect(syncConnection).not.toHaveBeenCalled();
  });

  it("suffixes nickname collisions and omits a missing mask", async () => {
    const admin = fakeAdmin({ upload: true });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    vi.mocked(getAccounts).mockResolvedValueOnce([
      { accountId: "plaid-one", name: "Old", mask: null, subtype: "checking", type: "depository" },
      { accountId: "plaid-two", name: "Old", mask: null, subtype: "savings", type: "depository" }
    ]);
    const result = await finishBankLink(input);
    expect(result.needsMatch).toBe(true);
    expect((admin.calls[0].args.p_accounts as Array<{ nickname: string }>).map((item) => item.nickname))
      .toEqual(["Old (2)", "Old (3)"]);
    expect(syncConnection).not.toHaveBeenCalled();
  });
});


describe("229 §8.3 start action platform", () => {
  it.each(["ios", "web", undefined])("passes %s through both actions, defaulting to web", async (platform) => {
    vi.mocked(createAdminClient).mockReturnValue(fakeAdmin({ connectionStatus: "needs_login" }) as never);
    expect((await startBankLink({ ownerAccountId: OWNER_ACCOUNT, platform })).success).toBe(true);
    expect(createLinkToken).toHaveBeenLastCalledWith({ userId: "owner", mode: "create", platform: platform ?? "web" });
    expect((await startBankRelink({ connectionId: OWNER_ACCOUNT, platform })).success).toBe(true);
    expect(createLinkToken).toHaveBeenLastCalledWith({ userId: "owner", mode: "update", platform: platform ?? "web",
      accessToken: "synthetic-access" });
  });
  it("rejects invalid platforms before client creation", async () => {
    expect((await startBankLink({ ownerAccountId: OWNER_ACCOUNT, platform: "android" })).success).toBe(false);
    expect((await startBankRelink({ connectionId: OWNER_ACCOUNT, platform: "android" })).success).toBe(false);
    expect(createAdminClient).not.toHaveBeenCalled(); expect(createLinkToken).not.toHaveBeenCalled();
  });
});
