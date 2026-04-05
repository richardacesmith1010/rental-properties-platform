import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePathMock = vi.hoisted(() => vi.fn());
const createAdminClientMock = vi.hoisted(() => vi.fn());
const canUserAdministerPropertyMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn());
const parseFormDataMock = vi.hoisted(() => vi.fn());
const requireAuthMock = vi.hoisted(() => vi.fn());
const isMissingSchemaErrorMock = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: createAdminClientMock }));
vi.mock("@/lib/property-access", () => ({ canUserAdministerProperty: canUserAdministerPropertyMock }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: checkRateLimitMock }));
vi.mock("@/lib/supabase-errors", () => ({ isMissingSchemaError: isMissingSchemaErrorMock }));
vi.mock("@/lib/validations", () => ({
  createTenantActivitySchema: {},
  parseFormData: parseFormDataMock
}));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: requireAuthMock }));

import { createTenantActivity, getTenantActivityLog } from "@/app/actions/tenant-activity";

function createAdminClientForLeaseFlow() {
  const insertMock = vi.fn().mockResolvedValue({ error: null });

  return {
    insertMock,
    client: {
      from: vi.fn((table: string) => {
        if (table === "leases") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: "lease-1",
                    tenant_profile_id: "tenant-from-lease",
                    unit_id: "unit-from-lease"
                  },
                  error: null
                })
              }))
            }))
          };
        }

        if (table === "units") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: "unit-from-lease",
                    property_id: "property-from-lease"
                  },
                  error: null
                })
              }))
            }))
          };
        }

        if (table === "tenant_activity_log") {
          return {
            insert: insertMock
          };
        }

        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
            }))
          }))
        };
      })
    }
  };
}

function createAdminClientForTenantPropertyMismatch() {
  return {
    client: {
      from: vi.fn((table: string) => {
        if (table === "properties") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: "property-1" },
                  error: null
                })
              }))
            }))
          };
        }

        if (table === "units") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ data: [], error: null })
            })),
          };
        }

        if (table === "leases") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                in: vi.fn(() => ({
                  order: vi.fn(() => ({
                    limit: vi.fn(() => ({
                      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
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
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
            }))
          }))
        };
      })
    }
  };
}

function createAdminClientForLogRead() {
  return {
    client: {
      from: vi.fn((table: string) => {
        if (table === "tenant_activity_log") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  order: vi.fn(() => ({
                    limit: vi.fn().mockResolvedValue({
                      data: [
                        {
                          id: "entry-1",
                          tenant_profile_id: "tenant-1",
                          property_id: "property-1",
                          unit_id: "unit-1",
                          lease_id: "lease-1",
                          activity_type: "warning",
                          title: "Late payment notice",
                          description: "Sent a written reminder.",
                          created_by: "author-1",
                          created_at: "2026-03-28T14:30:00.000Z"
                        }
                      ],
                      error: null
                    })
                  }))
                }))
              }))
            }))
          };
        }

        if (table === "profiles") {
          return {
            select: vi.fn(() => ({
              in: vi.fn().mockResolvedValue({
                data: [{ id: "author-1", full_name: "Ace Manager", email: "ace@example.com" }],
                error: null
              })
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
      })
    }
  };
}

describe("tenant activity actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimitMock.mockReturnValue({ allowed: true, remaining: 29 });
    requireAuthMock.mockResolvedValue({
      user: { id: "user-1", email: "owner@example.com" },
      role: "owner",
      supabase: {}
    });
    canUserAdministerPropertyMock.mockResolvedValue(true);
    isMissingSchemaErrorMock.mockReturnValue(false);
  });

  it("derives tenant, property, and unit from the lease instead of trusting form fields", async () => {
    const admin = createAdminClientForLeaseFlow();
    createAdminClientMock.mockReturnValue(admin.client);
    parseFormDataMock.mockReturnValue({
      success: true,
      data: {
        leaseId: "lease-1",
        tenantProfileId: "tenant-tampered",
        propertyId: "property-tampered",
        unitId: "unit-tampered",
        activityType: "warning",
        title: "Late rent notice",
        description: "Sent a notice."
      }
    });

    const result = await createTenantActivity(null, new FormData());

    expect(result).toEqual({ success: true, message: "Activity saved." });
    expect(canUserAdministerPropertyMock).toHaveBeenCalledWith("user-1", "property-from-lease");
    expect(admin.insertMock).toHaveBeenCalledWith({
      tenant_profile_id: "tenant-from-lease",
      property_id: "property-from-lease",
      unit_id: "unit-from-lease",
      lease_id: "lease-1",
      activity_type: "warning",
      title: "Late rent notice",
      description: "Sent a notice.",
      created_by: "user-1"
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/owner");
    expect(revalidatePathMock).toHaveBeenCalledWith("/manager");
  });

  it("rejects freeform entries when the tenant is not linked to the property", async () => {
    const admin = createAdminClientForTenantPropertyMismatch();
    createAdminClientMock.mockReturnValue(admin.client);
    parseFormDataMock.mockReturnValue({
      success: true,
      data: {
        tenantProfileId: "tenant-1",
        propertyId: "property-1",
        activityType: "note",
        title: "Move-in note",
        description: ""
      }
    });

    const result = await createTenantActivity(null, new FormData());

    expect(result).toEqual({
      success: false,
      error: "That tenant is not linked to this property."
    });
  });

  it("returns an empty list when the caller cannot administer the property", async () => {
    canUserAdministerPropertyMock.mockResolvedValue(false);

    const result = await getTenantActivityLog("tenant-1", "property-1");

    expect(result).toEqual([]);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it("returns property-scoped entries with author names", async () => {
    const admin = createAdminClientForLogRead();
    createAdminClientMock.mockReturnValue(admin.client);

    const result = await getTenantActivityLog("tenant-1", "property-1");

    expect(result).toEqual([
      {
        id: "entry-1",
        tenantProfileId: "tenant-1",
        propertyId: "property-1",
        unitId: "unit-1",
        leaseId: "lease-1",
        activityType: "warning",
        title: "Late payment notice",
        description: "Sent a written reminder.",
        createdAt: "2026-03-28T14:30:00.000Z",
        createdBy: "author-1",
        authorName: "Ace Manager"
      }
    ]);
  });
});
