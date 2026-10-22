import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.hoisted(() => vi.fn());
const generateMonthlyChargesForPropertyIdsWithClientMock = vi.hoisted(() => vi.fn());
const getAdministeredPropertyIdsMock = vi.hoisted(() => vi.fn());
const getOwnerStripeAccountForPropertyMock = vi.hoisted(() => vi.fn());
const createOffSessionPaymentIntentMock = vi.hoisted(() => vi.fn());
const assertStripeEligiblePropertyMock = vi.hoisted(() => vi.fn());
const paymentInMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/client-accounts", () => ({
  assertStripeEligibleProperty: assertStripeEligiblePropertyMock,
  StripeNotEligibleError: class StripeNotEligibleError extends Error {}
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("@/lib/charge-generation", () => ({
  generateMonthlyChargesForPropertyIdsWithClient: generateMonthlyChargesForPropertyIdsWithClientMock
}));
vi.mock("@/lib/property-access", () => ({ getAdministeredPropertyIds: getAdministeredPropertyIdsMock }));
vi.mock("@/lib/stripe-connect", () => ({
  getOwnerStripeAccountForProperty: getOwnerStripeAccountForPropertyMock
}));
vi.mock("@/lib/stripe-autopay", () => ({
  createOffSessionPaymentIntent: createOffSessionPaymentIntentMock,
  createStripeCustomer: vi.fn(),
  createSetupCheckoutSession: vi.fn(),
  retrieveSetupIntent: vi.fn(),
  getPaymentMethod: vi.fn()
}));

import { processAutopayCharges } from "@/lib/autopay";

interface AutopayEnrollmentRow {
  id: string;
  lease_id: string;
  tenant_profile_id: string;
  stripe_payment_method_id: string;
  retry_count: number;
  last_failed_at: string | null;
  enabled?: boolean;
}

interface LeaseRow {
  id: string;
  unit_id: string;
  active: boolean;
}

interface ProfileRow {
  id: string;
  stripe_customer_id: string | null;
}

interface PaymentRow {
  id: string;
  rent_charge_id: string | null;
  reversed_at?: string | null;
  recorded_via?: string;
}

interface UnitRow {
  id: string;
  property_id: string;
}

interface ChargeRow {
  id: string;
  lease_id: string;
  due_date: string;
  amount_cents: number;
  status: string;
  category: string;
  deleted_at: string | null;
}

interface ChargeRecheckRow {
  status: string;
  deleted_at: string | null;
}

interface AutopaySupabaseConfig {
  enrollments: AutopayEnrollmentRow[];
  leases: LeaseRow[];
  profiles: ProfileRow[];
  charges: ChargeRow[];
  payments?: PaymentRow[];
  paymentLookupError?: boolean;
  units: UnitRow[];
  recheckByChargeId?: Record<string, ChargeRecheckRow | null>;
  recheckErrorByChargeId?: Record<string, { message: string } | null>;
}

