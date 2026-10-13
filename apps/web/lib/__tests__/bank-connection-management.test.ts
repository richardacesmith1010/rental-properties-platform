import { beforeEach, describe, expect, it, vi } from "vitest";
import { confirmBankLinks, skipBankLinks, disconnectBank } from "@/app/actions/bank-connection-management";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: vi.fn(async () => ({ user: { id: "owner" } })) }));
vi.mock("@/lib/bank-feed/sync", () => ({ syncConnection: vi.fn(async () => true) }));
vi.mock("@/lib/bank-feed/token-crypto", () => ({ decryptBankToken: vi.fn(() => "access-token") }));
vi.mock("@/lib/plaid", () => ({ removeItem: vi.fn(async () => {}) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
import { syncConnection } from "@/lib/bank-feed/sync";
import { removeItem } from "@/lib/plaid";
import { createAdminClient } from "@/lib/supabase/admin";

const ID = "00000000-0000-4000-8000-000000000001";
function fakeAdmin(options: { conflict?: boolean; removeError?: boolean; confirmError?: { code: string; message: string };
  member?: boolean } = {}) {
  const sequence: string[] = [];
  const from = (table: string) => {
    let write = false;
    const query = { select: () => query, eq: () => query,
      update: () => { write = true; sequence.push("revoked"); return query; },
      maybeSingle: async () => ({ data: table === "bank_connections"
        ? { id: ID, owner_account_id: ID, status: "pending_account_match" }
        : table === "bank_connection_secrets" ? { access_token_ciphertext: "ciphertext" }
          : options.member === false ? null : { profile_id: "owner" }, error: null }),
      then: (resolve: (value: unknown) => void) => Promise.resolve({ data: write ? [] : null, error: null }).then(resolve)
    };
    return query;
  };
  const rpc = vi.fn(async (name: string) => {
    sequence.push(name);
    return { data: name === "skip_bank_account_match" ? (options.conflict ? "conflict" : "ok") : null,
      error: name === "confirm_bank_account_links" ? options.confirmError ?? null
        : name === "disconnect_bank_connection" && options.removeError ? { code: "DB_ERROR" } : null };
  });
  return { from, rpc, sequence };
}
beforeEach(() => vi.clearAllMocks());

describe("Sprint 224 connection management", () => {
  it("disconnects after revoking and calling Plaid itemRemove", async () => {
    const admin = fakeAdmin();
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    vi.mocked(removeItem).mockImplementationOnce(async () => { admin.sequence.push("itemRemove"); });
    const result = await disconnectBank({ connectionId: ID });
    expect(result.success).toBe(true);
    expect(admin.sequence).toEqual(["revoked", "itemRemove", "disconnect_bank_connection"]);
    expect(removeItem).toHaveBeenCalledWith("access-token");
  });

  it("returns failure if local deletion fails after revocation", async () => {
    const admin = fakeAdmin({ removeError: true });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    const result = await disconnectBank({ connectionId: ID });
    expect(result.success).toBe(false);
    expect(admin.sequence[0]).toBe("revoked");
  });

  it("transitions matching once and starts sync only after success", async () => {
    const admin = fakeAdmin();
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    expect((await confirmBankLinks({ connectionId: ID, pairs: [] })).success).toBe(true);
    expect(admin.sequence).toEqual(["confirm_bank_account_links"]);
    expect(syncConnection).toHaveBeenCalledWith(ID);
    vi.mocked(syncConnection).mockClear();
    vi.mocked(createAdminClient).mockReturnValue(fakeAdmin({ conflict: true }) as never);
    const second = await skipBankLinks({ connectionId: ID });
    expect(second.error).toBe("This bank was already set up. Refresh to see it.");
    expect(syncConnection).not.toHaveBeenCalled();
  });
  it("6b0 P0001 confirm conflict gives exact copy and starts no sync", async () => {
    vi.mocked(createAdminClient).mockReturnValue(fakeAdmin({ confirmError: {
      code: "P0001", message: "PL/pgSQL conflict while linking" } }) as never);
    const result = await confirmBankLinks({ connectionId: ID, pairs: [] });
    expect(result).toEqual({ success: false, error: "This bank was already set up. Refresh to see it." });
    expect(syncConnection).not.toHaveBeenCalled();
  });
  it("6b0 non-conflict confirm errors use the generic copy", async () => {
    vi.mocked(createAdminClient).mockReturnValue(fakeAdmin({ confirmError: {
      code: "P0001", message: "other failure" } }) as never);
    expect(await confirmBankLinks({ connectionId: ID, pairs: [] }))
      .toEqual({ success: false, error: "We could not finish this. Try again." });
  });
  it("6b real pairs are passed to confirm RPC before sync", async () => {
    const admin = fakeAdmin(); vi.mocked(createAdminClient).mockReturnValue(admin as never);
    const uploadBankAccountId = "00000000-0000-4000-8000-000000000002";
    const plaidBankAccountId = "00000000-0000-4000-8000-000000000003";
    const pairs = [{ uploadBankAccountId, plaidBankAccountId }];
    expect((await confirmBankLinks({ connectionId: ID, pairs })).success).toBe(true);
    expect(admin.rpc).toHaveBeenCalledWith("confirm_bank_account_links", { p_connection_id: ID, p_pairs: pairs });
    expect(syncConnection).toHaveBeenCalledWith(ID);
  });
  it("7 retry after local delete failure succeeds", async () => {
    const failed = fakeAdmin({ removeError: true }); vi.mocked(createAdminClient).mockReturnValue(failed as never);
    expect((await disconnectBank({ connectionId: ID })).success).toBe(false);
    const retry = fakeAdmin(); vi.mocked(createAdminClient).mockReturnValue(retry as never);
    expect((await disconnectBank({ connectionId: ID })).success).toBe(true);
    expect(retry.sequence).toContain("disconnect_bank_connection");
  });
  it("7b rejects another account owner before changing a connection", async () => {
    const admin = fakeAdmin({ member: false }); vi.mocked(createAdminClient).mockReturnValue(admin as never);
    expect((await disconnectBank({ connectionId: ID })).success).toBe(false);
    expect(admin.rpc).not.toHaveBeenCalled();
  });
});
