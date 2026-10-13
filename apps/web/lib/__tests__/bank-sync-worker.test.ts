import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncConnection } from "@/lib/bank-feed/sync";
import { LeaseLost, syncTransactions } from "@/lib/plaid";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/plaid", () => ({ LeaseLost: class LeaseLost extends Error {}, syncTransactions: vi.fn() }));
vi.mock("@/lib/bank-feed/token-crypto", () => ({ decryptBankToken: vi.fn(() => "access-token") }));
vi.mock("@/lib/bank-feed/process-rows", () => ({ processBankRows: vi.fn(async () => {}) }));
import { createAdminClient } from "@/lib/supabase/admin";

function adminFixture(options: { lease?: string | null; save?: boolean; heartbeat?: boolean } = {}) {
  const lease = options.lease === undefined ? "lease-token" : options.lease;
  const updates: Array<{ table: string; payload: Record<string, unknown>; filters: Array<[string, unknown]> }> = [];
  const rpc = vi.fn(async (name: string) => ({ data: name === "acquire_bank_sync_lease"
    ? lease : options.save === false ? false : true, error: null }));
  const from = (table: string) => {
    let payload: Record<string, unknown> | null = null;
    const filters: Array<[string, unknown]> = [];
    const query = {
      select: () => query, eq: (name: string, value: unknown) => { filters.push([name, value]); return query; },
      gt: (name: string, value: unknown) => { filters.push([name, value]); return query; },
      in: (name: string, value: unknown) => { filters.push([name, value]); return query; },
      order: () => query,
      update: (value: Record<string, unknown>) => { payload = value; updates.push({ table, payload, filters }); return query; },
      single: async () => ({ data: table === "bank_connections"
        ? { id: "connection", owner_account_id: "owner-account", created_by_profile_id: "creator", status: "ok" }
        : { access_token_ciphertext: "ciphertext", transactions_cursor: "old-cursor" }, error: null }),
      then: (resolve: (value: unknown) => void) => Promise.resolve(payload
        ? { data: options.heartbeat === false ? [] : [{ id: "connection" }], error: null }
        : { data: table === "bank_accounts" ? [] : [{ profile_id: "creator" }], error: null }).then(resolve)
    };
    return query;
  };
  return { rpc, from, updates };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(syncTransactions).mockImplementation(async (_token, _cursor, options) => {
    await options.onPage();
    return { added: [], modified: [], removed: [], nextCursor: "new-cursor" } as never;
  });
});

describe("Sprint 224 fenced sync worker", () => {
  it("skips when another worker holds the lease", async () => {
    const admin = adminFixture({ lease: null });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    expect(await syncConnection("connection")).toBe(false);
    expect(syncTransactions).not.toHaveBeenCalled();
  });

  it("saves the cursor after heartbeat and releases only its lease token", async () => {
    const admin = adminFixture();
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    expect(await syncConnection("connection")).toBe(true);
    expect(admin.rpc).toHaveBeenCalledWith("save_bank_sync_cursor", {
      p_connection_id: "connection", p_lease_token: "lease-token", p_cursor: "new-cursor"
    });
    expect(admin.updates.some((update) => update.payload.sync_lease_token === null
      && update.filters.some(([name, value]) => name === "sync_lease_token" && value === "lease-token"))).toBe(true);
  });

  it("losing a heartbeat or cursor fence never advances the cursor", async () => {
    const heartbeatLost = adminFixture({ heartbeat: false });
    vi.mocked(createAdminClient).mockReturnValue(heartbeatLost as never);
    expect(await syncConnection("connection")).toBe(false);
    expect(heartbeatLost.rpc).not.toHaveBeenCalledWith("save_bank_sync_cursor", expect.anything());
    const cursorLost = adminFixture({ save: false });
    vi.mocked(createAdminClient).mockReturnValue(cursorLost as never);
    expect(await syncConnection("connection")).toBe(false);
    expect(cursorLost.updates.some((update) => update.payload.status === "ok")).toBe(false);
  });

  it("a page-two LeaseLost stops processing before cursor save", async () => {
    const admin = adminFixture();
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    vi.mocked(syncTransactions).mockImplementationOnce(async (_token, _cursor, options) => {
      await options.onPage();
      throw new LeaseLost();
    });
    expect(await syncConnection("connection")).toBe(false);
    expect(admin.rpc).not.toHaveBeenCalledWith("save_bank_sync_cursor", expect.anything());
  });
});