function createSupabaseMock(config: AutopaySupabaseConfig): SupabaseClient {
  const client = {
    from: vi.fn((table: string) => {
      if (table === "autopay_enrollments") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async (column: string, value: boolean) => ({
              data:
                column === "enabled"
                  ? config.enrollments.filter((row) => (row.enabled ?? true) === value)
                  : [],
              error: null
            }))
          }))
        };
      }

      if (table === "leases") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async (_column: string, ids: string[]) => ({
              data: config.leases.filter((lease) => ids.includes(lease.id)),
              error: null
            }))
          }))
        };
      }

      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async (_column: string, ids: string[]) => ({
              data: config.profiles.filter((profile) => ids.includes(profile.id)),
              error: null
            }))
          }))
        };
      }

      if (table === "payments") {
        return {
          select: vi.fn(() => ({
            in: paymentInMock.mockImplementation((_column: string, ids: string[]) => ({
              order: vi.fn(() => ({
                range: vi.fn(async (from: number, to: number) => ({
                  data: (config.payments ?? []).filter((row) => ids.includes(row.rent_charge_id ?? ""))
                    .sort((a, b) => a.id.localeCompare(b.id)).slice(from, to + 1),
                  error: config.paymentLookupError ? { message: "lookup failed" } : null
                }))
              }))
            }))
          }))
        };
      }

      if (table === "units") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async (_column: string, ids: string[]) => ({
              data: config.units.filter((unit) => ids.includes(unit.id)),
              error: null
            }))
          }))
        };
      }

      if (table === "rent_charges") {
        return {
          select: vi.fn((columns: string) => {
            if (columns === "status, deleted_at") {
              return {
                eq: vi.fn((column: string, chargeId: string) => ({
                  maybeSingle: vi.fn(async () => {
                    if (column !== "id") {
                      return { data: null, error: null };
                    }

                    const recheckError = config.recheckErrorByChargeId?.[chargeId] ?? null;
                    if (recheckError) {
                      return { data: null, error: recheckError };
                    }

                    const recheckRow =
                      config.recheckByChargeId?.[chargeId] ??
                      (() => {
                        const charge = config.charges.find((row) => row.id === chargeId);
                        return charge
                          ? { status: charge.status, deleted_at: charge.deleted_at }
                          : null;
                      })();

                    return { data: recheckRow, error: null };
                  })
                }))
              };
            }

            const filters: {
              leaseIds: string[];
              statuses: string[];
              category: string | null;
              dueDate: string | null;
              deletedAt: string | null | undefined;
            } = {
              leaseIds: [],
              statuses: [],
              category: null,
              dueDate: null,
              deletedAt: undefined
            };

            const builder = {
              in: vi.fn((column: string, values: string[]) => {
                if (column === "lease_id") {
                  filters.leaseIds = values;
                }
                if (column === "status") {
                  filters.statuses = values;
                }
                return builder;
              }),
              eq: vi.fn((column: string, value: string) => {
                if (column === "category") {
                  filters.category = value;
                }
                return builder;
              }),
              lte: vi.fn((column: string, value: string) => {
                if (column === "due_date") {
                  filters.dueDate = value;
                }
                return builder;
              }),
              is: vi.fn((column: string, value: null) => {
                if (column === "deleted_at") {
                  filters.deletedAt = value;
                }
                return builder;
              }),
              order: vi.fn(async () => ({
                data: config.charges
                  .filter((charge) =>
                    filters.leaseIds.length === 0 ? true : filters.leaseIds.includes(charge.lease_id)
                  )
                  .filter((charge) =>
                    filters.statuses.length === 0 ? true : filters.statuses.includes(charge.status)
                  )
                  .filter((charge) => (filters.category ? charge.category === filters.category : true))
                  .filter((charge) => (filters.dueDate ? charge.due_date <= filters.dueDate : true))
                  .filter((charge) =>
                    filters.deletedAt === null ? charge.deleted_at === null : true
                  )
                  .sort((left, right) => left.due_date.localeCompare(right.due_date))
                  .map((charge) => ({
                    id: charge.id,
                    lease_id: charge.lease_id,
                    due_date: charge.due_date,
                    amount_cents: charge.amount_cents,
                    status: charge.status
                  })),
                error: null
              }))
            };

            return builder;
          })
        };
      }

      return {
        select: vi.fn(async () => ({ data: [], error: null }))
      };
    })
  };

  return client as unknown as SupabaseClient;
}

function buildAutopayConfig(overrides: Partial<AutopaySupabaseConfig> = {}): AutopaySupabaseConfig {
  return {
    enrollments: [
      {
        id: "enrollment-1",
        lease_id: "lease-1",
        tenant_profile_id: "tenant-1",
        stripe_payment_method_id: "pm_1",
        retry_count: 0,
        last_failed_at: null
      }
    ],
    leases: [{ id: "lease-1", unit_id: "unit-1", active: true }],
    profiles: [{ id: "tenant-1", stripe_customer_id: "cus_1" }],
    charges: [
      {
        id: "charge-1",
        lease_id: "lease-1",
        due_date: "2026-05-01",
        amount_cents: 125000,
        status: "pending",
        category: "rent",
        deleted_at: null
      }
    ],
    payments: [],
    units: [{ id: "unit-1", property_id: "property-1" }],
    recheckByChargeId: undefined,
    recheckErrorByChargeId: undefined,
    ...overrides
  };
}

