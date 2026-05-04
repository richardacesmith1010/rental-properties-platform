import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.hoisted(() => vi.fn());
const generateMonthlyChargesForPropertyIdsWithClientMock = vi.hoisted(() => vi.fn());
const getAdministeredPropertyIdsMock = vi.hoisted(() => vi.fn());
const getOwnerStripeAccountForPropertyMock = vi.hoisted(() => vi.fn());
const createOffSessionPaymentIntentMock = vi.hoisted(() => vi.fn());

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
          select: vi.fn(async () => ({
            data: config.payments ?? [],
            error: null
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

describe("processAutopayCharges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    getOwnerStripeAccountForPropertyMock.mockResolvedValue("acct_1");
    createOffSessionPaymentIntentMock.mockResolvedValue({ id: "pi_1", status: "succeeded" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("skips a paid charge during the re-check and continues to later due charges", async () => {
    const supabase = createSupabaseMock(
      buildAutopayConfig({
        charges: [
          {
            id: "charge-1",
            lease_id: "lease-1",
            due_date: "2026-05-01",
            amount_cents: 125000,
            status: "pending",
            category: "rent",
            deleted_at: null
          },
          {
            id: "charge-2",
            lease_id: "lease-1",
            due_date: "2026-05-02",
            amount_cents: 135000,
            status: "late",
            category: "rent",
            deleted_at: null
          }
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
          {
            id: "charge-deleted",
            lease_id: "lease-1",
            due_date: "2026-05-01",
            amount_cents: 125000,
            status: "pending",
            category: "rent",
            deleted_at: "2026-05-01T00:00:00.000Z"
          },
          {
            id: "charge-active",
            lease_id: "lease-1",
            due_date: "2026-05-02",
            amount_cents: 135000,
            status: "pending",
            category: "rent",
            deleted_at: null
          }
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
