import { beforeEach, describe, expect, it, vi } from "vitest";
import { createStripeCheckoutSession } from "@/lib/stripe";

describe("createStripeCheckoutSession", () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    vi.restoreAllMocks();
  });

  it("throws if an application fee is set without a destination account", async () => {
    await expect(
      createStripeCheckoutSession({
        amountCents: 242050,
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
        metadata: { charge_id: "charge-1" },
        applicationFeeAmountCents: 7050
      })
    ).rejects.toThrow("applicationFeeAmountCents requires transferDataDestination");
  });

  it("sends destination charge fields and omits transfer_group", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "cs_test_123",
        url: "https://checkout.stripe.test/session",
        payment_status: "unpaid",
        amount_total: 242050,
        payment_intent: "pi_test_123"
      })
    } as Response);

    await createStripeCheckoutSession({
      amountCents: 242050,
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
      metadata: {
        charge_id: "charge-1",
        transfer_mode: "destination"
      },
      transferGroup: "charge_charge-1",
      paymentMethodTypes: ["card"],
      transferDataDestination: "acct_123",
      applicationFeeAmountCents: 7050
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, requestInit] = fetchMock.mock.calls[0];
    const body = new URLSearchParams(String(requestInit?.body ?? ""));

    expect(body.get("payment_method_types[0]")).toBe("card");
    expect(body.get("payment_intent_data[transfer_data][destination]")).toBe("acct_123");
    expect(body.get("payment_intent_data[application_fee_amount]")).toBe("7050");
    expect(body.has("payment_intent_data[transfer_group]")).toBe(false);
  });
});
