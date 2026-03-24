import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildDueDatesByLeaseId,
  getCandidateMonths,
  isLeaseActiveForChargeMonth
} from "@/lib/charge-generation";

function setToday(isoDateTime: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(isoDateTime));
}

describe("charge generation", () => {
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
});
