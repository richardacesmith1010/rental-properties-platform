import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildExpressAccountParams,
  buildExpressAccountRequestBody,
  createExpressAccount,
  getDefaultExpressAccountBusinessProfileUrl
} from "@/lib/stripe-connect";

describe("stripe-connect express account params", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      STRIPE_SECRET_KEY: "sk_test_123"
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("returns a fresh params object on every call", () => {
    const url = getDefaultExpressAccountBusinessProfileUrl();
    const first = buildExpressAccountParams(url);
    const second = buildExpressAccountParams(url);

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.capabilities).not.toBe(second.capabilities);
    expect(first.business_profile).not.toBe(second.business_profile);

    first.business_profile.url = "https://mutated.example.com";

    expect(second.business_profile.url).toBe(url);
  });

  it("serializes the shared params consistently for onboarding and probe callers", () => {
    const url = getDefaultExpressAccountBusinessProfileUrl();
    const onboardingParams = buildExpressAccountParams(url);
    const probeParams = buildExpressAccountParams(url);

    expect(onboardingParams).toEqual(probeParams);
    expect(buildExpressAccountRequestBody(onboardingParams).toString()).toBe(
      "type=express&country=US&capabilities%5Bcard_payments%5D%5Brequested%5D=true&capabilities%5Btransfers%5D%5Brequested%5D=true&business_profile%5Bmcc%5D=6513&business_profile%5Burl%5D=https%3A%2F%2Fdomusbase.com"
    );
  });

  it("creates an Express account with the shared params and email", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "acct_test_123"
      })
    } as Response);

    const account = await createExpressAccount("owner@example.com");

    expect(account).toEqual({ id: "acct_test_123" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("https://api.stripe.com/v1/accounts", {
      method: "POST",
      headers: {
        Authorization: "Bearer sk_test_123",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: "type=express&email=owner%40example.com&country=US&capabilities%5Bcard_payments%5D%5Brequested%5D=true&capabilities%5Btransfers%5D%5Brequested%5D=true&business_profile%5Bmcc%5D=6513&business_profile%5Burl%5D=https%3A%2F%2Fdomusbase.com",
      cache: "no-store"
    });
  });
});
