import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createNotificationWithDeliveryMock = vi.hoisted(() => vi.fn());
const notifyOwnerMembersForPropertyMock = vi.hoisted(() => vi.fn());
const getPropertyNotificationDeliveryPreferencesMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/notifications", () => ({
  createNotificationWithDelivery: createNotificationWithDeliveryMock,
  notifyOwnerMembersForProperty: notifyOwnerMembersForPropertyMock
}));
vi.mock("@/lib/notification-preferences", () => ({
  getPropertyNotificationDeliveryPreferences: getPropertyNotificationDeliveryPreferencesMock
}));
import {
  buildDueDatesByLeaseId,
  getCandidateMonths,
  isLeaseActiveForChargeMonth,
  applyLateFeesToOverdueCharges
} from "@/lib/charge-generation";

function createLateFeeSupabaseMock(params: {
  collectsOutsideDomus: boolean;
  existingLateFee?: boolean;
}) {
  const update = vi.fn(() => {
    const builder = {
      in: vi.fn(() => builder),
      then: (resolve: (value: { error: null }) => unknown) =>
        Promise.resolve({ error: null }).then(resolve)
    };
    return builder;
  });
  const insert = vi.fn(async () => ({ error: null }));
  const candidate = {
    id: "charge-1",
    lease_id: "lease-1",
    due_date: "2026-09-01",
    status: "pending",
    category: "rent"
  };

  const client = {
    from: vi.fn((table: string) => {
      if (table === "rent_charges") {
        return {
          select: vi.fn((columns: string) => {
            if (columns.includes("parent_charge_id")) {
              const builder = {
                in: vi.fn(() => builder),
                eq: vi.fn(() => builder),
                is: vi.fn(async () => ({
                  data: params.existingLateFee
                    ? [{ id: "late-fee-1", parent_charge_id: "charge-1" }]
                    : [],
                  error: null
                }))
              };
              return builder;
            }

            const builder = {
              in: vi.fn(() => builder),
              eq: vi.fn(() => builder),
              lt: vi.fn(() => builder),
              is: vi.fn(async () => ({ data: [candidate], error: null }))
            };
            return builder;
          }),
          update,
          insert
        };
      }

      if (table === "leases") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({
              data: [
                {
                  id: "lease-1",
                  tenant_profile_id: "tenant-1",
                  unit_id: "unit-1",
                  grace_period_days: 5,
                  late_fee_cents: 5000,
                  lease_status: "active",
                  collects_outside_domus: params.collectsOutsideDomus
                }
              ],
              error: null
            }))
          }))
        };
      }

      if (table === "units") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({
              data: [{ id: "unit-1", property_id: "property-1" }],
              error: null
            }))
          }))
        };
      }

      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({
              data: [{ id: "tenant-1", email: "tenant@example.com" }],
              error: null
            }))
          }))
        };
      }

      throw new Error(`Unexpected table ${table}`);
    })
  };

  return {
    supabase: client as unknown as SupabaseClient,
    update,
    insert
  };
}

function setToday(isoDateTime: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(isoDateTime));
}

