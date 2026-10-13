import { beforeEach, describe, expect, it, vi } from "vitest";
import { mapPlaidRow, safePlaidError, selectSyncActor, syncConnection } from "@/lib/bank-feed/sync";
import { syncTransactions } from "@/lib/plaid";
import { createAdminClient } from "@/lib/supabase/admin";
import { fakeAdmin } from "./bank-feed-test-admin";
import { bankFingerprint, plaidFingerprint } from "@/lib/bank-feed/fingerprint";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/plaid", () => ({ LeaseLost: class LeaseLost extends Error {}, syncTransactions: vi.fn() }));
vi.mock("@/lib/bank-feed/token-crypto", () => ({ decryptBankToken: vi.fn(() => "access") }));

const bank = { id: "bank", owner_account_id: "owner", nickname: "Checking", plaid_account_id: "plaid-bank",
  connection_id: "connection" };
const plaidRow = (id: string, amount = 12.345, name = "SOLAR SERVICING") => ({
  transaction_id: id, account_id: "plaid-bank", pending: false, date: "2026-10-02", amount,
  merchant_name: null, name
});
const rule = { id: "rule", owner_account_id: "owner", bank_account_id: "bank", direction: "out",
  match_text: "SOLAR SERVICING", action: "expense", lease_id: null, property_id: "home",
  expense_category: "utility", label: "Solar", created_at: "2026-10-01" };
function fixture(input: { rules?: boolean; members?: Array<Record<string, unknown>>;
  queue?: Array<Record<string, unknown>>; filed?: Array<Record<string, unknown>>;
  failRpc?: boolean } = {}) {
  const base = fakeAdmin({
    bank_connections: [{ id: "connection", owner_account_id: "owner", created_by_profile_id: "creator",
      status: "ok", sync_lease_token: "lease", sync_lease_until: "2999-01-01T00:00:00Z" }],
    bank_connection_secrets: [{ connection_id: "connection", access_token_ciphertext: "cipher", transactions_cursor: "old" }],
    bank_accounts: [bank], ownership_account_members: input.members ?? [{ account_id: "owner", profile_id: "creator",
      member_role: "owner", active: true, created_at: "2026-01-01" }],
    properties: [{ id: "home", owner_account_id: "owner", active: true, name: "Home" }],
    bank_rules: input.rules === false ? [] : [rule], units: [], leases: [], rent_charges: [], profiles: [],
    bank_transactions: input.filed ?? [], bank_review_items: input.queue ?? [], bank_skipped_fingerprints: []
  });
  const rpc = vi.fn(async (name: string, args?: { p?: Record<string, unknown> }) => {
    if (name === "acquire_bank_sync_lease") {
      base.tables.bank_connections[0].sync_lease_token = "lease";
      return { data: "lease", error: null };
    }
    if (name === "save_bank_sync_cursor") return { data: true, error: null };
    if (name === "file_synced_bank_item") {
      const p = args!.p!;
      if (base.tables.bank_transactions.some((row) => row.external_id === p.externalId)) {
        return { data: "already", error: null };
      }
      base.tables.bank_transactions.push({ id: `filed-${p.externalId}`, bank_account_id: "bank",
        external_id: p.externalId, fingerprint: p.fingerprint, posted_on: p.postedOn,
        amount_cents: p.amountCents, direction: p.direction });
      if (input.failRpc) throw new Error("crashed after commit");
      return { data: "filed", error: null };
    }
    throw new Error(`Unexpected RPC ${name}`);
  });
  const admin = { ...base, rpc };
  vi.mocked(createAdminClient).mockReturnValue(admin as never);
  return admin;
}
function page(added: Array<ReturnType<typeof plaidRow>> = [], modified: Array<ReturnType<typeof plaidRow>> = [],
  removed: Array<{ transaction_id: string; account_id: string }> = []) {
  vi.mocked(syncTransactions).mockImplementation(async (_token, _cursor, options) => {
    await options.onPage();
    return { added, modified, removed, nextCursor: "next" } as never;
  });
}
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("BANK_FEED_SECRET", "s".repeat(32)); });

