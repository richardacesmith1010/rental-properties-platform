import { beforeEach, describe, expect, it, vi } from "vitest";

const createStripeTransferMock = vi.hoisted(() => vi.fn());
const createNotificationWithDeliveryMock = vi.hoisted(() => vi.fn());
const notifyOwnerMembersForPropertyMock = vi.hoisted(() => vi.fn());
const getManagerStripeAccountForPropertyMock = vi.hoisted(() => vi.fn());
const getOwnerStripeAccountForPropertyMock = vi.hoisted(() => vi.fn());
const getDistributionMembersForAccountMock = vi.hoisted(() => vi.fn());
const planEqualDistributionTransfersMock = vi.hoisted(() => vi.fn());
const planCustomDistributionTransfersMock = vi.hoisted(() => vi.fn());
const recordPaymentDistributionMock = vi.hoisted(() => vi.fn());
const awardXpMock = vi.hoisted(() => vi.fn());
const sideEffectErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/distributions", () => ({
  getDistributionMembersForAccount: getDistributionMembersForAccountMock,
  planCustomDistributionTransfers: planCustomDistributionTransfersMock,
  planEqualDistributionTransfers: planEqualDistributionTransfersMock,
  recordPaymentDistribution: recordPaymentDistributionMock
}));

vi.mock("@/lib/gamification", () => ({
  awardXp: awardXpMock,
  XP_VALUES: { rent_paid_on_time: 10, rent_paid_late: 5 }
}));

vi.mock("@/lib/logger", () => ({
  sideEffectError: sideEffectErrorMock
}));

vi.mock("@/lib/notifications", () => ({
  createNotificationWithDelivery: createNotificationWithDeliveryMock,
  notifyOwnerMembersForProperty: notifyOwnerMembersForPropertyMock
}));

vi.mock("@/lib/stripe", () => ({
  createStripeTransfer: createStripeTransferMock
}));

vi.mock("@/lib/stripe-connect", () => ({
  getManagerStripeAccountForProperty: getManagerStripeAccountForPropertyMock,
  getOwnerStripeAccountForProperty: getOwnerStripeAccountForPropertyMock
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn()
}));

import {
  handleAsyncPaymentSucceeded,
  handleCheckoutSessionCompleted
} from "@/lib/stripe-webhook-handlers";

interface TestSupabaseConfig {
  existingManagerTransferId?: string | null;
  managerProfileEmail?: string | null;
  paymentUpdateError?: { message: string } | null;
}

function createWebhookSupabase(config: TestSupabaseConfig = {}) {
  const charge = {
    id: "charge-1",
    lease_id: "lease-1",
    status: "pending",
    due_date: "2026-05-01",
    amount_cents: 125000
  };
  const lease = {
    id: "lease-1",
    tenant_profile_id: "tenant-1",
    unit_id: "unit-1"
  };
  const unit = {
    id: "unit-1",
    property_id: "property-1",
    unit_number: "1A"
  };
  const property = {
    id: "property-1",
    owner_account_id: null,
    name: "Atlas House"
  };

  return {
    from: vi.fn((table: string) => {
      if (table === "payments") {
        return {
          select: vi.fn((columns: string) => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: columns.includes("manager_transfer_id")
                  ? { manager_transfer_id: config.existingManagerTransferId ?? null }
                  : null,
                error: null
              })
            }))
          })),
          insert: vi.fn().mockResolvedValue({ error: null }),
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: config.paymentUpdateError ?? null })
          }))
        };
      }

      if (table === "rent_charges") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: charge, error: null })
            }))
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => ({
                select: vi.fn().mockResolvedValue({ data: [{ id: charge.id }], error: null, count: 1 })
              }))
            }))
          }))
        };
      }

      if (table === "leases") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: lease, error: null })
            }))
          }))
        };
      }

      if (table === "units") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: unit, error: null })
            }))
          }))
        };
      }

      if (table === "properties") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: property, error: null })
            }))
          }))
        };
      }

      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((column: string, value: string) => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: value === "manager-1"
                  ? { email: config.managerProfileEmail ?? "manager@example.com" }
                  : column === "id"
                    ? { id: "tenant-1", email: "tenant@example.com" }
                    : null,
                error: null
              })
            }))
          }))
        };
      }

      if (table === "property_managers" || table === "ownership_account_members") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
                  })),
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
                })),
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
              })),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
            }))
          }))
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    })
  };
}

function getManagerNotificationPayloads() {
  return createNotificationWithDeliveryMock.mock.calls
    .map(([payload]) => payload)
    .filter((payload) => payload.title === "Management fee received");
}

