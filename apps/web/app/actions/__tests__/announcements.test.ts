import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePathMock = vi.hoisted(() => vi.fn());
const createAdminClientMock = vi.hoisted(() => vi.fn());
const createNotificationWithDeliveryMock = vi.hoisted(() => vi.fn());
const getAdministeredPropertyIdsMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn());
const requireAuthMock = vi.hoisted(() => vi.fn());
const ensureCapabilityEnabledMock = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: createAdminClientMock }));
vi.mock("@/lib/notifications", () => ({
  createNotificationWithDelivery: createNotificationWithDeliveryMock
}));
vi.mock("@/lib/property-access", () => ({
  getAdministeredPropertyIds: getAdministeredPropertyIdsMock
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: checkRateLimitMock }));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: requireAuthMock }));
vi.mock("@/app/actions/shared", () => ({
  ensureCapabilityEnabled: ensureCapabilityEnabledMock
}));

import {
  createAnnouncement,
  getEstimatedRecipientCount
} from "@/app/actions/announcements";

const PROPERTY_1_ID = "550e8400-e29b-41d4-a716-446655440001";
const PROPERTY_2_ID = "550e8400-e29b-41d4-a716-446655440002";
const PROPERTY_3_ID = "550e8400-e29b-41d4-a716-446655440003";

interface AnnouncementAdminConfig {
  units?: Array<{ id: string }>;
  leases?: Array<{ tenant_profile_id: string | null }>;
  insertError?: { code?: string; message: string } | null;
  announcementId?: string;
  tenantProfiles?: Array<{ id: string; email: string | null; role: string | null }>;
}

function createAnnouncementAdminClient(config: AnnouncementAdminConfig): SupabaseClient {
  const from = vi.fn((table: string) => {
    if (table === "units") {
      return {
        select: vi.fn(() => ({
          in: vi.fn().mockResolvedValue({
            data: config.units ?? [],
            error: null
          })
        }))
      };
    }

    if (table === "leases") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn().mockResolvedValue({
              data: config.leases ?? [],
              error: null
            })
          }))
        }))
      };
    }

    if (table === "announcements") {
      return {
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: config.insertError ? null : { id: config.announcementId ?? "announcement-1" },
              error: config.insertError ?? null
            })
          }))
        }))
      };
    }

    if (table === "profiles") {
      return {
        select: vi.fn(() => ({
          in: vi.fn().mockResolvedValue({
            data: config.tenantProfiles ?? [],
            error: null
          })
        }))
      };
    }

    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          in: vi.fn().mockResolvedValue({ data: [], error: null })
        })),
        in: vi.fn().mockResolvedValue({ data: [], error: null })
      }))
    };
  });

  return { from } as unknown as SupabaseClient;
}

describe("announcement actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    checkRateLimitMock.mockReturnValue({ allowed: true, remaining: 9 });
    requireAuthMock.mockResolvedValue({
      user: { id: "owner-1", email: "owner@example.com" },
      role: "owner",
      supabase: {} as SupabaseClient
    });
    ensureCapabilityEnabledMock.mockResolvedValue(null);
    getAdministeredPropertyIdsMock.mockResolvedValue([PROPERTY_1_ID, PROPERTY_2_ID]);
    createNotificationWithDeliveryMock.mockResolvedValue(undefined);
    createAdminClientMock.mockReturnValue(
      createAnnouncementAdminClient({
        units: [{ id: "unit-1" }, { id: "unit-2" }],
        leases: [
          { tenant_profile_id: "tenant-1" },
          { tenant_profile_id: "tenant-2" },
          { tenant_profile_id: "tenant-1" }
        ],
        tenantProfiles: [
          { id: "tenant-1", email: "tenant1@example.com", role: "tenant" },
          { id: "tenant-2", email: "tenant2@example.com", role: "tenant" }
        ]
      })
    );
  });

  it("returns a deduplicated recipient count for verified properties", async () => {
    const result = await getEstimatedRecipientCount("specific_properties", [
      PROPERTY_1_ID,
      PROPERTY_2_ID,
      PROPERTY_2_ID
    ]);

    expect(result).toBe(2);
    expect(getAdministeredPropertyIdsMock).toHaveBeenCalledWith(
      "owner-1",
      expect.objectContaining({ from: expect.any(Function) })
    );
  });

  it("returns zero recipient count when the request includes an unauthorized property", async () => {
    const result = await getEstimatedRecipientCount("specific_properties", [PROPERTY_3_ID]);

    expect(result).toBe(0);
  });

  it("fans out an announcement to unique tenants with aligned notification constants", async () => {
    const formData = new FormData();
    formData.set("scope", "specific_properties");
    formData.append("propertyIds", PROPERTY_2_ID);
    formData.append("propertyIds", PROPERTY_2_ID);
    formData.append("propertyIds", PROPERTY_1_ID);
    formData.set("title", "Boil water advisory");
    formData.set("body", "Please boil tap water until further notice.");

    const result = await createAnnouncement(null, formData);

    expect(result).toEqual({
      success: true,
      message: "Announcement sent to 2 tenants."
    });
    expect(createNotificationWithDeliveryMock).toHaveBeenCalledTimes(2);
    expect(createNotificationWithDeliveryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "announcement",
        entityType: "announcement",
        entityId: "announcement-1"
      })
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/tenant");
  });

  it("rejects selected properties outside the caller's administered scope", async () => {
    const formData = new FormData();
    formData.set("scope", "specific_properties");
    formData.append("propertyIds", PROPERTY_3_ID);
    formData.set("title", "Entry notice");
    formData.set("body", "Pest control will enter units on Tuesday.");

    const result = await createAnnouncement(null, formData);

    expect(result).toEqual({
      success: false,
      error: "You don't have permission to message all selected properties."
    });
    expect(createNotificationWithDeliveryMock).not.toHaveBeenCalled();
  });

  it("treats a dedupe unique violation as a no-op success", async () => {
    createAdminClientMock.mockReturnValue(
      createAnnouncementAdminClient({
        units: [{ id: "unit-1" }],
        leases: [{ tenant_profile_id: "tenant-1" }],
        insertError: { code: "23505", message: "duplicate key value violates unique constraint" }
      })
    );

    const formData = new FormData();
    formData.set("scope", "all_administered");
    formData.set("title", "Boil water advisory");
    formData.set("body", "Please boil tap water until further notice.");

    const result = await createAnnouncement(null, formData);

    expect(result).toEqual({
      success: true,
      message: "This announcement was already sent."
    });
    expect(createNotificationWithDeliveryMock).not.toHaveBeenCalled();
  });
});
