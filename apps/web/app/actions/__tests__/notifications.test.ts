import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePathMock = vi.hoisted(() => vi.fn());
const createAdminClientMock = vi.hoisted(() => vi.fn());
const createNotificationWithDeliveryMock = vi.hoisted(() => vi.fn());
const logAuditMock = vi.hoisted(() => vi.fn());
const getAdministeredPropertyIdsMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn());
const requireAuthMock = vi.hoisted(() => vi.fn());
const ensureCapabilityEnabledMock = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: createAdminClientMock }));
vi.mock("@/lib/notifications", () => ({
  createNotificationWithDelivery: createNotificationWithDeliveryMock,
  markAllNotificationsReadForUser: vi.fn(),
  markNotificationReadForUser: vi.fn()
}));
vi.mock("@/lib/notification-preferences", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/notification-preferences")>()),
  updateNotificationPreference: vi.fn()
}));
vi.mock("@/lib/audit", () => ({ logAudit: logAuditMock }));
vi.mock("@/lib/logger", () => ({ sideEffectError: vi.fn(() => vi.fn()) }));
vi.mock("@/lib/property-access", () => ({
  getAdministeredPropertyIds: getAdministeredPropertyIdsMock
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: checkRateLimitMock }));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: requireAuthMock }));
vi.mock("@/app/actions/shared", () => ({
  ensureCapabilityEnabled: ensureCapabilityEnabledMock
}));

import { sendBatchPaymentReminder } from "@/app/actions/notifications";

const CHARGE_ID = "550e8400-e29b-41d4-a716-446655440001";
const LEASE_ID = "550e8400-e29b-41d4-a716-446655440002";
const UNIT_ID = "550e8400-e29b-41d4-a716-446655440003";
const PROPERTY_ID = "550e8400-e29b-41d4-a716-446655440004";
const TENANT_ID = "550e8400-e29b-41d4-a716-446655440005";

function createReminderAdminClient(): SupabaseClient {
  const rowsByTable: Record<string, unknown[]> = {
    rent_charges: [{ id: CHARGE_ID, lease_id: LEASE_ID, due_date: "2026-10-05", amount_cents: 125000 }],
    leases: [{ id: LEASE_ID, tenant_profile_id: TENANT_ID, unit_id: UNIT_ID }],
    units: [{ id: UNIT_ID, property_id: PROPERTY_ID, unit_number: "101" }],
    properties: [{ id: PROPERTY_ID, name: "Domus Heights" }],
    profiles: [{ id: TENANT_ID, email: "tenant@example.com", role: "tenant" }]
  };

  return {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        in: vi.fn().mockResolvedValue({ data: rowsByTable[table] ?? [], error: null })
      }))
    }))
  } as unknown as SupabaseClient;
}

function reminderFormData() {
  const formData = new FormData();
  formData.append("chargeIds", CHARGE_ID);
  return formData;
}

describe("notification actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DOMUS_NOTIFICATIONS_ENABLED", "true");
    checkRateLimitMock.mockReturnValue({ allowed: true });
    requireAuthMock.mockResolvedValue({ user: { id: "owner-1" } });
    ensureCapabilityEnabledMock.mockResolvedValue(null);
    getAdministeredPropertyIdsMock.mockResolvedValue([PROPERTY_ID]);
    createNotificationWithDeliveryMock.mockResolvedValue(undefined);
    logAuditMock.mockResolvedValue(undefined);
    createAdminClientMock.mockReturnValue(createReminderAdminClient());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps the existing success copy and delivery behavior when enabled", async () => {
    const result = await sendBatchPaymentReminder(null, reminderFormData());

    expect(result).toEqual({ success: true, message: "1 reminder sent." });
    expect(createNotificationWithDeliveryMock).toHaveBeenCalledTimes(1);
  });

  it("reports the switch honestly and skips delivery when disabled", async () => {
    vi.stubEnv("DOMUS_NOTIFICATIONS_ENABLED", "false");

    const result = await sendBatchPaymentReminder(null, reminderFormData());

    expect(result).toEqual({
      success: true,
      message: "Saved. Notifications are off until launch, so no one was notified."
    });
    expect(createNotificationWithDeliveryMock).not.toHaveBeenCalled();
  });
  it("shows exact test-mode copy while attempting eligible deliveries", async () => {
    vi.stubEnv("DOMUS_NOTIFICATIONS_ALLOWLIST", "tenant@example.com");
    const result = await sendBatchPaymentReminder(null, reminderFormData());
    expect(result).toEqual({ success: true, message: "Saved. Domus is in test mode. Only test accounts can get notices." });
    expect(createNotificationWithDeliveryMock).toHaveBeenCalledTimes(1);
  });

});
