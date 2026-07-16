import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePathMock = vi.hoisted(() => vi.fn());
const createAdminClientMock = vi.hoisted(() => vi.fn());
const requireAuthMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn());
const canUserAdministerOwnershipAccountMock = vi.hoisted(() => vi.fn());
const createAccountLinkMock = vi.hoisted(() => vi.fn());
const createExpressAccountMock = vi.hoisted(() => vi.fn());
const createLoginLinkMock = vi.hoisted(() => vi.fn());
const getAccountMock = vi.hoisted(() => vi.fn());
const hasRentCollectionAuthorityForAccountMock = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: createAdminClientMock }));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: requireAuthMock }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: checkRateLimitMock }));
vi.mock("@/lib/property-access", () => ({ canUserAdministerProperty: vi.fn() }));
vi.mock("@/lib/ownership", () => ({
  canUserAdministerOwnershipAccount: canUserAdministerOwnershipAccountMock
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/logger", () => ({ sideEffectError: vi.fn() }));
vi.mock("@/lib/stripe-connect", () => ({
  createAccountLink: createAccountLinkMock,
  createExpressAccount: createExpressAccountMock,
  createLoginLink: createLoginLinkMock,
  getAccount: getAccountMock,
  hasRentCollectionAuthorityForAccount: hasRentCollectionAuthorityForAccountMock
}));

import {
  getExpressDashboardUrl,
  initiateAccountStripeConnect
} from "@/app/actions/connect";

function createConnectAdminClient(config: {
  ownershipAccount?: { stripe_account_id: string | null; display_name?: string };
  profile?: { stripe_account_id: string | null };
}) {
  const ownershipAccountUpdate = vi.fn();
  const from = vi.fn((table: string) => {
    if (table === "ownership_accounts") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: config.ownershipAccount ?? null,
              error: null
            })
          }))
        })),
        update: ownershipAccountUpdate
      };
    }

    if (table === "profiles") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: config.profile ?? null,
              error: null
            })
          }))
        }))
      };
    }

    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
        }))
      }))
    };
  });

  return {
    client: { from },
    ownershipAccountUpdate
  };
}

describe("connect actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimitMock.mockReturnValue({ allowed: true, remaining: 10 });
    requireAuthMock.mockResolvedValue({
      user: { id: "owner-1", email: "owner@example.com" },
      role: "owner",
      supabase: {}
    });
    canUserAdministerOwnershipAccountMock.mockResolvedValue(true);
    hasRentCollectionAuthorityForAccountMock.mockResolvedValue(true);
    createAccountLinkMock.mockResolvedValue({ url: "https://connect.stripe.com/account-link" });
    createLoginLinkMock.mockResolvedValue({ url: "https://connect.stripe.com/login-link" });
    createExpressAccountMock.mockResolvedValue({ id: "acct_new" });
    getAccountMock.mockResolvedValue({
      id: "acct_existing",
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: false
    });
  });

  it("reuses an existing incomplete account instead of creating a second Stripe account", async () => {
    const admin = createConnectAdminClient({
      ownershipAccount: {
        stripe_account_id: "acct_existing",
        display_name: "Atlas Holdings"
      }
    });
    createAdminClientMock.mockReturnValue(admin.client);

    const formData = new FormData();
    formData.set("accountId", "account-1");
    const result = await initiateAccountStripeConnect(null, formData);

    expect(result).toEqual({
      success: true,
      url: "https://connect.stripe.com/account-link"
    });
    expect(createExpressAccountMock).not.toHaveBeenCalled();
    expect(createAccountLinkMock).toHaveBeenCalledWith(
      "acct_existing",
      expect.stringContaining("/connect/refresh?accountId=account-1"),
      expect.stringContaining("/connect/return?accountId=account-1")
    );
    expect(admin.ownershipAccountUpdate).not.toHaveBeenCalled();
  });

  it("opens the ownership account dashboard when an authorized accountId is provided", async () => {
    createAdminClientMock.mockReturnValue(
      createConnectAdminClient({
        ownershipAccount: {
          stripe_account_id: "acct_rent",
          display_name: "Atlas Holdings"
        }
      }).client
    );

    const formData = new FormData();
    formData.set("accountId", "account-1");
    const result = await getExpressDashboardUrl(null, formData);

    expect(result).toEqual({
      success: true,
      url: "https://connect.stripe.com/login-link",
      message: "Stripe dashboard link ready."
    });
    expect(hasRentCollectionAuthorityForAccountMock).toHaveBeenCalledWith("owner-1", "account-1");
    expect(createLoginLinkMock).toHaveBeenCalledWith("acct_rent");
  });

  it("preserves the profile dashboard flow when no accountId is posted", async () => {
    createAdminClientMock.mockReturnValue(
      createConnectAdminClient({
        profile: { stripe_account_id: "acct_profile" }
      }).client
    );

    const result = await getExpressDashboardUrl(null, new FormData());

    expect(result).toEqual({
      success: true,
      url: "https://connect.stripe.com/login-link",
      message: "Stripe dashboard link ready."
    });
    expect(hasRentCollectionAuthorityForAccountMock).not.toHaveBeenCalled();
    expect(createLoginLinkMock).toHaveBeenCalledWith("acct_profile");
  });
});
