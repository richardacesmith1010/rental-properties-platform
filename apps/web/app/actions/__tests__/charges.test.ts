import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const createAdminClientMock = vi.hoisted(() => vi.fn());
const createStripeCheckoutSessionMock = vi.hoisted(() => vi.fn());
const calculateCardFeeMock = vi.hoisted(() => vi.fn());
const getManagerFeeForPropertyMock = vi.hoisted(() => vi.fn());
const getOwnerStripeAccountForPropertyMock = vi.hoisted(() => vi.fn());
const getManagerStripeAccountForPropertyMock = vi.hoisted(() => vi.fn());
const canUserAdministerPropertyMock = vi.hoisted(() => vi.fn());
const createNotificationWithDeliveryMock = vi.hoisted(() => vi.fn());
const notifyOwnerMembersForPropertyMock = vi.hoisted(() => vi.fn());
const notifyOwnerOfStripeIssueMock = vi.hoisted(() => vi.fn());
const logAuditMock = vi.hoisted(() => vi.fn());
const awardXpMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn());
const parseFormDataMock = vi.hoisted(() => vi.fn());
const requireAuthMock = vi.hoisted(() => vi.fn());
const sendPlatformAlertMock = vi.hoisted(() => vi.fn());
const sideEffectErrorMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: createAdminClientMock }));
vi.mock("@/lib/stripe", () => ({ createStripeCheckoutSession: createStripeCheckoutSessionMock }));
vi.mock("@/lib/payment-fees", () => ({
  calculateCardFee: calculateCardFeeMock,
  getManagerFeeForProperty: getManagerFeeForPropertyMock,
  MIN_ONLINE_PAYMENT_CENTS: 500
}));
vi.mock("@/lib/stripe-connect", () => ({
  getOwnerStripeAccountForProperty: getOwnerStripeAccountForPropertyMock,
  getManagerStripeAccountForProperty: getManagerStripeAccountForPropertyMock
}));
vi.mock("@/lib/property-access", () => ({ canUserAdministerProperty: canUserAdministerPropertyMock }));
vi.mock("@/lib/notifications", () => ({
  createNotificationWithDelivery: createNotificationWithDeliveryMock,
  notifyOwnerMembersForProperty: notifyOwnerMembersForPropertyMock,
  notifyOwnerOfStripeIssue: notifyOwnerOfStripeIssueMock
}));
vi.mock("@/lib/audit", () => ({ logAudit: logAuditMock }));
vi.mock("@/lib/gamification", () => ({
  awardXp: awardXpMock,
  XP_VALUES: { rent_paid_on_time: 10, rent_paid_late: 5 }
}));
vi.mock("@/lib/logger", () => ({ sideEffectError: sideEffectErrorMock }));
vi.mock("@/lib/platform-alerts", () => ({ sendPlatformAlert: sendPlatformAlertMock }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: checkRateLimitMock }));
vi.mock("@/lib/env", () => ({ isStripeConfigured: () => true }));
vi.mock("@/lib/validations", () => ({
  payChargeSchema: {},
  recordManualPaymentSchema: {},
  parseFormData: parseFormDataMock
}));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: requireAuthMock }));

import { payWithACH, payWithCard, recordManualPayment } from "@/app/actions/charges";

interface CheckoutConfig {
  charge?: { id: string; amount_cents: number; status: string; lease_id: string } | null;
  lease?: { id: string; tenant_profile_id: string; unit_id: string } | null;
  unit?: { id: string; property_id: string } | null;
  property?: { id: string } | null;
}

