import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePathMock = vi.hoisted(() => vi.fn());
const logAuditMock = vi.hoisted(() => vi.fn());
const getAdministeredPropertyIdsMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn());
const sideEffectErrorMock = vi.hoisted(() => vi.fn());
const createAdminClientMock = vi.hoisted(() => vi.fn());
const parseFormDataMock = vi.hoisted(() => vi.fn());
const requireAuthMock = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/audit", () => ({ logAudit: logAuditMock }));
vi.mock("@/lib/property-access", () => ({
  getAdministeredPropertyIds: getAdministeredPropertyIdsMock
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: checkRateLimitMock }));
vi.mock("@/lib/logger", () => ({
  sideEffectError: sideEffectErrorMock
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock
}));
vi.mock("@/lib/supabase-errors", () => ({
  isMissingSchemaError: () => false
}));
vi.mock("@/lib/validations", () => ({
  parseFormData: parseFormDataMock,
  updatePropertyDetailsSchema: {},
  updateUnitDetailsSchema: {},
  updateLeaseDetailsSchema: {},
  updateTenantDisplayInfoSchema: {},
  updateManagerInfoSchema: {}
}));
vi.mock("@/app/actions/auth-helpers", () => ({
  requireAuth: requireAuthMock
}));

import {
  updateLeaseDetails,
  updatePropertyDetails,
  updateUnitDetails
} from "@/app/actions/entity-updates";

function createEntityAdminClient(config: {
  property?: Record<string, unknown> | null;
  unit?: Record<string, unknown> | null;
  lease?: Record<string, unknown> | null;
}) {
  const fromMock = vi.fn((table: string) => {
    if (table === "properties") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: config.property ?? null, error: null })
          }))
        })),
        update: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ error: null })
        }))
      };
    }

    if (table === "units") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: config.unit ?? null, error: null })
          }))
        })),
        update: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ error: null })
        }))
      };
    }

    if (table === "leases") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: config.lease ?? null, error: null })
          }))
        })),
        update: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ error: null })
        }))
      };
    }

    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
        }))
      })),
      update: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null })
      }))
    };
  });

  return {
    client: { from: fromMock } as unknown as SupabaseClient,
    fromMock
  };
}

describe("entity update actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimitMock.mockReturnValue({ allowed: true, remaining: 10 });
    requireAuthMock.mockResolvedValue({
      user: { id: "user-1", email: "owner@example.com" },
      role: "owner"
    });
    logAuditMock.mockResolvedValue(undefined);
    sideEffectErrorMock.mockReturnValue(() => undefined);
  });

  it("returns property validation errors from parseFormData", async () => {
    parseFormDataMock.mockReturnValueOnce({
      success: false,
      error: "Property name is required."
    });

    const result = await updatePropertyDetails(null, new FormData());

    expect(result).toEqual({ success: false, error: "Property name is required." });
  });

  it("rejects property edits when the user cannot administer the property", async () => {
    parseFormDataMock.mockReturnValueOnce({
      success: true,
      data: { propertyId: "property-1", name: "Atlas House" }
    });
    getAdministeredPropertyIdsMock.mockResolvedValueOnce([]);
    createAdminClientMock.mockReturnValue(createEntityAdminClient({ property: null }).client);

    const result = await updatePropertyDetails(null, new FormData());

    expect(result).toEqual({
      success: false,
      error: "You do not have access to this property."
    });
  });

  it("returns unit validation errors from parseFormData", async () => {
    parseFormDataMock.mockReturnValueOnce({
      success: false,
      error: "Unit label is required."
    });

    const result = await updateUnitDetails(null, new FormData());

    expect(result).toEqual({ success: false, error: "Unit label is required." });
  });

  it("rejects lease updates when the end date is before the start date", async () => {
    parseFormDataMock.mockReturnValueOnce({
      success: true,
      data: {
        leaseId: "lease-1",
        startDate: "2026-06-01",
        endDate: "2026-05-01"
      }
    });
    getAdministeredPropertyIdsMock.mockResolvedValueOnce(["property-1"]);
    createAdminClientMock.mockReturnValue(
      createEntityAdminClient({
        lease: {
          id: "lease-1",
          unit_id: "unit-1",
          start_date: "2026-01-01",
          end_date: "2026-12-31",
          monthly_rent_cents: 180000,
          deposit_cents: 90000,
          due_day_of_month: 1,
          grace_period_days: 5,
          late_fee_cents: 5000,
          tenant_profile_id: "tenant-1",
          notes: null
        },
        unit: {
          id: "unit-1",
          property_id: "property-1",
          unit_number: "1A",
          bedrooms: 2,
          bathrooms: 1,
          monthly_rent_cents: 180000,
          square_feet: 900
        }
      }).client
    );

    const result = await updateLeaseDetails(null, new FormData());

    expect(result).toEqual({
      success: false,
      error: "End date must be after start date."
    });
  });

  it("updates the lease record without touching rent charges", async () => {
    parseFormDataMock.mockReturnValueOnce({
      success: true,
      data: {
        leaseId: "lease-1",
        startDate: "2026-02-01",
        endDate: "2026-12-31",
        monthlyRentDollars: 1950,
        notes: "Updated terms"
      }
    });
    getAdministeredPropertyIdsMock.mockResolvedValueOnce(["property-1"]);
    const admin = createEntityAdminClient({
      lease: {
        id: "lease-1",
        unit_id: "unit-1",
        start_date: "2026-01-01",
        end_date: "2026-12-31",
        monthly_rent_cents: 180000,
        deposit_cents: 90000,
        due_day_of_month: 1,
        grace_period_days: 5,
        late_fee_cents: 5000,
        tenant_profile_id: "tenant-1",
        notes: "Original"
      },
      unit: {
        id: "unit-1",
        property_id: "property-1",
        unit_number: "1A",
        bedrooms: 2,
        bathrooms: 1,
        monthly_rent_cents: 180000,
        square_feet: 900
      }
    });
    createAdminClientMock.mockReturnValue(admin.client);

    const result = await updateLeaseDetails(null, new FormData());

    expect(result).toEqual({ success: true, message: "Lease updated." });
    expect(admin.fromMock).not.toHaveBeenCalledWith("rent_charges");
    expect(revalidatePathMock).toHaveBeenCalledWith("/owner");
  });
});