describe("charge generation", () => {
  beforeEach(() => {
    createNotificationWithDeliveryMock.mockResolvedValue(undefined);
    notifyOwnerMembersForPropertyMock.mockResolvedValue(undefined);
    getPropertyNotificationDeliveryPreferencesMock.mockResolvedValue(new Map());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns exactly the current month and next month as charge candidates", () => {
    setToday("2026-03-22T12:00:00.000Z");

    expect(getCandidateMonths()).toEqual([
      { year: 2026, month: 2 },
      { year: 2026, month: 3 }
    ]);
  });

  it("skips a backdated rent charge when the due day already passed before lease creation", () => {
    setToday("2026-03-22T12:00:00.000Z");

    const dueDates = buildDueDatesByLeaseId(
      [
        {
          id: "lease-1",
          unit_id: "unit-1",
          tenant_profile_id: "tenant-1",
          start_date: "2026-03-22",
          end_date: "2027-03-21",
          created_at: "2026-03-22T14:30:00.000Z",
          due_day_of_month: 1,
          monthly_rent_cents: 165000
        }
      ],
      "2026-03-22"
    );

    expect(dueDates.get("lease-1")).toEqual(["2026-04-01"]);
  });

  it("uses the current month when the lease is created before the due day", () => {
    setToday("2026-03-22T12:00:00.000Z");

    const dueDates = buildDueDatesByLeaseId(
      [
        {
          id: "lease-2",
          unit_id: "unit-1",
          tenant_profile_id: "tenant-1",
          start_date: "2026-03-22",
          end_date: "2027-03-21",
          created_at: "2026-03-22T14:30:00.000Z",
          due_day_of_month: 25,
          monthly_rent_cents: 165000
        }
      ],
      "2026-03-22"
    );

    expect(dueDates.get("lease-2")).toEqual(["2026-03-25", "2026-04-25"]);
  });

  it("allows a charge on the lease creation day when the due day matches", () => {
    setToday("2026-03-01T09:00:00.000Z");

    const dueDates = buildDueDatesByLeaseId(
      [
        {
          id: "lease-3",
          unit_id: "unit-1",
          tenant_profile_id: "tenant-1",
          start_date: "2026-03-01",
          end_date: "2027-02-28",
          created_at: "2026-03-01T09:00:00.000Z",
          due_day_of_month: 1,
          monthly_rent_cents: 165000
        }
      ],
      "2026-03-01"
    );

    expect(dueDates.get("lease-3")).toContain("2026-03-01");
  });

  it("never includes due dates that fall before lease creation even if the lease start date is earlier", () => {
    setToday("2026-03-22T12:00:00.000Z");

    const dueDates = buildDueDatesByLeaseId(
      [
        {
          id: "lease-4",
          unit_id: "unit-1",
          tenant_profile_id: "tenant-1",
          start_date: "2026-03-01",
          end_date: "2027-02-28",
          created_at: "2026-03-22T01:00:00.000Z",
          due_day_of_month: 1,
          monthly_rent_cents: 165000
        }
      ],
      "2026-03-22"
    );

    expect(dueDates.get("lease-4")).toEqual(["2026-04-01"]);
  });

  it("skips charge months before the lease start month", () => {
    expect(
      isLeaseActiveForChargeMonth(
        {
          id: "lease-start-guard",
          unit_id: "unit-1",
          tenant_profile_id: "tenant-1",
          start_date: "2026-04-01",
          end_date: "2027-03-31",
          created_at: "2026-03-22T12:00:00.000Z",
          due_day_of_month: 1,
          monthly_rent_cents: 235000
        },
        "2026-03-01"
      )
    ).toBe(false);
  });

  it("skips charge months after the lease end month", () => {
    expect(
      isLeaseActiveForChargeMonth(
        {
          id: "lease-end-guard",
          unit_id: "unit-1",
          tenant_profile_id: "tenant-1",
          start_date: "2025-04-01",
          end_date: "2026-03-31",
          created_at: "2025-03-15T12:00:00.000Z",
          due_day_of_month: 1,
          monthly_rent_cents: 235000
        },
        "2026-04-01"
      )
    ).toBe(false);
  });

  it("does not backfill a charge into the month before the lease begins", () => {
    setToday("2026-03-23T12:00:00.000Z");

    const dueDates = buildDueDatesByLeaseId(
      [
        {
          id: "lease-future-start",
          unit_id: "unit-1",
          tenant_profile_id: "tenant-1",
          start_date: "2026-04-01",
          end_date: "2027-03-31",
          created_at: "2026-03-23T12:00:00.000Z",
          due_day_of_month: 1,
          monthly_rent_cents: 235000
        }
      ],
      "2026-03-23"
    );

    expect(dueDates.get("lease-future-start")).toEqual(["2026-04-01"]);
  });

  it("does not generate charges after a lease has already ended", () => {
    setToday("2026-04-02T12:00:00.000Z");

    const dueDates = buildDueDatesByLeaseId(
      [
        {
          id: "lease-ended",
          unit_id: "unit-1",
          tenant_profile_id: "tenant-1",
          start_date: "2025-04-01",
          end_date: "2026-03-31",
          created_at: "2025-03-15T12:00:00.000Z",
          due_day_of_month: 1,
          monthly_rent_cents: 235000
        }
      ],
      "2026-04-02"
    );

    expect(dueDates.has("lease-ended")).toBe(false);
  });

  it("does not mark or fee a past-grace charge collected outside Domus", async () => {
    setToday("2026-10-03T12:00:00.000Z");
    const { supabase, update, insert } = createLateFeeSupabaseMock({
      collectsOutsideDomus: true
    });

    await expect(
      applyLateFeesToOverdueCharges(supabase, ["lease-1"], "2026-10-03")
    ).resolves.toBe(0);
    expect(update).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("remains idempotent when the flagged late job runs repeatedly", async () => {
    setToday("2026-10-03T12:00:00.000Z");
    const { supabase, update, insert } = createLateFeeSupabaseMock({
      collectsOutsideDomus: true
    });

    await applyLateFeesToOverdueCharges(supabase, ["lease-1"], "2026-10-03");
    await applyLateFeesToOverdueCharges(supabase, ["lease-1"], "2026-10-03");

    expect(update).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("preserves late status and late-fee behavior for unflagged leases", async () => {
    setToday("2026-10-03T12:00:00.000Z");
    const { supabase, update, insert } = createLateFeeSupabaseMock({
      collectsOutsideDomus: false
    });

    await expect(
      applyLateFeesToOverdueCharges(supabase, ["lease-1"], "2026-10-03")
    ).resolves.toBe(1);
    expect(update).toHaveBeenCalledWith({ status: "late" });
    expect(insert).toHaveBeenCalledWith([
      expect.objectContaining({
        lease_id: "lease-1",
        parent_charge_id: "charge-1",
        category: "late_fee",
        amount_cents: 5000
      })
    ]);
  });
});
