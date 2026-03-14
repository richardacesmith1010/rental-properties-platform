import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const createAdminClientMock = vi.hoisted(() => vi.fn());
const createStripeCheckoutSessionMock = vi.hoisted(() => vi.fn());
const getOwnerStripeAccountForPropertyMock = vi.hoisted(() => vi.fn());
const canUserAdministerPropertyMock = vi.hoisted(() => vi.fn());
const createNotificationWithDeliveryMock = vi.hoisted(() => vi.fn());
const notifyOwnerMembersForPropertyMock = vi.hoisted(() => vi.fn());
const logAuditMock = vi.hoisted(() => vi.fn());
const awardXpMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn());
const parseFormDataMock = vi.hoisted(() => vi.fn());
const requireAuthMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: createAdminClientMock }));
vi.mock("@/lib/stripe", () => ({ createStripeCheckoutSession: createStripeCheckoutSessionMock }));
vi.mock("@/lib/stripe-connect", () => ({ getOwnerStripeAccountForProperty: getOwnerStripeAccountForPropertyMock }));
vi.mock("@/lib/property-access", () => ({ canUserAdministerProperty: canUserAdministerPropertyMock }));
vi.mock("@/lib/notifications", () => ({
  createNotificationWithDelivery: createNotificationWithDeliveryMock,
  notifyOwnerMembersForProperty: notifyOwnerMembersForPropertyMock
}));
vi.mock("@/lib/audit", () => ({ logAudit: logAuditMock }));
vi.mock("@/lib/gamification", () => ({
  awardXp: awardXpMock,
  XP_VALUES: { rent_paid_on_time: 10, rent_paid_late: 5 }
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: checkRateLimitMock }));
vi.mock("@/lib/validations", () => ({
  payChargeSchema: {},
  recordManualPaymentSchema: {},
  parseFormData: parseFormDataMock
}));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: requireAuthMock }));

import { createCheckoutForCharge, recordManualPayment } from "@/app/actions/charges";

interface CheckoutConfig {
  charge?: { id: string; amount_cents: number; status: string; lease_id: string } | null;
  lease?: { id: string; tenant_profile_id: string; unit_id: string } | null;
  unit?: { id: string; property_id: string } | null;
  property?: { id: string } | null;
}

interface ManualConfig {
  charge?: { id: string; lease_id: string; due_date: string; status: string } | null;
  lease?: { id: string; tenant_profile_id: string; unit_id: string } | null;
  unit?: { id: string; property_id: string; unit_number: string } | null;
  tenantProfile?: { id: string; email: string } | null;
  paymentError?: { code?: string; message: string } | null;
  chargeUpdateError?: { message: string } | null;
}

function createCheckoutSupabase(config: CheckoutConfig): SupabaseClient {
  return {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data:
              table === "rent_charges"
                ? config.charge ?? null
                : table === "leases"
                  ? config.lease ?? null
                  : table === "units"
                    ? config.unit ?? null
                    : config.property ?? null,
            error: null
          })
        }))
      }))
    }))
  } as unknown as SupabaseClient;
}

function createManualAdminClient(config: ManualConfig): SupabaseClient {
  return {
    from: vi.fn((table: string) => {
      if (table === "payments") {
        return {
          insert: vi.fn().mockResolvedValue({ error: config.paymentError ?? null })
        };
      }

      if (table === "rent_charges") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: config.charge ?? null, error: null })
            }))
          })),
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: config.chargeUpdateError ?? null })
          }))
        };
      }

      if (table === "leases") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: config.lease ?? null, error: null })
            }))
          }))
        };
      }

      if (table === "units") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: config.unit ?? null, error: null })
            }))
          }))
        };
      }

      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: config.tenantProfile ?? null, error: null })
            }))
          }))
        };
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }))
        }))
      };
    })
  } as unknown as SupabaseClient;
}

