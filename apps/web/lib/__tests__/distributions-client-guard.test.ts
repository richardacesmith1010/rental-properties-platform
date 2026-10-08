import { beforeEach, describe, expect, it, vi } from "vitest";

const guard = vi.hoisted(() => vi.fn());
const admin = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/client-accounts", () => ({
  assertStripeEligibleAccount: guard,
  STRIPE_CLIENT_MESSAGE: "Online payments aren't available for this home yet."
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: admin }));
import { applyDistributionConfig, recordPaymentDistribution } from "@/lib/distributions";

beforeEach(() => {
  vi.clearAllMocks();
  guard.mockRejectedValue(new Error("unclaimed"));
});

describe("distribution client guard", () => {
  it("refuses config writes before opening the admin client", async () => {
    expect(await applyDistributionConfig("client", { mode: "split_equal", members: [] })).toEqual({
      success: false, error: "Online payments aren't available for this home yet."
    });
    expect(admin).not.toHaveBeenCalled();
  });

  it("refuses payment distribution writes", async () => {
    await expect(recordPaymentDistribution({
      paymentId: "payment", accountId: "client", profileId: "owner", amountCents: 100,
      distributionPct: null, stripeTransferId: null, status: "pending"
    })).rejects.toThrow("unclaimed");
    expect(admin).not.toHaveBeenCalled();
  });
});
