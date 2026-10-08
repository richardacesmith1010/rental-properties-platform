import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), rate: vi.fn(), parse: vi.fn(), propertyId: vi.fn(), guard: vi.fn(),
  admin: vi.fn(), customer: vi.fn(), setup: vi.fn()
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.rate }));
vi.mock("@/lib/env", () => ({ isStripeConfigured: () => true }));
vi.mock("@/lib/validations", () => ({
  setupAutopaySchema: {}, disableAutopaySchema: {}, parseFormData: mocks.parse
}));
vi.mock("@/lib/client-accounts", () => ({
  getPropertyIdForLease: mocks.propertyId, assertStripeEligibleProperty: mocks.guard,
  STRIPE_CLIENT_MESSAGE: "Online payments aren't available for this home yet."
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/autopay", () => ({ createStripeCustomer: mocks.customer, createSetupCheckoutSession: mocks.setup }));
import { setupAutopay } from "@/app/actions/autopay";

describe("autopay setup client guard", () => {
  it("refuses a client lease before any Stripe call or profile write", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "tenant", email: "tenant@example.com" },
      supabase: { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { id: "lease" }, error: null }) })
      }) }) }) }) } });
    mocks.rate.mockReturnValue({ allowed: true });
    mocks.parse.mockReturnValue({ success: true, data: { leaseId: "lease" } });
    mocks.propertyId.mockResolvedValue("home");
    mocks.guard.mockRejectedValue(new Error("unclaimed"));
    expect(await setupAutopay(null, new FormData())).toEqual({
      success: false, error: "Online payments aren't available for this home yet."
    });
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.customer).not.toHaveBeenCalled();
    expect(mocks.setup).not.toHaveBeenCalled();
  });
});
