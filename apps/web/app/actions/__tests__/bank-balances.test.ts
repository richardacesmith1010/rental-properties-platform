import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), refresh: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.refresh }));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
import { setManualBalance } from "@/app/actions/bank-balances";

const bankId = "33333333-3333-4333-8333-333333333333";
let source = "upload";
let member = true;
let update: ReturnType<typeof vi.fn>;
const query = (table: string) => ({ select: () => ({ eq: () => {
  const chain = { eq: () => chain, maybeSingle: async () => ({ data: table === "bank_accounts"
    ? { id: bankId, owner_account_id: "owner", source } : member ? { account_id: "owner" } : null,
  error: null }) };
  return chain;
} }) });
beforeEach(() => {
  vi.clearAllMocks(); source = "upload"; member = true;
  update = vi.fn(() => { const chain = { eq: () => chain,
    select: async () => ({ data: [{ id: bankId }], error: null }) }; return chain; });
  mocks.auth.mockResolvedValue({ user: { id: "actor" }, supabase: { from: query } });
  mocks.admin.mockReturnValue({ from: () => ({ update }) });
});

describe("setManualBalance", () => {
  it("saves upload account cents and timestamp as manual", async () => {
    expect(await setManualBalance({ bankAccountId: bankId, balanceCents: -1234 })).toEqual({ success: true });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ balance_cents: -1234, balance_source: "manual" }));
  });
  it("rejects Plaid accounts and unrelated owners", async () => {
    source = "plaid";
    expect(await setManualBalance({ bankAccountId: bankId, balanceCents: 100 })).toEqual({
      success: false, error: "This bank updates its balance by itself." });
    source = "upload"; member = false;
    expect((await setManualBalance({ bankAccountId: bankId, balanceCents: 100 })).success).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});
