import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePathMock = vi.hoisted(() => vi.fn());
const createAdminClientMock = vi.hoisted(() => vi.fn());
const createNotificationWithDeliveryMock = vi.hoisted(() => vi.fn());
const canUserAdministerPropertyMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn());
const parseFormDataMock = vi.hoisted(() => vi.fn());
const requireAuthMock = vi.hoisted(() => vi.fn());
const ensureCapabilityEnabledMock = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: createAdminClientMock }));
vi.mock("@/lib/notifications", () => ({
  createNotificationWithDelivery: createNotificationWithDeliveryMock
}));
vi.mock("@/lib/property-access", () => ({
  canUserAdministerProperty: canUserAdministerPropertyMock
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: checkRateLimitMock }));
vi.mock("@/lib/validations", () => ({
  createInboxThreadSchema: {},
  sendInboxMessageSchema: {},
  sendMessageToTenantSchema: {},
  requestManualPaymentConfirmationSchema: {},
  parseFormData: parseFormDataMock
}));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: requireAuthMock }));
vi.mock("@/app/actions/shared", () => ({
  ensureCapabilityEnabled: ensureCapabilityEnabledMock
}));

import { sendMessageToTenant } from "@/app/actions/inbox";

function createInboxAdminClient(): SupabaseClient {
  const from = vi.fn((table: string) => {
    if (table === "units") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() =>
            Promise.resolve({
              data: [{ id: "unit-1", unit_number: "1A" }],
              error: null
            })
          )
        }))
      };
    }

    if (table === "leases") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: "lease-1", unit_id: "unit-1" },
                    error: null
                  })
                }))
              }))
            }))
          }))
        }))
      };
    }

    if (table === "properties") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { name: "Atlas House", owner_account_id: "account-1" },
              error: null
            })
          }))
        }))
      };
    }

    if (table === "profiles") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn((_column: string, value: string) => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data:
                value === "tenant-1"
                  ? { full_name: "Taylor Tenant", email: "tenant@example.com" }
                  : { full_name: "Ace Owner", email: "owner@example.com" },
              error: null
            })
          }))
        }))
      };
    }

    if (table === "inbox_threads") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
                  }))
                }))
              }))
            }))
          }))
        })),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: { id: "thread-1" }, error: null })
          }))
        })),
        update: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ error: null })
        }))
      };
    }

    if (table === "inbox_messages") {
      return {
        insert: vi.fn().mockResolvedValue({ error: null })
      };
    }

    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
        }))
      }))
    };
  });

  return { from } as unknown as SupabaseClient;
}

describe("inbox actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimitMock.mockReturnValue({ allowed: true, remaining: 10 });
    ensureCapabilityEnabledMock.mockResolvedValue(null);
    requireAuthMock.mockResolvedValue({
      user: { id: "owner-1", email: "owner@example.com" },
      role: "owner",
      supabase: {} as SupabaseClient
    });
  });

  it("rejects unauthorized senders for direct tenant messages", async () => {
    parseFormDataMock.mockReturnValue({
      success: true,
      data: {
        recipientProfileId: "tenant-1",
        propertyId: "property-1",
        subject: "Rent reminder",
        body: "Rent is due tomorrow."
      }
    });
    canUserAdministerPropertyMock.mockResolvedValue(false);

    const result = await sendMessageToTenant(null, new FormData());

    expect(result).toEqual({
      success: false,
      error: "You do not have access to this tenant."
    });
  });

  it("creates an inbox thread and delivery notification for a valid direct tenant message", async () => {
    parseFormDataMock.mockReturnValue({
      success: true,
      data: {
        recipientProfileId: "tenant-1",
        propertyId: "property-1",
        subject: "Rent reminder",
        body: "Rent is due tomorrow."
      }
    });
    canUserAdministerPropertyMock.mockResolvedValue(true);
    createAdminClientMock.mockReturnValue(createInboxAdminClient());

    const result = await sendMessageToTenant(null, new FormData());

    expect(result).toEqual({ success: true, message: "Message sent." });
    expect(createNotificationWithDeliveryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientProfileId: "tenant-1",
        type: "owner_message",
        entityType: "inbox_thread"
      })
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/tenant");
  });
});