async function flushAsyncWork() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("stripe webhook handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createNotificationWithDeliveryMock.mockResolvedValue(undefined);
    notifyOwnerMembersForPropertyMock.mockResolvedValue(undefined);
    getOwnerStripeAccountForPropertyMock.mockResolvedValue("acct_owner_123");
    getManagerStripeAccountForPropertyMock.mockResolvedValue({
      accountId: "acct_manager_123",
      feeCents: 11250,
      managerProfileId: "manager-1"
    });
    getDistributionMembersForAccountMock.mockResolvedValue({ mode: "retain", members: [] });
    planEqualDistributionTransfersMock.mockReturnValue({ memberShares: [], llcFallbackAmount: 0 });
    planCustomDistributionTransfersMock.mockReturnValue({ memberShares: [], llcFallbackAmount: 0 });
    recordPaymentDistributionMock.mockResolvedValue(undefined);
    awardXpMock.mockResolvedValue(undefined);
    sideEffectErrorMock.mockReturnValue(() => undefined);
  });

  it("notifies the manager after a successful ACH transfer", async () => {
    const supabase = createWebhookSupabase();
    createStripeTransferMock
      .mockResolvedValueOnce({ id: "tr_owner_123", amount: 113750 })
      .mockResolvedValueOnce({ id: "tr_manager_123", amount: 11250 });

    await handleAsyncPaymentSucceeded(supabase as never, {
      id: "cs_123",
      url: null,
      payment_status: "paid",
      amount_total: 125000,
      payment_intent: "pi_123",
      metadata: {
        charge_id: "charge-1",
        user_id: "tenant-1",
        manager_fee_cents: "11250"
      }
    });
    await flushAsyncWork();

    expect(createStripeTransferMock).toHaveBeenCalledTimes(2);
    expect(getManagerNotificationPayloads()).toEqual([
      expect.objectContaining({
        recipientProfileId: "manager-1",
        recipientEmail: "manager@example.com",
        type: "payment_recorded",
        title: "Management fee received",
        body: "Your management fee of $112.50 for Atlas House Unit 1A was sent to your bank.",
        entityType: "rent_charge",
        entityId: "charge-1"
      })
    ]);
  });

  it("notifies the manager after a successful destination-charge transfer", async () => {
    const supabase = createWebhookSupabase();
    createStripeTransferMock.mockResolvedValueOnce({ id: "tr_manager_123", amount: 11250 });

    await handleCheckoutSessionCompleted(supabase as never, {
      id: "cs_456",
      url: null,
      payment_status: "paid",
      amount_total: 128762,
      payment_intent: "pi_456",
      metadata: {
        charge_id: "charge-1",
        user_id: "tenant-1",
        payment_method: "card",
        transfer_mode: "destination",
        base_amount_cents: "125000",
        manager_fee_cents: "11250"
      }
    });
    await flushAsyncWork();

    expect(createStripeTransferMock).toHaveBeenCalledTimes(1);
    expect(getManagerNotificationPayloads()).toEqual([
      expect.objectContaining({
        recipientProfileId: "manager-1",
        recipientEmail: "manager@example.com",
        type: "payment_recorded",
        title: "Management fee received",
        body: "Your management fee of $112.50 for Atlas House Unit 1A was sent to your bank.",
        entityType: "rent_charge",
        entityId: "charge-1"
      })
    ]);
  });

  it("does not notify the manager when no manager transfer is created", async () => {
    const supabase = createWebhookSupabase();
    getManagerStripeAccountForPropertyMock.mockResolvedValueOnce(null);

    await handleCheckoutSessionCompleted(supabase as never, {
      id: "cs_789",
      url: null,
      payment_status: "paid",
      amount_total: 128762,
      payment_intent: "pi_789",
      metadata: {
        charge_id: "charge-1",
        user_id: "tenant-1",
        payment_method: "card",
        transfer_mode: "destination",
        base_amount_cents: "125000",
        manager_fee_cents: "11250"
      }
    });
    await flushAsyncWork();

    expect(createStripeTransferMock).not.toHaveBeenCalled();
    expect(getManagerNotificationPayloads()).toHaveLength(0);
  });

  it("does not notify the manager when the manager transfer fails", async () => {
    const supabase = createWebhookSupabase();
    createStripeTransferMock.mockRejectedValueOnce(new Error("transfer failed"));

    await handleCheckoutSessionCompleted(supabase as never, {
      id: "cs_999",
      url: null,
      payment_status: "paid",
      amount_total: 128762,
      payment_intent: "pi_999",
      metadata: {
        charge_id: "charge-1",
        user_id: "tenant-1",
        payment_method: "card",
        transfer_mode: "destination",
        base_amount_cents: "125000",
        manager_fee_cents: "11250"
      }
    });
    await flushAsyncWork();

    expect(getManagerNotificationPayloads()).toHaveLength(0);
  });
});
