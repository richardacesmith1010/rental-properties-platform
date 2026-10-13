import { beforeEach, describe, expect, it, vi } from "vitest";
import { confirmBankLinks } from "@/app/actions/bank-connection-management";
import { syncTransactions } from "@/lib/plaid";
import { createAdminClient } from "@/lib/supabase/admin";
import { bankFingerprint } from "@/lib/bank-feed/fingerprint";
import { fakeAdmin } from "./bank-feed-test-admin";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: vi.fn(async () => ({ user: { id: "owner-user" } })) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/plaid", () => ({ LeaseLost: class LeaseLost extends Error {}, syncTransactions: vi.fn(),
  removeItem: vi.fn() }));
vi.mock("@/lib/bank-feed/token-crypto", () => ({ decryptBankToken: vi.fn(() => "access") }));

const ownerAccountId = "00000000-0000-4000-8000-000000000001";
const connectionId = "00000000-0000-4000-8000-000000000002";
const uploadBankAccountId = "00000000-0000-4000-8000-000000000003";
const plaidBankAccountId = "00000000-0000-4000-8000-000000000004";
const item = { transaction_id: "transaction", account_id: "plaid-account", pending: false,
  date: "2026-10-02", amount: 12.35, name: "SOLAR SERVICING", merchant_name: null };
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("BANK_FEED_SECRET", "s".repeat(32)); });

describe("Sprint 224b matching to the uploaded account", () => {
  it("6b confirm real pairs then sync uses upload bank id and queues its CSV lookalike", async () => {
    const csvFingerprint = bankFingerprint({ bankAccountId: uploadBankAccountId, postedOn: item.date,
      amountCents: 1235, direction: "out", description: item.name, occurrenceIndex: 0 });
    const base = fakeAdmin({
      bank_connections: [{ id: connectionId, owner_account_id: ownerAccountId, created_by_profile_id: "owner-user",
        status: "pending_account_match", sync_lease_token: "lease", sync_lease_until: "2999-01-01T00:00:00Z" }],
      bank_connection_secrets: [{ connection_id: connectionId, access_token_ciphertext: "cipher",
        transactions_cursor: null }],
      ownership_account_members: [{ account_id: ownerAccountId, profile_id: "owner-user", member_role: "owner",
        active: true, created_at: "2026-01-01" }],
      bank_accounts: [{ id: plaidBankAccountId, owner_account_id: ownerAccountId, connection_id: connectionId,
        plaid_account_id: "plaid-account", nickname: "Checking", institution: "fidelity" }],
      properties: [{ id: "home", owner_account_id: ownerAccountId, active: true, name: "Home" }],
      bank_rules: [{ id: "rule", owner_account_id: ownerAccountId, bank_account_id: uploadBankAccountId,
        direction: "out", match_text: "SOLAR SERVICING", action: "expense", property_id: "home",
        expense_category: "utility", label: "Solar", created_at: "2026-01-01" }],
      bank_transactions: [{ id: "csv-filed", bank_account_id: uploadBankAccountId, fingerprint: csvFingerprint }],
      bank_review_items: [], bank_skipped_fingerprints: [], units: [], leases: [], rent_charges: [], profiles: []
    });
    const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
      if (name === "confirm_bank_account_links") {
        expect(args).toEqual({ p_connection_id: connectionId, p_pairs: [
          { plaidBankAccountId, uploadBankAccountId }] });
        base.tables.bank_accounts[0].id = uploadBankAccountId;
        base.tables.bank_connections[0].status = "ok";
        return { data: null, error: null };
      }
      if (name === "acquire_bank_sync_lease") return { data: "lease", error: null };
      if (name === "save_bank_sync_cursor") return { data: true, error: null };
      throw new Error(`Unexpected RPC ${name}`);
    });
    const admin = { ...base, rpc };
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    vi.mocked(syncTransactions).mockImplementation(async (_token, _cursor, options) => {
      await options.onPage();
      return { added: [item], modified: [], removed: [], nextCursor: "next" } as never;
    });
    expect(await confirmBankLinks({ connectionId, pairs: [{ plaidBankAccountId, uploadBankAccountId }] }))
      .toEqual({ success: true });
    expect(admin.tables.bank_review_items[0]).toMatchObject({ bank_account_id: uploadBankAccountId,
      external_id: "transaction", possible_duplicate: true });
    expect(admin.tables.bank_transactions).toHaveLength(1);
    expect(admin.queries.some((query) => query.table === "bank_accounts"
      && query.filters.some(([kind, key, value]) => kind === "eq" && key === "connection_id" && value === connectionId)))
      .toBe(true);
  });
});
