import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncConnection } from "@/lib/bank-feed/sync";
import { LeaseLost, syncTransactions, getAccountsSnapshot } from "@/lib/plaid";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/plaid", () => ({ LeaseLost: class LeaseLost extends Error {}, syncTransactions: vi.fn(), getAccountsSnapshot: vi.fn() }));
vi.mock("@/lib/bank-feed/token-crypto", () => ({ decryptBankToken: vi.fn(() => "access-token") }));
vi.mock("@/lib/bank-feed/process-rows", () => ({ processBankRows: vi.fn(async () => {}) }));
import { createAdminClient } from "@/lib/supabase/admin";

function adminFixture(options: { lease?: string | null; save?: boolean; heartbeat?: boolean; accounts?: unknown[] } = {}) {
  const lease = options.lease === undefined ? "lease-token" : options.lease;
  const updates: Array<{ table: string; payload: Record<string, unknown>; filters: Array<[string, unknown]> }> = [];
  const rpc = vi.fn(async (name: string, _params?: unknown) => ({ data: name === "acquire_bank_sync_lease"
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
        ? { id: "connection", owner_account_id: "owner-account", created_by_profile_id: "creator", status: "ok", plaid_item_id: "item-1" }
        : { access_token_ciphertext: "ciphertext", transactions_cursor: "old-cursor" }, error: null }),
      then: (resolve: (value: unknown) => void) => Promise.resolve(payload
        ? { data: options.heartbeat === false ? [] : [{ id: "connection" }], error: null }
        : { data: table === "bank_accounts" ? options.accounts ?? [] : [{ profile_id: "creator" }], error: null }).then(resolve)
    };
    return query;
  };
  return { rpc, from, updates };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAccountsSnapshot).mockResolvedValue({ item: { item_id: "item-1" }, accounts: [] } as never);
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


  it("saves every account with available-first cents and cached timestamp", async () => {
    const admin = adminFixture();
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    vi.mocked(getAccountsSnapshot).mockResolvedValueOnce({ item: { item_id: "item-1" }, accounts: [
      { account_id: "checking", type: "depository", subtype: "checking", balances: {
        iso_currency_code: "USD", available: 218.85, current: 300, last_updated_datetime: "2026-10-10T12:00:00Z" } },
      { account_id: "credit", type: "credit", subtype: "credit card", balances: {
        iso_currency_code: "USD", available: 100, current: 200 } },
      { account_id: "savings", type: "depository", subtype: "savings", balances: {
        iso_currency_code: "USD", available: null, current: 20 } }
    ] } as never);
    expect(await syncConnection("connection")).toBe(true);
    const call = admin.rpc.mock.calls.find(([name]) => name === "save_bank_balances");
    expect(call?.[1]).toMatchObject({ p_complete: true, p_balances: [
      expect.objectContaining({ plaid_account_id: "checking", cents: 21885,
        as_of: "2026-10-10T12:00:00Z" }),
      expect.objectContaining({ plaid_account_id: "credit", account_type: "credit", cents: null }),
      expect.objectContaining({ plaid_account_id: "savings", cents: 2000 })
    ] });
  });

  it("does not replace stored balances on malformed or empty snapshots", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const admin = adminFixture({ accounts: [{ id: "bank", plaid_account_id: "checking" }] });
      vi.mocked(createAdminClient).mockReturnValue(admin as never);
      vi.mocked(getAccountsSnapshot).mockResolvedValueOnce({ item: { item_id: "wrong" }, accounts: [] } as never);
      expect(await syncConnection("connection")).toBe(true);
      vi.mocked(getAccountsSnapshot).mockResolvedValueOnce({ item: { item_id: "item-1" }, accounts: [] } as never);
      expect(await syncConnection("connection")).toBe(true);
      expect(admin.rpc.mock.calls.filter(([name]) => name === "save_bank_balances")).toHaveLength(0);
      expect(log).toHaveBeenCalledWith("[bank-balance-incomplete]");
    } finally { log.mockRestore(); }
  });

  it("keeps transaction sync successful when balance fetch fails and logs only an allowed code", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const admin = adminFixture();
      vi.mocked(createAdminClient).mockReturnValue(admin as never);
      vi.mocked(getAccountsSnapshot).mockRejectedValueOnce({ response: { data: {
        error_code: "ITEM_LOGIN_REQUIRED", secret: "do-not-log" } } });
      expect(await syncConnection("connection")).toBe(true);
      expect(log).toHaveBeenCalledWith("[bank-balance-failed]", "ITEM_LOGIN_REQUIRED");
      expect(admin.rpc.mock.calls.filter(([name]) => name === "save_bank_balances")).toHaveLength(0);
    } finally { log.mockRestore(); }
  });

  it("logs a lost balance lease once without failing transaction sync", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const admin = adminFixture();
      admin.rpc.mockImplementation(async (name: string) => ({ data: name === "acquire_bank_sync_lease"
        ? "lease-token" : name === "save_bank_balances" ? false : true, error: null }));
      vi.mocked(createAdminClient).mockReturnValue(admin as never);
      expect(await syncConnection("connection")).toBe(true);
      expect(log).toHaveBeenCalledWith("[bank-balance-lease-lost]");
    } finally { log.mockRestore(); }
  });

  it("a page-two LeaseLost stops processing before cursor save", async () => {
    const admin = adminFixture();
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    vi.mocked(getAccountsSnapshot).mockResolvedValue({ item: { item_id: "item-1" }, accounts: [] } as never);
  vi.mocked(syncTransactions).mockImplementationOnce(async (_token, _cursor, options) => {
      await options.onPage();
      throw new LeaseLost();
    });
    expect(await syncConnection("connection")).toBe(false);
    expect(admin.rpc).not.toHaveBeenCalledWith("save_bank_sync_cursor", expect.anything());
  });
});
