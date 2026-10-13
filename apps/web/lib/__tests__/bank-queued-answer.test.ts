import { beforeEach, describe, expect, it, vi } from "vitest";
import { answerQueuedBankItem } from "@/app/actions/bank-feed";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: vi.fn(async () => ({ user: { id: "owner" } })) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(() => ({ allowed: true })) }));
vi.mock("@/lib/property-access", () => ({ canUserAdministerProperty: vi.fn(async () => true) }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => {}) }));
vi.mock("@/lib/bank-feed/rules", () => ({ saveAnswerRule: vi.fn(async () => true),
  reverseItemRule: vi.fn(async () => ({ success: true })) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
import { createAdminClient } from "@/lib/supabase/admin";
import { saveAnswerRule } from "@/lib/bank-feed/rules";

const UUID = "00000000-0000-4000-8000-000000000001";
const STAMP = "2026-10-12T12:00:00.000Z";
const input = { itemId: UUID, expectedUpdatedAt: STAMP, decision: "yes" as const,
  choice: { kind: "transfer" as const }, always: false };
const review = { id: UUID, bank_account_id: UUID, owner_account_id: UUID,
  external_id: "plaid-1", fingerprint: "a".repeat(64), posted_on: "2026-10-02",
  amount_cents: 235000, direction: "in", description: "DIRECT DEPOSIT TENANT" };

function fakeAdmin(result: string, options: { member?: boolean; error?: boolean } = {}) {
  const rpc = vi.fn(async () => ({ data: result, error: options.error ? { code: "DB_ERROR", message: "private" } : null }));
  const from = (table: string) => {
    const query = { select: () => query, eq: () => query,
      maybeSingle: async () => ({ data: table === "bank_review_items" ? review
        : table === "bank_accounts" ? { id: UUID, owner_account_id: UUID, nickname: "Checking", institution: "other" }
          : table === "ownership_account_members" && options.member !== false ? { profile_id: "owner" }
            : null, error: null }) };
    return query;
  };
  return { rpc, from };
}

beforeEach(() => vi.clearAllMocks());

describe("Sprint 224 queued review action", () => {
  it("claims with the expected timestamp and only saves Always after filing", async () => {
    const admin = fakeAdmin("filed");
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    const result = await answerQueuedBankItem({ ...input, always: true });
    expect(result.success).toBe(true);
    expect(admin.rpc).toHaveBeenCalledWith("resolve_bank_review_item", expect.objectContaining({
      p_item_id: UUID, p_expected_updated_at: STAMP, p_decision: "yes", p_actor_profile_id: "owner"
    }));
    expect(saveAnswerRule).toHaveBeenCalledTimes(1);
  });

  it("returns exact conflict, stale and already copy without saving an Always rule", async () => {
    for (const [status, copy] of [["conflict", "This item changed. Refresh to see it."],
      ["stale", "This rent was already recorded or changed. Check the Rent page."],
      ["already", "This was already filed."]] as const) {
      vi.mocked(createAdminClient).mockReturnValue(fakeAdmin(status) as never);
      const result = await answerQueuedBankItem({ ...input, always: true });
      expect(status === "already" ? result.message : result.error).toBe(copy);
    }
    expect(saveAnswerRule).not.toHaveBeenCalled();
  });

  it("rejects another account owner before the RPC and hides unexpected SQL errors", async () => {
    const denied = fakeAdmin("filed", { member: false });
    vi.mocked(createAdminClient).mockReturnValue(denied as never);
    expect((await answerQueuedBankItem(input)).success).toBe(false);
    expect(denied.rpc).not.toHaveBeenCalled();
    const failure = fakeAdmin("", { error: true });
    vi.mocked(createAdminClient).mockReturnValue(failure as never);
    const result = await answerQueuedBankItem(input);
    expect(result.error).toBe("We could not finish this. Try again.");
    expect(result.error).not.toContain("private");
  });

  it("keeps a successful resolution when the Always rule fails", async () => {
    vi.mocked(createAdminClient).mockReturnValue(fakeAdmin("skipped") as never);
    vi.mocked(saveAnswerRule).mockResolvedValueOnce(false);
    const result = await answerQueuedBankItem({ itemId: UUID, expectedUpdatedAt: STAMP,
      decision: "no", always: true });
    expect(result).toMatchObject({ success: true, ruleWarning: true,
      message: "Saved. The Always rule didn't save. Try again from Rules." });
  });
});
