import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const requireAuth = vi.hoisted(() => vi.fn());
const parseFormData = vi.hoisted(() => vi.fn());
const checkRateLimit = vi.hoisted(() => vi.fn());
const ownerAccount = vi.hoisted(() => vi.fn());
const eligible = vi.hoisted(() => vi.fn());
const administer = vi.hoisted(() => vi.fn());
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth }));
vi.mock("@/lib/validations", () => ({ payChargeSchema: {}, parseFormData }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit }));
vi.mock("@/lib/env", () => ({ isStripeConfigured: () => true }));
vi.mock("@/lib/property-access", () => ({ canUserAdministerProperty: administer }));
vi.mock("@/lib/stripe-connect", () => ({ getOwnerStripeAccountForProperty: ownerAccount }));
vi.mock("@/lib/client-accounts", () => ({ assertStripeEligibleProperty: eligible,
  STRIPE_CLIENT_MESSAGE: "Online payments are not ready." }));

import { prepareCheckoutContext } from "@/lib/charge-checkout";

describe("prepareCheckoutContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimit.mockReturnValue({ allowed: true });
    parseFormData.mockReturnValue({ success: true, data: { chargeId: "rent-1" } });
  });

  it("rejects future rent before Stripe account work", async () => {
    const dueDate = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
    const charge = { id: "rent-1", lease_id: "lease-1", due_date: dueDate,
      amount_cents: 120000, status: "pending" };
    const query = { select: () => query, eq: () => query, is: () => query,
      single: vi.fn().mockResolvedValue({ data: charge, error: null }) };
    const from = vi.fn(() => query);
    requireAuth.mockResolvedValue({ user: { id: "tenant-1" }, role: "tenant", supabase: { from } });
    expect(await prepareCheckoutContext(new FormData(), "payWithCard"))
      .toEqual({ success: false, error: "This rent is not due yet." });
    expect(from).toHaveBeenCalledTimes(1);
    expect(eligible).not.toHaveBeenCalled();
    expect(ownerAccount).not.toHaveBeenCalled();
  });

  it("D3 opens a November 6 charge only on Denver November 1", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      eligible.mockResolvedValue(undefined);
      administer.mockResolvedValue(true);
      ownerAccount.mockResolvedValue("acct_1");
      const rows = {
        rent_charges: { id: "rent-1", lease_id: "lease-1", due_date: "2026-11-06",
          amount_cents: 120000, status: "pending" },
        leases: { id: "lease-1", tenant_profile_id: "tenant-1", unit_id: "unit-1" },
        units: { id: "unit-1", property_id: "home-1" },
        properties: { id: "home-1" }
      };
      const from = vi.fn((table: keyof typeof rows) => {
        const query = { select: () => query, eq: () => query, is: () => query,
          single: async () => ({ data: rows[table], error: null }) };
        return query;
      });
      requireAuth.mockResolvedValue({ user: { id: "tenant-1" }, role: "tenant", supabase: { from } });
      vi.setSystemTime(new Date("2026-11-01T04:30:00Z"));
      expect(await prepareCheckoutContext(new FormData(), "payWithCard"))
        .toEqual({ success: false, error: "This rent is not due yet." });
      expect(from.mock.calls.map((call) => call[0])).toEqual(["rent_charges"]);
      vi.setSystemTime(new Date("2026-11-01T12:00:00Z"));
      expect(await prepareCheckoutContext(new FormData(), "payWithCard")).toEqual({
        appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
        charge: rows.rent_charges, propertyId: "home-1", ownerStripeAccount: "acct_1", userId: "tenant-1"
      });
    } finally { vi.useRealTimers(); }
  });

});
