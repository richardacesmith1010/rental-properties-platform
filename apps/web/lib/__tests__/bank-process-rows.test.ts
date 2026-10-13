import { beforeEach, describe, expect, it, vi } from "vitest";
import { processBankRows, type SyncedRow } from "@/lib/bank-feed/process-rows";
import { bankFingerprint, plaidFingerprint } from "@/lib/bank-feed/fingerprint";
import { fakeAdmin } from "./bank-feed-test-admin";

vi.mock("server-only", () => ({}));
const bank = { id: "bank", owner_account_id: "owner-account", nickname: "Checking" };
const row = (transactionId: string, description = "PAYMENT TO SOLAR SERVICING"): SyncedRow => ({
  i: 0, externalId: transactionId, postedOn: "2026-10-02", amountCents: 26640,
  direction: "out", description, occurrenceIndex: 0,
  fingerprint: plaidFingerprint("bank", transactionId)
});
const rule = { id: "rule", owner_account_id: "owner-account", bank_account_id: "bank", direction: "out",
  match_text: "SOLAR SERVICING", action: "expense", lease_id: null, property_id: "home",
  expense_category: "utility", label: "Solar", created_at: "2026-10-01" };
function fixture(withRule = true) {
  const admin = fakeAdmin({ bank_accounts: [{ id: "bank", owner_account_id: "owner-account" }],
    bank_rules: withRule ? [rule] : [], properties: [{ id: "home", name: "First Home", owner_account_id: "owner-account",
      active: true }], units: [], leases: [], rent_charges: [], profiles: [],
    bank_transactions: [], bank_skipped_fingerprints: [], bank_review_items: [] });
  const rpc = vi.fn(async (_name: string, args: { p: Record<string, unknown> }) => {
    admin.tables.bank_transactions.push({ bank_account_id: "bank", fingerprint: args.p.fingerprint,
      external_id: args.p.externalId });
    return { data: "filed", error: null };
  });
  return { ...admin, rpc };
}

beforeEach(() => vi.stubEnv("BANK_FEED_SECRET", "s".repeat(32)));

describe("Sprint 224 shared bank row pipeline", () => {
  it("files a rule through the atomic synced RPC and replay does not file twice", async () => {
    const admin = fixture();
    const rows = [row("transaction-1")];
    await processBankRows({ admin: admin as never, actorProfileId: "owner", bank, rows, source: "sync" });
    await processBankRows({ admin: admin as never, actorProfileId: "owner", bank, rows, source: "sync" });
    expect(admin.rpc).toHaveBeenCalledTimes(1);
    expect(admin.rpc).toHaveBeenCalledWith("file_synced_bank_item", expect.objectContaining({
      p: expect.objectContaining({ externalId: "transaction-1", matchedBy: "rule", ruleId: "rule",
        choice: expect.objectContaining({ kind: "expense", category: "utility" }) })
    }));
    expect(admin.writes.some((write) => write.table === "property_expenses")).toBe(false);
  });

  it("queues bills needing an answer and never stores personal rows", async () => {
    const admin = fixture(false);
    await processBankRows({ admin: admin as never, actorProfileId: "owner", bank,
      rows: [row("solar"), { ...row("personal", "PAYMENT TO XFINITY"), i: 1 }], source: "sync" });
    expect(admin.tables.bank_review_items).toHaveLength(1);
    expect(admin.tables.bank_review_items[0].external_id).toBe("solar");
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("holds a CSV lookalike for review before any automatic filing", async () => {
    const admin = fixture();
    const bankRow = row("transaction-2");
    admin.tables.bank_transactions.push({ bank_account_id: "bank", fingerprint: bankFingerprint({
      bankAccountId: "bank", postedOn: bankRow.postedOn, amountCents: bankRow.amountCents,
      direction: bankRow.direction, description: bankRow.description, occurrenceIndex: 7
    }) });
    await processBankRows({ admin: admin as never, actorProfileId: "owner", bank,
      rows: [bankRow], source: "sync" });
    expect(admin.tables.bank_review_items[0].possible_duplicate).toBe(true);
    expect(admin.rpc).not.toHaveBeenCalled();
  });
});