describe("Sprint 224b real sync path", () => {
  it("3a maps Plaid signs and rounds cents", () => {
    expect(mapPlaidRow(plaidRow("out"), "bank", 0)).toMatchObject({ amountCents: 1235, direction: "out" });
    expect(mapPlaidRow(plaidRow("in", -0.1), "bank", 1)).toMatchObject({ amountCents: 10, direction: "in" });
  });
  it("3b skips pending rows in the real worker", async () => {
    const admin = fixture(); page([{ ...plaidRow("pending"), pending: true }]);
    expect(await syncConnection("connection")).toBe(true);
    expect(admin.tables.bank_review_items).toHaveLength(0);
    expect(admin.rpc).not.toHaveBeenCalledWith("file_synced_bank_item", expect.anything());
  });
  it("3e replaying a queued page retains one queue row with conflict ignored", async () => {
    const admin = fixture({ rules: false }); page([plaidRow("one")]);
    await syncConnection("connection"); await syncConnection("connection");
    expect(admin.tables.bank_review_items).toHaveLength(1);
    expect(admin.queries.find((query) => query.table === "bank_review_items" && query.op === "upsert")?.options)
      .toEqual({ onConflict: "bank_account_id,external_id", ignoreDuplicates: true });
  });
  it("3f a mid-page queue failure leaves the old cursor", async () => {
    const admin = fixture({ rules: false }); page([plaidRow("one"), plaidRow("two")]);
    const original = admin.from;
    let writes = 0;
    admin.from = ((table: string) => {
      const query = original(table);
      if (table === "bank_review_items") {
        const upsert = query.upsert;
        query.upsert = ((...args: Parameters<typeof upsert>) => {
          writes++;
          if (writes === 2) throw new Error("queue failed");
          return upsert(...args);
        }) as typeof upsert;
      }
      return query;
    }) as typeof admin.from;
    await expect(syncConnection("connection")).rejects.toThrow("Bank sync failed.");
    expect(admin.rpc).not.toHaveBeenCalledWith("save_bank_sync_cursor", expect.anything());
    expect(admin.tables.bank_connection_secrets[0].transactions_cursor).toBe("old");
  });
  it("3h maps ITEM_LOGIN_REQUIRED to needs_login", async () => {
    const admin = fixture();
    vi.mocked(syncTransactions).mockRejectedValue({ response: { data: { error_code: "ITEM_LOGIN_REQUIRED" } } });
    await expect(syncConnection("connection")).rejects.toThrow("Bank sync failed.");
    expect(admin.tables.bank_connections[0]).toMatchObject({ status: "needs_login", last_error: "ITEM_LOGIN_REQUIRED" });
  });
  it("3j modified queued row updates fingerprint and timestamp without filing", async () => {
    const admin = fixture({ queue: [{ id: "queued", bank_account_id: "bank", external_id: "one",
      fingerprint: "old", updated_at: "2026-01-01" }] });
    page([], [plaidRow("one", 14)]); await syncConnection("connection");
    expect(admin.tables.bank_review_items[0]).toMatchObject({ amount_cents: 1400,
      fingerprint: plaidFingerprint("bank", "one") });
    expect(admin.tables.bank_review_items[0].updated_at).not.toBe("2026-01-01");
    expect(admin.writes.some((write) => ["payments", "property_expenses"].includes(write.table))).toBe(false);
  });
  it("3j modified filed amount date or direction flags bank change without rewriting side effects", async () => {
    for (const changed of [plaidRow("one", 14), { ...plaidRow("one"), date: "2026-10-03" }, plaidRow("one", -12.345)]) {
      const admin = fixture({ filed: [{ id: "filed", bank_account_id: "bank", external_id: "one",
        posted_on: "2026-10-02", amount_cents: 1235, direction: "out" }] });
      page([], [changed]); await syncConnection("connection");
      expect(admin.tables.bank_transactions[0].bank_change).toBe("modified");
      expect(admin.writes.some((write) => ["payments", "property_expenses"].includes(write.table))).toBe(false);
    }
  });
  it("3j removed queued row deletes it and removed filed row flags it", async () => {
    const admin = fixture({ queue: [{ bank_account_id: "bank", external_id: "one" }],
      filed: [{ id: "filed", bank_account_id: "bank", external_id: "one" }] });
    page([], [], [{ transaction_id: "one", account_id: "plaid-bank" }]); await syncConnection("connection");
    expect(admin.tables.bank_review_items).toHaveLength(0);
    expect(admin.tables.bank_transactions[0].bank_change).toBe("removed");
    expect(admin.writes.some((write) => ["payments", "property_expenses"].includes(write.table))).toBe(false);
  });
  it("3k crash after filing commit returns already on stale-read replay without a second filing", async () => {
    const admin = fixture({ failRpc: true }); page([plaidRow("one")]);
    await expect(syncConnection("connection")).rejects.toThrow("Bank sync failed.");
    expect(admin.tables.bank_transactions).toHaveLength(1);
    admin.tables.bank_connections[0].status = "ok";
    const original = admin.from;
    admin.from = ((table: string) => {
      const query = original(table);
      if (table === "bank_transactions") query.then = ((resolve: (value: unknown) => void) =>
        Promise.resolve({ data: [], error: null }).then(resolve)) as typeof query.then;
      return query;
    }) as typeof admin.from;
    expect(await syncConnection("connection")).toBe(true);
    expect(admin.rpc.mock.calls.filter(([name]) => name === "file_synced_bank_item")).toHaveLength(2);
    const filingResults = admin.rpc.mock.results.filter((_, index) =>
      admin.rpc.mock.calls[index][0] === "file_synced_bank_item");
    expect(await filingResults[1].value).toEqual({ data: "already", error: null });
    expect(admin.tables.bank_transactions).toHaveLength(1);
  });
  it("3l two same-looking IDs in separate runs both file", async () => {
    const admin = fixture(); page([plaidRow("first")]); await syncConnection("connection");
    page([plaidRow("second")]); await syncConnection("connection");
    expect(admin.tables.bank_transactions.map((row) => row.external_id)).toEqual(["first", "second"]);
  });
  it("3m CSV lookalike is queued without skip and two distinct IDs both remain", async () => {
    const look = plaidRow("first");
    const admin = fixture({ filed: [{ bank_account_id: "bank", fingerprint: bankFingerprint({
      bankAccountId: "bank", postedOn: look.date, amountCents: 1235, direction: "out",
      description: look.name, occurrenceIndex: 7 }) }] });
    page([look, plaidRow("second")]); await syncConnection("connection");
    expect(admin.tables.bank_review_items.map((row) => row.external_id)).toEqual(["first", "second"]);
    expect(admin.tables.bank_review_items.every((row) => row.possible_duplicate === true)).toBe(true);
    expect(admin.tables.bank_skipped_fingerprints).toHaveLength(0);
  });
  it("6b statement then connect queues possible duplicate on the linked upload account", async () => {
    const linkedUploadId = bank.id;
    const transaction = plaidRow("new-plaid-id");
    const csvFingerprint = bankFingerprint({ bankAccountId: linkedUploadId, postedOn: transaction.date,
      amountCents: 1235, direction: "out", description: transaction.name, occurrenceIndex: 0 });
    const admin = fixture({ filed: [{ id: "csv-filed", bank_account_id: linkedUploadId,
      fingerprint: csvFingerprint, kind: "expense" }] });
    page([transaction]); await syncConnection("connection");
    expect(admin.tables.bank_review_items[0]).toMatchObject({ bank_account_id: linkedUploadId,
      external_id: "new-plaid-id", possible_duplicate: true });
    expect(admin.tables.bank_transactions).toHaveLength(1);
    expect(admin.rpc).not.toHaveBeenCalledWith("file_synced_bank_item", expect.anything());
  });
  it("6b No it's new does not dedupe against another bank account", async () => {
    const transaction = plaidRow("new-plaid-id");
    const otherFingerprint = bankFingerprint({ bankAccountId: "other-bank", postedOn: transaction.date,
      amountCents: 1235, direction: "out", description: transaction.name, occurrenceIndex: 0 });
    const admin = fixture({ filed: [{ id: "csv-filed", bank_account_id: "other-bank",
      fingerprint: otherFingerprint, kind: "expense" }] });
    page([transaction]); await syncConnection("connection");
    expect(admin.tables.bank_review_items).toHaveLength(0);
    expect(admin.rpc).toHaveBeenCalledWith("file_synced_bank_item", expect.objectContaining({
      p: expect.objectContaining({ bankAccountId: "bank", externalId: "new-plaid-id" }) }));
  });
  it("3n departed creator selects earliest active owner; absent owner queues", async () => {
    expect(selectSyncActor("departed", [{ profile_id: "first" }, { profile_id: "second" }])).toBe("first");
    const fallback = fixture({ members: [{ account_id: "owner", profile_id: "replacement", member_role: "owner",
      active: true, created_at: "2026-01-01" }] });
    page([plaidRow("fallback")]); await syncConnection("connection");
    expect(fallback.rpc).toHaveBeenCalledWith("file_synced_bank_item", expect.objectContaining({
      p: expect.objectContaining({ actorProfileId: "replacement" }) }));
    const admin = fixture({ members: [] }); page([plaidRow("one")]); await syncConnection("connection");
    expect(admin.tables.bank_review_items).toHaveLength(1);
    expect(admin.rpc).not.toHaveBeenCalledWith("file_synced_bank_item", expect.anything());
  });
  it("3n another owner account property is queued and never filed", async () => {
    const admin = fixture();
    admin.tables.properties[0].owner_account_id = "another-owner";
    page([plaidRow("one")]); await syncConnection("connection");
    expect(admin.tables.bank_review_items).toHaveLength(1);
    expect(admin.rpc).not.toHaveBeenCalledWith("file_synced_bank_item", expect.anything());
  });
  it("3o last_error never contains arbitrary message text", async () => {
    const admin = fixture(); vi.mocked(syncTransactions).mockRejectedValue(new Error("secret message"));
    expect(safePlaidError({ response: { data: { error_code: "bad code secret" } } })).toBe("SYNC_FAILED");
    await expect(syncConnection("connection")).rejects.toThrow("Bank sync failed.");
    expect(admin.tables.bank_connections[0].last_error).toBe("SYNC_FAILED");
  });
  it("3p1 losing the lease at row progress aborts before cursor save", async () => {
    const admin = fixture(); page([plaidRow("one")]);
    const original = admin.from;
    let heartbeats = 0;
    admin.from = ((table: string) => {
      const query = original(table);
      if (table === "bank_connections") {
        const update = query.update;
        query.update = ((value: Record<string, unknown>) => {
          if (value.sync_lease_until && ++heartbeats === 3) admin.tables.bank_connections[0].sync_lease_token = "other";
          return update(value);
        }) as typeof update;
      }
      return query;
    }) as typeof admin.from;
    expect(await syncConnection("connection")).toBe(false);
    expect(admin.rpc).not.toHaveBeenCalledWith("save_bank_sync_cursor", expect.anything());
  });
  it("3q status update has lease and ok-or-error guard", async () => {
    const admin = fixture(); page(); await syncConnection("connection");
    const status = admin.queries.find((query) => query.table === "bank_connections" && query.op === "update"
      && query.filters.some(([kind, key]) => kind === "in" && key === "status"));
    expect(status?.filters).toEqual(expect.arrayContaining([
      ["eq", "sync_lease_token", "lease"], ["in", "status", ["ok", "error"]]
    ]));
  });
});
