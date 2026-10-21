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
const OTHER_CHARGE_ID = "550e8400-e29b-41d4-a716-446655440006";

function createReminderAdminClient(overrides: Record<string, unknown[]> = {}): SupabaseClient {
  const rowsByTable: Record<string, unknown[]> = {
    rent_charges: [{ id: CHARGE_ID, lease_id: LEASE_ID, due_date: "2026-10-05", amount_cents: 125000 }],
    leases: [{ id: LEASE_ID, tenant_profile_id: TENANT_ID, unit_id: UNIT_ID, collects_outside_domus: false }],
    units: [{ id: UNIT_ID, property_id: PROPERTY_ID, unit_number: "101" }],
    properties: [{ id: PROPERTY_ID, name: "Domus Heights", owner_account_id: "account-1" }],
    ownership_accounts: [{ id: "account-1", managers_can_send_reminders: true, managed_client: false }],
    profiles: [{ id: TENANT_ID, email: "tenant@example.com", role: "tenant" }]
  };
  Object.assign(rowsByTable, overrides);

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
  it("N8 gives manual reminders one key per Denver calendar day", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-21T05:30:00.000Z"));
      await sendBatchPaymentReminder(null, reminderFormData());
      await sendBatchPaymentReminder(null, reminderFormData());
      vi.setSystemTime(new Date("2026-10-21T06:30:00.000Z"));
      await sendBatchPaymentReminder(null, reminderFormData());
      expect(createNotificationWithDeliveryMock.mock.calls.map(([call]) => call.emailKey)).toEqual([
        "manual-reminder-2026-10-20", "manual-reminder-2026-10-20", "manual-reminder-2026-10-21"
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DOMUS_NOTIFICATIONS_ENABLED", "true");
    checkRateLimitMock.mockReturnValue({ allowed: true });
    requireAuthMock.mockResolvedValue({ user: { id: "owner-1" }, role: "owner" });
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

  it("keeps an owner on the owner path even when the manager switch is off", async () => {
    createAdminClientMock.mockReturnValue(createReminderAdminClient({ ownership_accounts: [
      { id: "account-1", managers_can_send_reminders: false, managed_client: false }
    ] }));
    const result = await sendBatchPaymentReminder(null, reminderFormData());
    expect(result?.success).toBe(true);
    expect(createNotificationWithDeliveryMock).toHaveBeenCalledTimes(1);
    expect(logAuditMock).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ actor_role: "owner" })
    }));
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

  it("lets a manager remind each allowed charge once and audits the session role", async () => {
    requireAuthMock.mockResolvedValue({ user: { id: "manager-1" }, role: "manager" });
    const form = reminderFormData();
    form.append("chargeIds", CHARGE_ID);
    form.append("actor_role", "owner");
    const result = await sendBatchPaymentReminder(null, form);
    expect(result?.success).toBe(true);
    expect(createNotificationWithDeliveryMock).toHaveBeenCalledTimes(1);
    expect(logAuditMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: "manager-1", metadata: expect.objectContaining({ actor_role: "manager" })
    }));
    expect(revalidatePathMock).toHaveBeenCalledWith("/manager");
  });

  it("keeps manager reminders inside the notifications switch", async () => {
    requireAuthMock.mockResolvedValue({ user: { id: "manager-1" }, role: "manager" });
    vi.stubEnv("DOMUS_NOTIFICATIONS_ENABLED", "false");
    const result = await sendBatchPaymentReminder(null, reminderFormData());
    expect(result?.success).toBe(true);
    expect(createNotificationWithDeliveryMock).not.toHaveBeenCalled();
  });

  it("rejects the whole manager request if the owner switch is off", async () => {
    requireAuthMock.mockResolvedValue({ user: { id: "manager-1" }, role: "manager" });
    createAdminClientMock.mockReturnValue(createReminderAdminClient({ ownership_accounts: [
      { id: "account-1", managers_can_send_reminders: false, managed_client: false }
    ] }));
    expect(await sendBatchPaymentReminder(null, reminderFormData())).toEqual({
      success: false, error: "Your owner has not turned on reminders for this home."
    });
    expect(createNotificationWithDeliveryMock).not.toHaveBeenCalled();
    expect(logAuditMock).not.toHaveBeenCalled();
  });

  it("rejects unknown, inaccessible, and client-home manager charges before sending", async () => {
    requireAuthMock.mockResolvedValue({ user: { id: "manager-1" }, role: "manager" });
    const denied = { success: false, error: "Your owner has not turned on reminders for this home." };
    createAdminClientMock.mockReturnValue(createReminderAdminClient({ rent_charges: [] }));
    expect(await sendBatchPaymentReminder(null, reminderFormData())).toEqual(denied);
    createAdminClientMock.mockReturnValue(createReminderAdminClient());
    getAdministeredPropertyIdsMock.mockResolvedValue([]);
    expect(await sendBatchPaymentReminder(null, reminderFormData())).toEqual(denied);
    getAdministeredPropertyIdsMock.mockResolvedValue([PROPERTY_ID]);
    createAdminClientMock.mockReturnValue(createReminderAdminClient({ ownership_accounts: [
      { id: "account-1", managers_can_send_reminders: true, managed_client: true }
    ] }));
    expect(await sendBatchPaymentReminder(null, reminderFormData())).toEqual(denied);
    expect(createNotificationWithDeliveryMock).not.toHaveBeenCalled();
    expect(logAuditMock).not.toHaveBeenCalled();
  });

  it("rejects a mixed manager batch rather than silently sending its allowed charge", async () => {
    requireAuthMock.mockResolvedValue({ user: { id: "manager-1" }, role: "manager" });
    createAdminClientMock.mockReturnValue(createReminderAdminClient({
      rent_charges: [
        { id: CHARGE_ID, lease_id: LEASE_ID, due_date: "2026-10-05", amount_cents: 125000 },
        { id: OTHER_CHARGE_ID, lease_id: "lease-2", due_date: "2026-10-05", amount_cents: 125000 }
      ],
      leases: [
        { id: LEASE_ID, tenant_profile_id: TENANT_ID, unit_id: UNIT_ID, collects_outside_domus: false },
        { id: "lease-2", tenant_profile_id: TENANT_ID, unit_id: "unit-2", collects_outside_domus: false }
      ],
      units: [{ id: UNIT_ID, property_id: PROPERTY_ID, unit_number: "101" },
        { id: "unit-2", property_id: "home-2", unit_number: "102" }],
      properties: [{ id: PROPERTY_ID, name: "Allowed", owner_account_id: "account-1" },
        { id: "home-2", name: "Blocked", owner_account_id: "account-2" }],
      ownership_accounts: [{ id: "account-1", managers_can_send_reminders: true, managed_client: false },
        { id: "account-2", managers_can_send_reminders: false, managed_client: false }]
    }));
    getAdministeredPropertyIdsMock.mockResolvedValue([PROPERTY_ID, "home-2"]);
    const form = reminderFormData();
    form.append("chargeIds", OTHER_CHARGE_ID);
    expect(await sendBatchPaymentReminder(null, form)).toEqual({
      success: false, error: "Your owner has not turned on reminders for this home."
    });
    expect(createNotificationWithDeliveryMock).not.toHaveBeenCalled();
    expect(logAuditMock).not.toHaveBeenCalled();
  });

  it("rejects an empty selection without notifications or audit", async () => {
    const result = await sendBatchPaymentReminder(null, new FormData());
    expect(result).toEqual({ success: false, error: "Select at least one charge." });
    expect(createNotificationWithDeliveryMock).not.toHaveBeenCalled();
    expect(logAuditMock).not.toHaveBeenCalled();
  });

  it("never creates a rent reminder for an outside-Domus tenant", async () => {
    requireAuthMock.mockResolvedValue({ user: { id: "manager-1" }, role: "manager" });
    createAdminClientMock.mockReturnValue(createReminderAdminClient({ leases: [
      { id: LEASE_ID, tenant_profile_id: TENANT_ID, unit_id: UNIT_ID, collects_outside_domus: true }
    ] }));
    const result = await sendBatchPaymentReminder(null, reminderFormData());
    expect(result?.success).toBe(false);
    expect(createNotificationWithDeliveryMock).not.toHaveBeenCalled();
    expect(logAuditMock).not.toHaveBeenCalled();
  });

});
