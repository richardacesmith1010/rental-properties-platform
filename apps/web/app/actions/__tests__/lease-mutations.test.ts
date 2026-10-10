import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const revalidatePathMock = vi.hoisted(() => vi.fn());
const requireAuthMock = vi.hoisted(() => vi.fn());
const canUserAdministerPropertyMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn());
const createAdminClientMock = vi.hoisted(() => vi.fn());
const logAuditMock = vi.hoisted(() => vi.fn());
const notificationMock = vi.hoisted(() => vi.fn());
const ownerNotificationMock = vi.hoisted(() => vi.fn());
const isUnclaimedClientPropertyMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/client-accounts", () => ({ isUnclaimedClientProperty: isUnclaimedClientPropertyMock }));

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: requireAuthMock }));
vi.mock("@/lib/property-access", () => ({
  canUserAdministerProperty: canUserAdministerPropertyMock
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: checkRateLimitMock }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: createAdminClientMock }));
vi.mock("@/lib/audit", () => ({ logAudit: logAuditMock }));
vi.mock("@/lib/logger", () => ({ sideEffectError: () => () => undefined }));
vi.mock("@/lib/notifications", () => ({
  createNotificationWithDelivery: notificationMock,
  notifyPropertyTeam: ownerNotificationMock
}));
vi.mock("@/lib/supabase-errors", () => ({ isMissingSchemaError: () => false }));

import { createLease, updateLease } from "@/app/actions/lease-mutations";

function leaseFormData() {
  const formData = new FormData();
  formData.set("unitId", "11111111-1111-4111-8111-111111111111");
  formData.set("tenantProfileId", "22222222-2222-4222-8222-222222222222");
  formData.set("leaseId", "33333333-3333-4333-8333-333333333333");
  formData.set("startDate", "2026-11-01");
  formData.set("endDate", "2027-10-31");
  formData.set("dueDayOfMonth", "1");
  formData.set("monthlyRentDollars", "2350");
  formData.set("depositDollars", "2350");
  formData.set("gracePeriodDays", "5");
  formData.set("lateFeeDollars", "0");
  return formData;
}

function createSupabaseMock() {
  const leaseInsertMock = vi.fn((_payload: Record<string, unknown>) => ({
    select: vi.fn(() => ({
      single: vi.fn().mockResolvedValue({
        data: { id: "33333333-3333-4333-8333-333333333333" },
        error: null
      })
    }))
  }));
  const leaseUpdateMock = vi.fn(() => ({
    eq: vi.fn().mockResolvedValue({ error: null })
  }));
  const client = {
    from: vi.fn((table: string) => {
      if (table === "units") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((column: string) =>
              column === "id"
                ? {
                    single: vi.fn().mockResolvedValue({
                      data: {
                        id: "11111111-1111-4111-8111-111111111111",
                        property_id: "44444444-4444-4444-8444-444444444444"
                      },
                      error: null
                    })
                  }
                : Promise.resolve({
                    data: [{ id: "11111111-1111-4111-8111-111111111111" }],
                    error: null
                  })
            )
          })),
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null })
          }))
        };
      }

      if (table === "leases") {
        return {
          select: vi.fn((columns: string) => {
            if (columns === "id") {
              const builder = {
                eq: vi.fn(() => builder),
                in: vi.fn(() => builder),
                limit: vi.fn(async () => ({ data: [{ id: "existing-lease" }], error: null }))
              };
              return builder;
            }
            return {
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: "33333333-3333-4333-8333-333333333333",
                    unit_id: "11111111-1111-4111-8111-111111111111",
                    tenant_profile_id: "22222222-2222-4222-8222-222222222222"
                  },
                  error: null
                })
              }))
            };
          }),
          insert: leaseInsertMock,
          update: leaseUpdateMock
        };
      }

      throw new Error(`Unexpected table ${table}`);
    })
  };

  return {
    client: client as unknown as SupabaseClient,
    leaseInsertMock,
    leaseUpdateMock
  };
}

describe("lease collection setting mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isUnclaimedClientPropertyMock.mockResolvedValue(false);
    checkRateLimitMock.mockReturnValue({ allowed: true });
    canUserAdministerPropertyMock.mockResolvedValue(true);
    notificationMock.mockResolvedValue(undefined);
    ownerNotificationMock.mockResolvedValue(undefined);
    logAuditMock.mockResolvedValue(undefined);
    createAdminClientMock.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "profiles") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: "22222222-2222-4222-8222-222222222222",
                    email: "tenant@example.com"
                  },
                  error: null
                })
              }))
            }))
          };
        }
        return {
          select: vi.fn(() => {
            const builder = {
              eq: vi.fn(() => builder),
              in: vi.fn(() => builder),
              limit: vi.fn(async () => ({ data: [], error: null }))
            };
            return builder;
          })
        };
      })
    });
  });

  it("persists the checked setting during lease creation", async () => {
    const supabase = createSupabaseMock();
    requireAuthMock.mockResolvedValue({
      user: { id: "owner-1" },
      supabase: supabase.client
    });
    const formData = leaseFormData();
    formData.set("collectsOutsideDomus", "true");

    await expect(createLease(null, formData)).resolves.toEqual({ success: true });
    expect(supabase.leaseInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ collects_outside_domus: true })
    );
  });

  it.each([
    ["true", true],
    ["false", false]
  ])("persists full lease updates from checkbox value %s", async (raw, expected) => {
    const supabase = createSupabaseMock();
    requireAuthMock.mockResolvedValue({
      user: { id: "owner-1" },
      supabase: supabase.client
    });
    const formData = leaseFormData();
    formData.set("collectsOutsideDomus", raw);

    await expect(updateLease(null, formData)).resolves.toEqual({ success: true });
    expect(supabase.leaseUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ collects_outside_domus: expected })
    );
  });

  it("forces outside collection for client lease creation and update", async () => {
    isUnclaimedClientPropertyMock.mockResolvedValue(true);
    const supabase = createSupabaseMock();
    requireAuthMock.mockResolvedValue({ user: { id: "manager" }, supabase: supabase.client });
    const formData = leaseFormData();
    formData.set("collectsOutsideDomus", "false");
    expect(await createLease(null, formData)).toEqual({ success: true });
    expect(supabase.leaseInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ collects_outside_domus: true })
    );
    expect(await updateLease(null, formData)).toEqual({ success: true });
    expect(supabase.leaseUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ collects_outside_domus: true })
    );
  });
  it("lease edit gives the tenant an in-app notice and no owner-team recipients", async () => {
    const supabase = createSupabaseMock();
    requireAuthMock.mockResolvedValue({ user: { id: "owner-1" }, supabase: supabase.client });
    const formData = leaseFormData();
    formData.set("collectsOutsideDomus", "false");
    expect(await updateLease(null, formData)).toEqual({ success: true });
    expect(notificationMock).toHaveBeenCalledWith(expect.objectContaining({
      recipientProfileId: "22222222-2222-4222-8222-222222222222",
      type: "lease_updated",
      emailMode: "never"
    }));
    expect(ownerNotificationMock).toHaveBeenCalledWith(expect.objectContaining({
      event: "lease_changed",
      emailMode: "never"
    }));
  });

});
