import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePathMock = vi.hoisted(() => vi.fn());
const createAdminClientMock = vi.hoisted(() => vi.fn());
const getFeatureCapabilitiesMock = vi.hoisted(() => vi.fn());
const canUserAdministerPropertyMock = vi.hoisted(() => vi.fn());
const canUserAdministerOwnershipAccountMock = vi.hoisted(() => vi.fn());
const getOrCreateIndividualOwnershipAccountMock = vi.hoisted(() => vi.fn());
const logAuditMock = vi.hoisted(() => vi.fn());
const awardXpMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn());
const parseFormDataMock = vi.hoisted(() => vi.fn());
const requireAuthMock = vi.hoisted(() => vi.fn());
const isMissingSchemaErrorMock = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: createAdminClientMock }));
vi.mock("@/lib/feature-capabilities", () => ({ getFeatureCapabilities: getFeatureCapabilitiesMock }));
vi.mock("@/lib/property-access", () => ({ canUserAdministerProperty: canUserAdministerPropertyMock }));
vi.mock("@/lib/ownership", () => ({
  canUserAdministerOwnershipAccount: canUserAdministerOwnershipAccountMock,
  getOrCreateIndividualOwnershipAccount: getOrCreateIndividualOwnershipAccountMock
}));
vi.mock("@/lib/audit", () => ({ logAudit: logAuditMock }));
vi.mock("@/lib/gamification", () => ({
  awardXp: awardXpMock,
  XP_VALUES: { property_added: 25 }
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: checkRateLimitMock }));
vi.mock("@/lib/validations", () => ({
  createPropertySchema: {},
  updatePropertySchema: {},
  deletePropertySchema: {},
  parseFormData: parseFormDataMock
}));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: requireAuthMock }));
vi.mock("@/app/actions/shared", () => ({
  isMissingSchemaError: isMissingSchemaErrorMock,
  ActionState: null
}));

import { createProperty, deleteProperty, updateProperty } from "@/app/actions/properties";

interface PropertiesAdminConfig {
  propertyId?: string;
  insertError?: { message: string } | null;
  managerAssignmentError?: { message: string } | null;
  updateError?: { message: string } | null;
  units?: Array<{ id: string }>;
  activeLease?: { id: string } | null;
}

function createPropertiesAdminClient(config: PropertiesAdminConfig): SupabaseClient {
  return {
    from: vi.fn((table: string) => {
      if (table === "properties") {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: config.propertyId ? { id: config.propertyId } : null, error: config.insertError ?? null })
            }))
          })),
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: config.updateError ?? null })
          }))
        };
      }

      if (table === "property_managers") {
        return {
          upsert: vi.fn().mockResolvedValue({ error: config.managerAssignmentError ?? null })
        };
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn(() => ({
              eq: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: config.activeLease ?? null, error: null })
                }))
              }))
            })),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
          }))
        }))
      };
    })
  } as unknown as SupabaseClient;
}

function createManagedSupabase(config: PropertiesAdminConfig): SupabaseClient {
  return {
    from: vi.fn((table: string) => {
      if (table === "properties") {
        return {
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: config.updateError ?? null })
          }))
        };
      }

      if (table === "units") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ data: config.units ?? [], error: null })
          }))
        };
      }

      if (table === "leases") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => ({
              eq: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: config.activeLease ?? null, error: null })
                }))
              }))
            }))
          }))
        };
      }

      return {
        select: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }))
      };
    })
  } as unknown as SupabaseClient;
}

