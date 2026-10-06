import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  createAdminClient: vi.fn(),
  getPaymentMethod: vi.fn(),
  retrieveSetupIntent: vi.fn(),
  retrieveStripeCheckoutSession: vi.fn()
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: mocks.getAuthenticatedUser }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/autopay", () => ({
  getPaymentMethod: mocks.getPaymentMethod,
  retrieveSetupIntent: mocks.retrieveSetupIntent
}));
vi.mock("@/lib/stripe", () => ({ retrieveStripeCheckoutSession: mocks.retrieveStripeCheckoutSession }));

import AutopayReturnPage from "@/app/autopay/return/page";

const upsert = vi.fn();
let lease: { id: string; tenant_profile_id: string } | null;

function adminClient() {
  return {
    from: (table: string) => table === "leases" ? {
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: lease }) }) }) })
    } : { upsert }
  };
}

async function visit(params: { lease_id: string; setup_intent?: string; session_id?: string } = { lease_id: "lease-1", setup_intent: "seti-1" }) {
  await expect(AutopayReturnPage({ searchParams: params })).rejects.toThrow("NEXT_REDIRECT");
  expect(mocks.redirect).toHaveBeenCalledTimes(1);
}

describe("autopay return", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lease = { id: "lease-1", tenant_profile_id: "tenant-1" };
    mocks.redirect.mockImplementation(() => { throw new Error("NEXT_REDIRECT"); });
    mocks.getAuthenticatedUser.mockResolvedValue({ id: "tenant-1" });
    mocks.createAdminClient.mockReturnValue(adminClient());
    mocks.retrieveSetupIntent.mockResolvedValue({ payment_method: "pm-1" });
    mocks.getPaymentMethod.mockResolvedValue({ id: "pm-1", type: "card", card: { last4: "4242", brand: "visa" } });
    upsert.mockResolvedValue({ error: null });
  });

  it("enrolls and redirects exactly once after a successful upsert", async () => {
    await visit();
    expect(upsert).toHaveBeenCalledOnce();
    expect(mocks.redirect).toHaveBeenCalledWith("/tenant?section=charges&autopay=enrolled");
  });

  it("redirects exactly once after an upsert error", async () => {
    upsert.mockResolvedValue({ error: { message: "failed" } });
    await visit();
    expect(mocks.redirect).toHaveBeenCalledWith("/tenant?section=charges&autopay=error");
  });

  it("redirects exactly once if Stripe retrieval throws", async () => {
    mocks.retrieveStripeCheckoutSession.mockRejectedValue(new Error("Stripe unavailable"));
    await visit({ lease_id: "lease-1", session_id: "cs-1" } );
    expect(mocks.redirect).toHaveBeenCalledWith("/tenant?section=charges&autopay=error");
  });

  it("redirects exactly once without a lease", async () => {
    lease = null;
    await visit();
    expect(upsert).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith("/tenant?section=charges&autopay=error");
  });
});
