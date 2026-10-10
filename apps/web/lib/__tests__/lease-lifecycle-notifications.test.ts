import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createNotificationMock = vi.hoisted(() => vi.fn());
const notifyTeamMock = vi.hoisted(() => vi.fn());
const propertyPreferencesMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/notifications", () => ({
  createNotificationWithDelivery: createNotificationMock,
  notifyPropertyTeam: notifyTeamMock
}));
vi.mock("@/lib/notification-preferences", () => ({
  getPropertyNotificationDeliveryPreferences: propertyPreferencesMock
}));

import { sendLeaseExpirationWarnings } from "@/lib/lease-lifecycle";

describe("lease lifecycle notification switch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-03T12:00:00.000Z"));
    createNotificationMock.mockResolvedValue(undefined);
    notifyTeamMock.mockResolvedValue(undefined);
    propertyPreferencesMock.mockResolvedValue(new Map());
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("returns before querying for expiration warnings when notifications are off", async () => {
    vi.stubEnv("DOMUS_NOTIFICATIONS_ENABLED", "false");
    const supabase = { from: vi.fn() } as unknown as SupabaseClient;
    await expect(sendLeaseExpirationWarnings(supabase)).resolves.toContain("Notifications off");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("sends the new team warning even when the tenant was already warned", async () => {
    vi.stubEnv("DOMUS_NOTIFICATIONS_ENABLED", "true");
    const from = vi.fn((table: string) => {
      if (table === "leases") return {
        select: () => ({ eq: () => ({ gte: () => ({ lte: async () => ({
          data: [{
            id: "lease-1", unit_id: "unit-1", tenant_profile_id: "tenant-1",
            end_date: "2026-05-20", lease_status: "active", active: true
          }], error: null
        }) }) }) })
      };
      if (table === "notifications") return {
        select: () => ({ eq: () => ({ eq: () => ({ in: () => ({ gte: async () => ({
          data: [{ entity_id: "lease-1", recipient_profile_id: "tenant-1" }], error: null
        }) }) }) }) })
      };
      const rows = table === "units"
        ? [{ id: "unit-1", property_id: "property-1", unit_number: "101" }]
        : table === "properties"
          ? [{ id: "property-1", name: "Domus Heights" }]
          : [{ id: "tenant-1", email: "tenant@example.com" }];
      return { select: () => ({ in: async () => ({ data: rows, error: null }) }) };
    });
    const supabase = { from } as unknown as SupabaseClient;
    expect(await sendLeaseExpirationWarnings(supabase)).toBe("Expiration warnings sent: 0.");
    expect(createNotificationMock).not.toHaveBeenCalled();
    expect(notifyTeamMock).toHaveBeenCalledWith(expect.objectContaining({
      event: "lease_ending_soon", propertyId: "property-1"
    }));
  });
});