const paymentRow = (source: string, reversedAt: string | null): PaymentRow => ({
  id: "payment-1", rent_charge_id: "charge-1", reversed_at: reversedAt, recorded_via: source
});
const dueCharge = (status: string, dueDate = "2026-05-01"): ChargeRow => ({
  id: "charge-1", lease_id: "lease-1", due_date: dueDate, amount_cents: 125000,
  status, category: "rent", deleted_at: null
});

describe("processAutopayCharges", () => {
  it("D8 pays November 1 only after Denver reaches that date", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const config = buildAutopayConfig({ charges: [dueCharge("pending", "2026-11-01")] });
      vi.setSystemTime(new Date("2026-11-01T04:30:00Z"));
      expect(await processAutopayCharges(createSupabaseMock(config))).toEqual({
        processed: 0, succeeded: 0, failed: 0, skipped: 0
      });
      expect(createOffSessionPaymentIntentMock).not.toHaveBeenCalled();
      vi.setSystemTime(new Date("2026-11-01T12:00:00Z"));
      expect(await processAutopayCharges(createSupabaseMock(config))).toEqual({
        processed: 1, succeeded: 1, failed: 0, skipped: 0
      });
      expect(createOffSessionPaymentIntentMock).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });

  it("does not select rent paid early when its due date arrives", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-05-02T12:00:00Z"));
    try {
      const config = buildAutopayConfig({ charges: [{ id: "paid-early", lease_id: "lease-1",
        due_date: "2026-05-02", amount_cents: 125000, status: "paid", category: "rent", deleted_at: null }] });
      const result = await processAutopayCharges(createSupabaseMock(config));
      expect(result.processed).toBe(0);
      expect(createOffSessionPaymentIntentMock).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    getOwnerStripeAccountForPropertyMock.mockResolvedValue("acct_1");
    assertStripeEligiblePropertyMock.mockResolvedValue(undefined);
    createOffSessionPaymentIntentMock.mockResolvedValue({ id: "pi_1", status: "succeeded" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("skips an unclaimed client home before calling Stripe", async () => {
    const { StripeNotEligibleError } = await import("@/lib/client-accounts");
    assertStripeEligiblePropertyMock.mockRejectedValue(new StripeNotEligibleError());
    const result = await processAutopayCharges(createSupabaseMock(buildAutopayConfig()));
    expect(result.skipped).toBe(1);
    expect(createOffSessionPaymentIntentMock).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith("[autopay] skipped client home", "property-1");
  });

  it.each(["stripe", "legacy"])("keeps a reversed %s payment from automatic retry", async (source) => {
    const supabase = createSupabaseMock(buildAutopayConfig({ payments: [paymentRow(source, "2026-05-02")] }));
    const result = await processAutopayCharges(supabase);
    expect(result.processed).toBe(0);
    expect(createOffSessionPaymentIntentMock).not.toHaveBeenCalled();
    expect(paymentInMock).toHaveBeenCalledWith("rent_charge_id", ["charge-1"]);
  });

  it("does not charge when an active payment exists", async () => {
    const result = await processAutopayCharges(createSupabaseMock(buildAutopayConfig({
      payments: [paymentRow("manual", null)] })));
    expect(result.processed).toBe(0);
    expect(createOffSessionPaymentIntentMock).not.toHaveBeenCalled();
  });

  it("allows an eligible charge after its only manual payment was reversed", async () => {
    const result = await processAutopayCharges(createSupabaseMock(buildAutopayConfig({
      payments: [paymentRow("manual", "2026-05-02")] })));
    expect(result.succeeded).toBe(1);
    expect(createOffSessionPaymentIntentMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["paid", { charges: [dueCharge("paid")] }],
    ["waived", { charges: [dueCharge("waived")] }],
    ["unenrolled", { enrollments: [] }],
    ["not due", { charges: [dueCharge("pending", "2099-05-01")] }]
  ])("does not force a %s charge after a manual reversal", async (_reason, override) => {
    const config = buildAutopayConfig({ ...override, payments: [paymentRow("manual", "2026-05-02")] });
    const result = await processAutopayCharges(createSupabaseMock(config));
    expect(result.processed).toBe(0);
    expect(createOffSessionPaymentIntentMock).not.toHaveBeenCalled();
  });

  it("never starts autopay when the scoped payment lookup fails", async () => {
    await expect(processAutopayCharges(createSupabaseMock(buildAutopayConfig({
      paymentLookupError: true
    })))).rejects.toBeTruthy();
    expect(createOffSessionPaymentIntentMock).not.toHaveBeenCalled();
  });

  it("reads another payment page before deciding a charge can retry", async () => {
    const payments = Array.from({ length: 500 }, (_, i) => ({
      id: `a-${String(i).padStart(3, "0")}`, rent_charge_id: "charge-1",
      reversed_at: "2026-05-02", recorded_via: "manual"
    }));
    payments.push({ id: "z-blocker", rent_charge_id: "charge-1",
      reversed_at: "2026-05-02", recorded_via: "stripe" });
    const result = await processAutopayCharges(createSupabaseMock(buildAutopayConfig({ payments })));
    expect(result.processed).toBe(0);
    expect(createOffSessionPaymentIntentMock).not.toHaveBeenCalled();
  });

  it("skips a paid charge during the re-check and continues to later due charges", async () => {
    const supabase = createSupabaseMock(
      buildAutopayConfig({
        charges: [
          dueCharge("pending"),
          { ...dueCharge("late", "2026-05-02"), id: "charge-2", amount_cents: 135000 }
        ],
        recheckByChargeId: {
          "charge-1": { status: "paid", deleted_at: null },
          "charge-2": { status: "late", deleted_at: null }
        }
      })
    );

    const result = await processAutopayCharges(supabase);

    expect(result).toEqual({ processed: 1, succeeded: 1, failed: 0, skipped: 1 });
    expect(createOffSessionPaymentIntentMock).toHaveBeenCalledTimes(1);
    expect(createOffSessionPaymentIntentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 135000,
        metadata: expect.objectContaining({ charge_id: "charge-2" })
      })
    );
  });

  it("skips a charge deleted after the initial due-charge fetch", async () => {
    const supabase = createSupabaseMock(
      buildAutopayConfig({
        recheckByChargeId: {
          "charge-1": {
            status: "pending",
            deleted_at: "2026-05-03T12:00:00.000Z"
          }
        }
      })
    );

    const result = await processAutopayCharges(supabase);

    expect(result).toEqual({ processed: 0, succeeded: 0, failed: 0, skipped: 1 });
    expect(createOffSessionPaymentIntentMock).not.toHaveBeenCalled();
  });

  it("excludes already soft-deleted charges from the due-charge query", async () => {
    const supabase = createSupabaseMock(
      buildAutopayConfig({
        charges: [
          { ...dueCharge("pending"), id: "charge-deleted", deleted_at: "2026-05-01T00:00:00.000Z" },
          { ...dueCharge("pending", "2026-05-02"), id: "charge-active", amount_cents: 135000 }
        ],
        recheckByChargeId: {
          "charge-deleted": {
            status: "pending",
            deleted_at: "2026-05-01T00:00:00.000Z"
          },
          "charge-active": { status: "pending", deleted_at: null }
        }
      })
    );

    const result = await processAutopayCharges(supabase);

    expect(result).toEqual({ processed: 1, succeeded: 1, failed: 0, skipped: 0 });
    expect(createOffSessionPaymentIntentMock).toHaveBeenCalledTimes(1);
    expect(createOffSessionPaymentIntentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ charge_id: "charge-active" })
      })
    );
  });

  it("does not process charges for inactive leases", async () => {
    const supabase = createSupabaseMock(
      buildAutopayConfig({
        leases: [{ id: "lease-1", unit_id: "unit-1", active: false }]
      })
    );

    const result = await processAutopayCharges(supabase);

    expect(result).toEqual({ processed: 0, succeeded: 0, failed: 0, skipped: 0 });
    expect(getOwnerStripeAccountForPropertyMock).not.toHaveBeenCalled();
    expect(createOffSessionPaymentIntentMock).not.toHaveBeenCalled();
  });
});
