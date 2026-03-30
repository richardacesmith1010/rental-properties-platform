import { beforeEach, describe, expect, it, vi } from "vitest";

const createAdminClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: createAdminClientMock }));
vi.mock("@/lib/supabase-errors", () => ({
  isMissingSchemaError: (error: { code?: string } | null) =>
    error?.code === "42P01" || error?.code === "42703" || error?.code === "PGRST205"
}));

import {
  calculateCardFee,
  formatCentsAsDollars,
  getManagerFeeForProperty
} from "@/lib/payment-fees";

function createFeeAdminClient(params: {
  config?: Record<string, unknown> | null;
  configError?: { code?: string; message?: string } | null;
  property?: { management_fee_cents?: number | null } | null;
}) {
  return {
    from: vi.fn((table: string) => {
      if (table === "manager_payment_configs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: params.config ?? null,
                      error: params.configError ?? null
                    })
                  }))
                }))
              }))
            }))
          }))
        };
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: params.property ?? null,
              error: null
            })
          }))
        }))
      };
    })
  };
}

describe("payment fees", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calculates the card fee using the fee-on-fee formula", () => {
    expect(calculateCardFee(235000)).toEqual({
      baseCents: 235000,
      feeCents: 7050,
      totalCents: 242050
    });
  });

  it("returns the base amount and fee for smaller charges", () => {
    expect(calculateCardFee(10000)).toEqual({
      baseCents: 10000,
      feeCents: 330,
      totalCents: 10330
    });
  });

  it("formats cents as dollars", () => {
    expect(formatCentsAsDollars(242050)).toBe("$2,420.50");
  });

  it("reads the active manager fee from manager_payment_configs first", async () => {
    createAdminClientMock.mockReturnValue(
      createFeeAdminClient({
        config: {
          manager_profile_id: "manager-1",
          payment_type: "percentage",
          percentage_rate: 9,
          flat_amount_cents: null,
          base_rent_cents: 235000
        }
      })
    );

    await expect(getManagerFeeForProperty("property-1", 240000)).resolves.toEqual({
      feeCents: 21150,
      managerProfileId: "manager-1"
    });
  });

  it("falls back to properties.management_fee_cents when config is unavailable", async () => {
    createAdminClientMock.mockReturnValue(
      createFeeAdminClient({
        config: null,
        configError: { code: "42P01", message: "relation does not exist" },
        property: { management_fee_cents: 5000 }
      })
    );

    await expect(getManagerFeeForProperty("property-1", 240000)).resolves.toEqual({
      feeCents: 5000,
      managerProfileId: null
    });
  });
});