describe("properties actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimitMock.mockReturnValue({ allowed: true, remaining: 10 });
    getFeatureCapabilitiesMock.mockResolvedValue({ ownershipEnabled: true });
    getOrCreateIndividualOwnershipAccountMock.mockResolvedValue("account-1");
    canUserAdministerOwnershipAccountMock.mockResolvedValue(true);
    canUserAdministerPropertyMock.mockResolvedValue(true);
    requireAuthMock.mockResolvedValue({
      user: { id: "user-1", email: "owner@example.com" },
      role: "owner",
      supabase: createManagedSupabase({ propertyId: "property-1" })
    });
    createAdminClientMock.mockReturnValue(createPropertiesAdminClient({ propertyId: "property-1" }));
    logAuditMock.mockResolvedValue(undefined);
    awardXpMock.mockResolvedValue(undefined);
    isMissingSchemaErrorMock.mockResolvedValue(false);
  });

  it("returns a validation error for an empty property name", async () => {
    parseFormDataMock.mockReturnValueOnce({ success: false, error: "Property name is required." });

    const result = await createProperty(null, new FormData());

    expect(result).toEqual({ success: false, error: "Property name is required." });
  });

  it("rate limits property creation", async () => {
    checkRateLimitMock.mockReturnValueOnce({ allowed: false, remaining: 0 });

    const result = await createProperty(null, new FormData());

    expect(result).toEqual({ success: false, error: "Too many requests. Please try again later." });
  });

  it("creates a property successfully for an owner", async () => {
    parseFormDataMock.mockReturnValueOnce({
      success: true,
      data: {
        name: "Atlas House",
        addressLine1: "123 Forum Ave",
        city: "Denver",
        state: "CO",
        postalCode: "80202",
        ownerAccountId: ""
      }
    });

    const result = await createProperty(null, new FormData());

    expect(result).toEqual({ success: true, propertyId: "property-1" });
    expect(getOrCreateIndividualOwnershipAccountMock).toHaveBeenCalledWith("user-1");
  });

  it("creates a manager assignment when a manager creates a property", async () => {
    parseFormDataMock.mockReturnValueOnce({
      success: true,
      data: {
        name: "Atlas House",
        addressLine1: "123 Forum Ave",
        city: "Denver",
        state: "CO",
        postalCode: "80202",
        ownerAccountId: ""
      }
    });
    requireAuthMock.mockResolvedValueOnce({
      user: { id: "manager-1", email: "manager@example.com" },
      role: "manager",
      supabase: createManagedSupabase({ propertyId: "property-1" })
    });
    const managerAdmin = createPropertiesAdminClient({ propertyId: "property-1" });
    createAdminClientMock.mockReturnValue(managerAdmin);

    await createProperty(null, new FormData());

    expect(managerAdmin.from).toHaveBeenCalledWith("property_managers");
  });

  it("returns an access error when updateProperty is unauthorized", async () => {
    parseFormDataMock.mockReturnValueOnce({
      success: true,
      data: {
        propertyId: "property-1",
        name: "Atlas House",
        addressLine1: "123 Forum Ave",
        city: "Denver",
        state: "CO",
        postalCode: "80202"
      }
    });
    canUserAdministerPropertyMock.mockResolvedValueOnce(false);

    const result = await updateProperty(null, new FormData());

    expect(result).toEqual({ success: false, error: "You do not have access to this property." });
  });

  it("blocks deleting a property with active leases", async () => {
    parseFormDataMock.mockReturnValueOnce({ success: true, data: { propertyId: "property-1" } });
    requireAuthMock.mockResolvedValueOnce({
      user: { id: "user-1", email: "owner@example.com" },
      role: "owner",
      supabase: createManagedSupabase({
        units: [{ id: "unit-1" }],
        activeLease: { id: "lease-1" }
      })
    });

    const result = await deleteProperty(null, new FormData());

    expect(result).toEqual({
      success: false,
      error: "Cannot archive a property with active leases. Archive leases first."
    });
  });

  it("archives a property successfully when it has no active leases", async () => {
    parseFormDataMock.mockReturnValueOnce({ success: true, data: { propertyId: "property-1" } });
    requireAuthMock.mockResolvedValueOnce({
      user: { id: "user-1", email: "owner@example.com" },
      role: "owner",
      supabase: createManagedSupabase({ units: [], activeLease: null })
    });

    const result = await deleteProperty(null, new FormData());

    expect(result).toEqual({ success: true });
    expect(revalidatePathMock).toHaveBeenCalledWith("/owner");
  });
});
