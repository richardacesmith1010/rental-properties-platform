import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStripeAccountHealth } from "@/lib/stripe";

describe("getStripeAccountHealth", () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    vi.restoreAllMocks();
  });

  it("returns active when charges and payouts are enabled without a disabled reason", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        charges_enabled: true,
        payouts_enabled: true,
        requirements: { disabled_reason: null }
      })
    } as Response);

    await expect(getStripeAccountHealth("acct_active")).resolves.toEqual({
      status: "active",
      chargesEnabled: true,
      payoutsEnabled: true,
      disabledReason: null
    });
  });

  it("returns restricted when charges are disabled", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        charges_enabled: false,
        payouts_enabled: true,
        requirements: { disabled_reason: null }
      })
    } as Response);

    await expect(getStripeAccountHealth("acct_restricted")).resolves.toMatchObject({
      status: "restricted",
      chargesEnabled: false,
      payoutsEnabled: true,
      disabledReason: null
    });
  });

  it("returns restricted when Stripe reports a disabled reason", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        charges_enabled: true,
        payouts_enabled: true,
        requirements: { disabled_reason: "requirements.past_due" }
      })
    } as Response);

    await expect(getStripeAccountHealth("acct_past_due")).resolves.toMatchObject({
      status: "restricted",
      chargesEnabled: true,
      payoutsEnabled: true,
      disabledReason: "requirements.past_due"
    });
  });

  it("returns missing when Stripe returns 404", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 404
    } as Response);

    await expect(getStripeAccountHealth("acct_missing")).resolves.toEqual({
      status: "missing",
      chargesEnabled: false,
      payoutsEnabled: false,
      disabledReason: "account_not_found"
    });
  });

  it("throws on non-404 Stripe errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "server_error"
    } as Response);

    await expect(getStripeAccountHealth("acct_error")).rejects.toThrow(
      "Stripe account retrieve failed: 500 server_error"
    );
  });
});
