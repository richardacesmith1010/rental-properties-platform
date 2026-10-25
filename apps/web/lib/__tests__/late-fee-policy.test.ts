import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createNotificationWithDeliveryMock = vi.hoisted(() => vi.fn());
const notifyPropertyTeamMock = vi.hoisted(() => vi.fn());
const getPropertyNotificationDeliveryPreferencesMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/notifications", () => ({
  createNotificationWithDelivery: createNotificationWithDeliveryMock,
  notifyPropertyTeam: notifyPropertyTeamMock
}));
vi.mock("@/lib/notification-preferences", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/notification-preferences")>(),
  getPropertyNotificationDeliveryPreferences: getPropertyNotificationDeliveryPreferencesMock,
  getNotificationPreference: vi.fn().mockResolvedValue({ inAppEnabled: true, emailEnabled: true })
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { automaticLateFeesEnabled } from "@/lib/late-fee-policy";
import { applyLateFeesToOverdueCharges } from "@/lib/charge-generation";
import { formatDate } from "@/lib/format";
import { createLateFeeSupabaseMock, setToday } from "./late-fee-test-helpers";

describe("automatic late-fee policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createNotificationWithDeliveryMock.mockResolvedValue({
      inApp: { status: "sent" }, email: { status: "skipped" }
    });
    notifyPropertyTeamMock.mockResolvedValue(undefined);
    getPropertyNotificationDeliveryPreferencesMock.mockResolvedValue(new Map());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("P1 disables automatic late fees in the real policy", () => {
    expect(automaticLateFeesEnabled()).toBe(false);
  });

  it("P9 real policy pauses fee writes and lookups while preserving late status and notices", async () => {
    setToday("2026-10-03T12:00:00.000Z");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { supabase, from, update, insert } = createLateFeeSupabaseMock({
      collectsOutsideDomus: false, lateFeeCents: 5000, dueDate: "2026-09-01"
    });
    expect(await applyLateFeesToOverdueCharges(supabase, ["lease-1"], "2026-10-03"))
      .toBe("Late notices: 1 sent, 0 emailed, 0 skipped.");
    expect(update.mock.calls).toEqual([[{ status: "late" }]]);
    expect(insert).not.toHaveBeenCalled();
    const chargeQueries = from.mock.results.filter((_, index) => from.mock.calls[index][0] === "rent_charges");
    expect(chargeQueries.flatMap(({ value }) => value.select.mock.calls))
      .toEqual([["id, lease_id, due_date, status, category"]]);
    expect(log.mock.calls).toEqual([["[late-fees] paused:", 1, "fee(s) not added"]]);
    expect(createNotificationWithDeliveryMock.mock.calls).toEqual([[{
      recipientProfileId: "tenant-1", recipientEmail: "tenant@example.com", type: "late_rent",
      title: "Rent payment overdue", body: `Your rent due ${formatDate("2026-09-01")} is now late.`,
      entityType: "rent_charge", entityId: "charge-1",
      deliveryPreference: { emailEnabled: true, inAppEnabled: true, emailBlockReason: null }
    }]]);
    expect(notifyPropertyTeamMock.mock.calls).toEqual([[{
      propertyId: "property-1", event: "late_fee", type: "late_rent", title: "Rent is late",
      body: `Rent due ${formatDate("2026-09-01")} is now late.`, entityType: "rent_charge", entityId: "charge-1"
    }]]);
  });
});
