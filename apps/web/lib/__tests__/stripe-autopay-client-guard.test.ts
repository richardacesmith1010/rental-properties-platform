import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const guard = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/client-accounts", () => ({ assertStripeEligibleProperty: guard }));
vi.mock("@/lib/stripe", () => ({ getStripeSecretKey: () => "test-key" }));
import {
  createOffSessionPaymentIntent, createSetupCheckoutSession, createStripeCustomer
} from "@/lib/stripe-autopay";

beforeEach(() => {
  vi.clearAllMocks();
  guard.mockRejectedValue(new Error("unclaimed client"));
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

describe("Stripe autopay client guard", () => {
  it("blocks customer creation before the Stripe request", async () => {
    await expect(createStripeCustomer("tenant@example.com", "Tenant", "home"))
      .rejects.toThrow("unclaimed client");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("blocks setup checkout before the Stripe request", async () => {
    await expect(createSetupCheckoutSession({
      propertyId: "home", customerId: "customer", successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel", metadata: {}
    })).rejects.toThrow("unclaimed client");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("blocks off-session payment before the Stripe request", async () => {
    await expect(createOffSessionPaymentIntent({
      propertyId: "home", customerId: "customer", paymentMethodId: "method",
      amountCents: 500, metadata: {}, transferGroup: "group"
    })).rejects.toThrow("unclaimed client");
    expect(fetch).not.toHaveBeenCalled();
  });
});