interface ManualConfig {
  charge?: { id: string; lease_id: string; due_date: string; status: string; amount_cents: number } | null;
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
          is: vi.fn(() => ({
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
          })),
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
        const chargeUpdateEq = vi.fn().mockResolvedValue({ error: config.chargeUpdateError ?? null });
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: config.charge ?? null, error: null })
              })),
              maybeSingle: vi.fn().mockResolvedValue({ data: config.charge ?? null, error: null })
            }))
          })),
          update: vi.fn(() => ({
            eq: chargeUpdateEq,
            in: vi.fn(() => ({
              eq: chargeUpdateEq
            }))
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
    calculateCardFeeMock.mockReturnValue({ baseCents: 125000, feeCents: 3762, totalCents: 128762 });
    getManagerFeeForPropertyMock.mockResolvedValue({ feeCents: 11250, managerProfileId: "manager-1" });
    getOwnerStripeAccountForPropertyMock.mockResolvedValue("acct_123");
    getManagerStripeAccountForPropertyMock.mockResolvedValue({
      accountId: "acct_manager_123",
      feeCents: 11250
    });
    canUserAdministerPropertyMock.mockResolvedValue(true);
    createStripeCheckoutSessionMock.mockResolvedValue({ url: "https://checkout.stripe.test/session" });
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
        charge: {
          id: "charge-1",
          lease_id: "lease-1",
          due_date: "2026-03-01",
          status: "pending",
          amount_cents: 125000
        },
        lease: { id: "lease-1", tenant_profile_id: "tenant-1", unit_id: "unit-1" },
        unit: { id: "unit-1", property_id: "property-1", unit_number: "1A" },
        tenantProfile: { id: "tenant-1", email: "tenant@example.com" }
      })
    );
    notifyOwnerMembersForPropertyMock.mockResolvedValue(undefined);
    notifyOwnerOfStripeIssueMock.mockResolvedValue(undefined);
    createNotificationWithDeliveryMock.mockResolvedValue(undefined);
    logAuditMock.mockResolvedValue(undefined);
    awardXpMock.mockResolvedValue(undefined);
    sendPlatformAlertMock.mockResolvedValue({ sent: true });
    sideEffectErrorMock.mockReturnValue(() => undefined);
  });

  it("returns a validation error when chargeId is missing", async () => {
    parseFormDataMock.mockReturnValueOnce({ success: false, error: "Charge ID is required." });

    const result = await payWithCard(new FormData());

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

    const result = await payWithCard(new FormData());

    expect(result).toEqual({ success: false, error: "This charge has already been paid." });
  });

  it("blocks card checkout when the charge is below the online payment minimum", async () => {
    parseFormDataMock.mockReturnValueOnce({ success: true, data: { chargeId: "charge-1" } });
    requireAuthMock.mockResolvedValueOnce({
      user: { id: "user-1", email: "owner@example.com" },
      role: "owner",
      supabase: createCheckoutSupabase({
        charge: { id: "charge-1", amount_cents: 499, status: "pending", lease_id: "lease-1" }
      })
    });

    const result = await payWithCard(new FormData());

    expect(result).toEqual({
      success: false,
      error:
        "Online payments must be at least $5.00. For smaller amounts, please ask your owner or manager to record a cash or check payment."
    });
    expect(createStripeCheckoutSessionMock).not.toHaveBeenCalled();
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

    const result = await payWithCard(new FormData());

    expect(result).toEqual({ success: false, error: "Lease not found for this charge." });
  });

  it("returns a rate limit error after too many checkout attempts", async () => {
    checkRateLimitMock.mockReturnValueOnce({ allowed: false, remaining: 0 });

    const result = await payWithCard(new FormData());

    expect(result).toEqual({ success: false, error: "Too many requests. Please try again later." });
  });

  it("creates a destination charge checkout session for card payments", async () => {
    parseFormDataMock.mockReturnValueOnce({ success: true, data: { chargeId: "charge-1" } });

    await expect(payWithCard(new FormData())).rejects.toThrow("REDIRECT:https://checkout.stripe.test/session");

    expect(calculateCardFeeMock).toHaveBeenCalledWith(125000);
    expect(getManagerFeeForPropertyMock).toHaveBeenCalledWith("property-1", 125000);
    expect(createStripeCheckoutSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 128762,
        paymentMethodTypes: ["card"],
        transferDataDestination: "acct_123",
        applicationFeeAmountCents: 15012,
        metadata: expect.objectContaining({
          charge_id: "charge-1",
          user_id: "user-1",
          payment_method: "card",
          transfer_mode: "destination",
          processing_fee_cents: "3762",
          base_amount_cents: "125000",
          manager_fee_cents: "11250",
          manager_fee_full_cents: "11250"
        })
      })
    );
  });

  it("allows card checkout when the charge meets the online payment minimum exactly", async () => {
    parseFormDataMock.mockReturnValueOnce({ success: true, data: { chargeId: "charge-1" } });
    calculateCardFeeMock.mockReturnValueOnce({ baseCents: 500, feeCents: 46, totalCents: 546 });
    getManagerFeeForPropertyMock.mockResolvedValueOnce({ feeCents: 0, managerProfileId: null });
    requireAuthMock.mockResolvedValueOnce({
      user: { id: "user-1", email: "owner@example.com" },
      role: "owner",
      supabase: createCheckoutSupabase({
        charge: { id: "charge-1", amount_cents: 500, status: "pending", lease_id: "lease-1" },
        lease: { id: "lease-1", tenant_profile_id: "tenant-1", unit_id: "unit-1" },
        unit: { id: "unit-1", property_id: "property-1" },
        property: { id: "property-1" }
      })
    });

    await expect(payWithCard(new FormData())).rejects.toThrow(
      "REDIRECT:https://checkout.stripe.test/session"
    );

    expect(calculateCardFeeMock).toHaveBeenCalledWith(500);
    expect(createStripeCheckoutSessionMock).toHaveBeenCalled();
  });

  it("continues normal card checkout for larger charges", async () => {
    parseFormDataMock.mockReturnValueOnce({ success: true, data: { chargeId: "charge-1" } });
    calculateCardFeeMock.mockReturnValueOnce({ baseCents: 10000, feeCents: 339, totalCents: 10339 });
    getManagerFeeForPropertyMock.mockResolvedValueOnce({ feeCents: 0, managerProfileId: null });
    requireAuthMock.mockResolvedValueOnce({
      user: { id: "user-1", email: "owner@example.com" },
      role: "owner",
      supabase: createCheckoutSupabase({
        charge: { id: "charge-1", amount_cents: 10000, status: "pending", lease_id: "lease-1" },
        lease: { id: "lease-1", tenant_profile_id: "tenant-1", unit_id: "unit-1" },
        unit: { id: "unit-1", property_id: "property-1" },
        property: { id: "property-1" }
      })
    });

    await expect(payWithCard(new FormData())).rejects.toThrow(
      "REDIRECT:https://checkout.stripe.test/session"
    );

    expect(calculateCardFeeMock).toHaveBeenCalledWith(10000);
    expect(createStripeCheckoutSessionMock).toHaveBeenCalled();
  });

  it("keeps the owner whole when the manager is not Stripe-onboarded for card payments", async () => {
    parseFormDataMock.mockReturnValueOnce({ success: true, data: { chargeId: "charge-1" } });
    getManagerStripeAccountForPropertyMock.mockResolvedValueOnce(null);

    await expect(payWithCard(new FormData())).rejects.toThrow("REDIRECT:https://checkout.stripe.test/session");

    expect(createStripeCheckoutSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 128762,
        applicationFeeAmountCents: 3762,
        metadata: expect.objectContaining({
          manager_fee_cents: "0",
          manager_fee_full_cents: "11250"
        })
      })
    );
  });

  it("creates a bank account checkout session without fees for ACH payments", async () => {
    parseFormDataMock.mockReturnValueOnce({ success: true, data: { chargeId: "charge-1" } });

    await expect(payWithACH(new FormData())).rejects.toThrow(
      "REDIRECT:https://checkout.stripe.test/session"
    );

    const sessionConfig = createStripeCheckoutSessionMock.mock.calls[0]?.[0];
    expect(sessionConfig).toMatchObject({
      amountCents: 125000,
      successUrl: expect.stringContaining("method=ach"),
      paymentMethodTypes: ["us_bank_account"],
      transferGroup: "charge_charge-1",
      metadata: {
        charge_id: "charge-1",
        user_id: "user-1",
        payment_method: "ach",
        base_amount_cents: "125000",
        manager_fee_cents: "11250",
        manager_fee_full_cents: "11250"
      }
    });
    expect(sessionConfig.transferDataDestination).toBeUndefined();
    expect(sessionConfig.applicationFeeAmountCents).toBeUndefined();
    expect(sessionConfig.metadata.transfer_mode).toBeUndefined();
    expect(sessionConfig.metadata.processing_fee_cents).toBeUndefined();
  });

  it("returns an owner-bank message and notifies the owner when Stripe destination is missing", async () => {
    parseFormDataMock.mockReturnValueOnce({ success: true, data: { chargeId: "charge-1" } });
    createStripeCheckoutSessionMock.mockRejectedValueOnce(
      new Error("No such destination: 'acct_xxx'")
    );

    const result = await payWithCard(new FormData());

    expect(result).toEqual({
      success: false,
      error:
        "We can't connect to your owner's bank right now. We've notified them. Please try again in a few hours, or message your property manager."
    });
    expect(notifyOwnerOfStripeIssueMock).toHaveBeenCalledWith({
      propertyId: "property-1",
      category: "owner_not_connected"
    });
    expect(sendPlatformAlertMock).not.toHaveBeenCalled();
    expect(sideEffectErrorMock).toHaveBeenCalledWith("payWithCard", "start_stripe_checkout", {
      userId: "user-1",
      entityType: "rent_charge",
      entityId: "charge-1"
    });
  });

  it("returns a platform-setup message and alerts the platform admin for ACH setup errors", async () => {
    parseFormDataMock.mockReturnValueOnce({ success: true, data: { chargeId: "charge-1" } });
    createStripeCheckoutSessionMock.mockRejectedValueOnce(
      new Error("You can only create new accounts if you've signed up for Connect")
    );

    const result = await payWithACH(new FormData());

    expect(result).toEqual({
      success: false,
      error:
        "Online payments are being set up. We've been notified and are fixing it. Please try again later."
    });
    expect(sendPlatformAlertMock).toHaveBeenCalledWith({
      subject: "Stripe Connect platform issue",
      body:
        "payWithACH failed for charge charge-1 (property property-1). Error: You can only create new accounts if you've signed up for Connect",
      dedupeKey: "platform_misconfigured:payWithACH"
    });
    expect(notifyOwnerOfStripeIssueMock).not.toHaveBeenCalled();
  });

  it("returns a retry-later message for transient Stripe failures without sending alerts", async () => {
    parseFormDataMock.mockReturnValueOnce({ success: true, data: { chargeId: "charge-1" } });
    createStripeCheckoutSessionMock.mockRejectedValue(new Error("fetch failed"));

    const result = await payWithCard(new FormData());

    expect(result).toEqual({
      success: false,
      error:
        "Our payment processor is having trouble right now. Please try again in a few minutes."
    });
    expect(notifyOwnerOfStripeIssueMock).not.toHaveBeenCalled();
    expect(sendPlatformAlertMock).not.toHaveBeenCalled();
  });

  it("returns a generic payment message for unknown Stripe failures without notifications", async () => {
    parseFormDataMock.mockReturnValueOnce({ success: true, data: { chargeId: "charge-1" } });
    createStripeCheckoutSessionMock.mockRejectedValueOnce(new Error("some weird error"));

    const result = await payWithCard(new FormData());

    expect(result).toEqual({
      success: false,
      error:
        "Something went wrong with your payment. Please try again, or message your property manager."
    });
    expect(notifyOwnerOfStripeIssueMock).not.toHaveBeenCalled();
    expect(sendPlatformAlertMock).not.toHaveBeenCalled();
  });

  it("blocks ACH checkout when the charge is below the online payment minimum", async () => {
    parseFormDataMock.mockReturnValueOnce({ success: true, data: { chargeId: "charge-1" } });
    requireAuthMock.mockResolvedValueOnce({
      user: { id: "user-1", email: "owner@example.com" },
      role: "owner",
      supabase: createCheckoutSupabase({
        charge: { id: "charge-1", amount_cents: 499, status: "pending", lease_id: "lease-1" }
      })
    });

    const result = await payWithACH(new FormData());

    expect(result).toEqual({
      success: false,
      error:
        "Online payments must be at least $5.00. For smaller amounts, please ask your owner or manager to record a cash or check payment."
    });
    expect(createStripeCheckoutSessionMock).not.toHaveBeenCalled();
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
        charge: {
          id: "charge-1",
          lease_id: "lease-1",
          due_date: "2026-03-01",
          status: "paid",
          amount_cents: 125000
        }
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

  it("rejects partial manual payments", async () => {
    parseFormDataMock.mockReturnValueOnce({
      success: true,
      data: {
        chargeId: "charge-1",
        amountDollars: 1200,
        method: "cash",
        referenceNote: ""
      }
    });

    const result = await recordManualPayment(null, new FormData());

    expect(result).toEqual({
      success: false,
      error: "Payment amount must match the charge amount exactly."
    });
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
