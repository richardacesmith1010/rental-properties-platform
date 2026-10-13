import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncTransactions, LeaseLost } from "@/lib/plaid";
import { buildSyncedFilePayload } from "@/lib/bank-feed/process-rows";
import { plaidFingerprint } from "@/lib/bank-feed/fingerprint";

vi.mock("server-only", () => ({}));
const transactionsSync = vi.fn();
vi.mock("plaid", async (importOriginal) => {
  const original = await importOriginal<typeof import("plaid")>();
  return { ...original, PlaidApi: class { transactionsSync = transactionsSync; } };
});
beforeEach(() => {
  transactionsSync.mockReset();
  vi.stubEnv("PLAID_CLIENT_ID", "sandbox-client");
  vi.stubEnv("PLAID_SECRET", "sandbox-secret");
  vi.stubEnv("BANK_FEED_SECRET", "x".repeat(32));
});

describe("Sprint 224 sync adapter", () => {
  it("calls heartbeat before every page and advances to the final cursor", async () => {
    transactionsSync.mockResolvedValueOnce({ data: { added: [{ transaction_id: "one" }], modified: [],
      removed: [], next_cursor: "cursor-1", has_more: true } });
    transactionsSync.mockResolvedValueOnce({ data: { added: [{ transaction_id: "two" }], modified: [],
      removed: [], next_cursor: "cursor-2", has_more: false } });
    const onPage = vi.fn(async () => {});
    const result = await syncTransactions("access-token", null, { onPage });
    expect(onPage).toHaveBeenCalledTimes(2);
    expect(result.added).toHaveLength(2);
    expect(result.nextCursor).toBe("cursor-2");
  });

  it("discards accumulated pages when Plaid mutates pagination", async () => {
    transactionsSync.mockResolvedValueOnce({ data: { added: [{ transaction_id: "stale" }], modified: [],
      removed: [], next_cursor: "cursor-1", has_more: true } });
    transactionsSync.mockRejectedValueOnce({ response: { data: {
      error_code: "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" } } });
    transactionsSync.mockResolvedValueOnce({ data: { added: [{ transaction_id: "fresh" }], modified: [],
      removed: [], next_cursor: "cursor-final", has_more: false } });
    const result = await syncTransactions("access-token", null, { onPage: async () => {} });
    expect(result.added.map((item) => item.transaction_id)).toEqual(["fresh"]);
    expect(transactionsSync.mock.calls[2][0].cursor).toBeUndefined();
  });

  it("stops before requesting page two when the lease is lost", async () => {
    transactionsSync.mockResolvedValueOnce({ data: { added: [], modified: [], removed: [],
      next_cursor: "cursor-1", has_more: true } });
    const onPage = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new LeaseLost());
    await expect(syncTransactions("access-token", null, { onPage })).rejects.toBeInstanceOf(LeaseLost);
    expect(transactionsSync).toHaveBeenCalledTimes(1);
  });

  it("bounds rate-limit retries to three attempts", async () => {
    vi.useFakeTimers();
    transactionsSync.mockRejectedValue({ response: { status: 429, data: { error_code: "RATE_LIMIT_EXCEEDED" } } });
    const promise = syncTransactions("access-token", null, { onPage: async () => {} });
    const assertion = expect(promise).rejects.toBeDefined();
    await vi.runAllTimersAsync();
    await assertion;
    expect(transactionsSync).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
  it("3p0 retries exhausted after three attempts and fifty-page cap stops pagination", async () => {
    vi.useFakeTimers();
    transactionsSync.mockRejectedValue({ response: { status: 503, data: { error_code: "INTERNAL_ERROR" } } });
    const failed = syncTransactions("access-token", null, { onPage: async () => {} });
    const assertion = expect(failed).rejects.toBeDefined();
    await vi.runAllTimersAsync(); await assertion;
    expect(transactionsSync).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
    transactionsSync.mockReset();
    transactionsSync.mockResolvedValue({ data: { added: [], modified: [], removed: [],
      next_cursor: "still-more", has_more: true } });
    const heartbeat = vi.fn(async () => {});
    await expect(syncTransactions("access-token", null, { onPage: heartbeat }))
      .rejects.toThrow("Bank sync exceeded page limit.");
    expect(transactionsSync).toHaveBeenCalledTimes(50);
    expect(heartbeat).toHaveBeenCalledTimes(50);
  });

  it("keeps distinct Plaid IDs distinct and builds filing parity fields", () => {
    expect(plaidFingerprint("bank", "transaction-1")).not.toBe(plaidFingerprint("bank", "transaction-2"));
    const row = { i: 0, postedOn: "2026-10-02", amountCents: 235000, direction: "out" as const,
      description: "Solar Servicing", occurrenceIndex: 0, fingerprint: "a".repeat(64), externalId: "transaction-1" };
    const payload = buildSyncedFilePayload({ row,
      bank: { id: "bank", owner_account_id: "account", nickname: "Checking" },
      choice: { kind: "expense", propertyId: "home", category: "utility", label: "Solar" },
      match: { i: 0, status: "auto", rule: { id: "rule", bank_account_id: "bank", direction: "out",
        match_text: "SOLAR", action: "expense", lease_id: null, property_id: "home", expense_category: "utility",
        label: "Solar", created_at: "2026-10-01" } }, actorProfileId: "owner" });
    expect(payload).toMatchObject({ amountCents: 235000, postedOn: "2026-10-02", nickname: "Checking",
      matchedBy: "rule", ruleId: "rule", choice: { category: "utility", label: "Solar" } });
  });
});