describe("charges actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`REDIRECT:${path}`);
    });
    checkRateLimitMock.mockReturnValue({ allowed: true, remaining: 10 });
    getOwnerStripeAccountForPropertyMock.mockResolvedValue("acct_123");
    canUserAdministerPropertyMock.mockResolvedValue(true);
    requireAuthMock.mockResolvedValue({
      user: { id: "user-1", email: "owner@example.com" },
      role: "owner",
      supabase: createCheckoutSupabase({
        charge: { id: "charge-1", amount_cents: 125000, status: "pending", lease_id: "lease-1" },
        lease: { id: "lease-1", tenant_profile_id: "tenant-1", unit_id: "unit-1" },
        unit: { id: "unit-1", property_id: "property-1" },
        property: { id: "property-1" }
      })
    });
    createAdminClientMock.mockReturnValue(
      createManualAdminClient({
        charge: { id: "charge-1", lease_id: "lease-1", due_date: "2026-03-01", status: "pending" },
        lease: { id: "lease-1", tenant_profile_id: "tenant-1", unit_id: "unit-1" },
        unit: { id: "unit-1", property_id: "property-1", unit_number: "1A" },
        tenantProfile: { id: "tenant-1", email: "tenant@example.com" }
      })
    );
    notifyOwnerMembersForPropertyMock.mockResolvedValue(undefined);
    createNotificationWithDeliveryMock.mockResolvedValue(undefined);
    logAuditMock.mockResolvedValue(undefined);
    awardXpMock.mockResolvedValue(undefined);
  });

  it("returns a validation error when chargeId is missing", async () => {
    parseFormDataMock.mockReturnValueOnce({ success: false, error: "Charge ID is required." });

    const result = await createCheckoutForCharge(new FormData());

    expect(result).toEqual({ success: false, error: "Charge ID is required." });
  });

  it("returns an error when the charge is already paid", async () => {
    parseFormDataMock.mockReturnValueOnce({ success: true, data: { chargeId: "charge-1" } });
    requireAuthMock.mockResolvedValueOnce({
      user: { id: "user-1", email: "owner@example.com" },
      role: "owner",
      supabase: createCheckoutSupabase({
        charge: { id: "charge-1", amount_cents: 125000, status: "paid", lease_id: "lease-1" }
      })
    });

    const result = await createCheckoutForCharge(new FormData());

    expect(result).toEqual({ success: false, error: "This charge has already been paid." });
  });

  it("returns an error when the lease is missing", async () => {
    parseFormDataMock.mockReturnValueOnce({ success: true, data: { chargeId: "charge-1" } });
    requireAuthMock.mockResolvedValueOnce({
      user: { id: "user-1", email: "owner@example.com" },
      role: "owner",
      supabase: createCheckoutSupabase({
        charge: { id: "charge-1", amount_cents: 125000, status: "pending", lease_id: "lease-1" },
        lease: null
      })
    });

    const result = await createCheckoutForCharge(new FormData());

    expect(result).toEqual({ success: false, error: "Lease not found for this charge." });
  });

  it("returns a rate limit error after too many checkout attempts", async () => {
    checkRateLimitMock.mockReturnValueOnce({ allowed: false, remaining: 0 });

    const result = await createCheckoutForCharge(new FormData());

    expect(result).toEqual({ success: false, error: "Too many requests. Please try again later." });
  });

  it("returns an error when a manual payment amount is invalid", async () => {
    parseFormDataMock.mockReturnValueOnce({
      success: true,
      data: {
        chargeId: "charge-1",
        amountDollars: 0,
        method: "cash",
        referenceNote: ""
      }
    });

    const result = await recordManualPayment(null, new FormData());

    expect(result).toEqual({ success: false, error: "Amount must be greater than $0." });
  });

  it("returns an error when the manual payment charge is already paid", async () => {
    parseFormDataMock.mockReturnValueOnce({
      success: true,
      data: {
        chargeId: "charge-1",
        amountDollars: 1250,
        method: "cash",
        referenceNote: ""
      }
    });
    createAdminClientMock.mockReturnValueOnce(
      createManualAdminClient({
        charge: { id: "charge-1", lease_id: "lease-1", due_date: "2026-03-01", status: "paid" }
      })
    );

    const result = await recordManualPayment(null, new FormData());

    expect(result).toEqual({ success: false, error: "This charge is already marked paid." });
  });

  it("returns an access denied error for unauthorized manual payment users", async () => {
    parseFormDataMock.mockReturnValueOnce({
      success: true,
      data: {
        chargeId: "charge-1",
        amountDollars: 1250,
        method: "cash",
        referenceNote: ""
      }
    });
    canUserAdministerPropertyMock.mockResolvedValueOnce(false);

    const result = await recordManualPayment(null, new FormData());

    expect(result).toEqual({ success: false, error: "Access denied." });
  });

  it("returns success for a valid manual payment", async () => {
    parseFormDataMock.mockReturnValueOnce({
      success: true,
      data: {
        chargeId: "charge-1",
        amountDollars: 1250,
        method: "cash",
        referenceNote: "Paid in office"
      }
    });

    const result = await recordManualPayment(null, new FormData());

    expect(result).toEqual({ success: true, message: "Manual payment recorded." });
    expect(revalidatePathMock).toHaveBeenCalledWith("/");
    expect(revalidatePathMock).toHaveBeenCalledWith("/owner");
    expect(revalidatePathMock).toHaveBeenCalledWith("/manager");
  });
});
