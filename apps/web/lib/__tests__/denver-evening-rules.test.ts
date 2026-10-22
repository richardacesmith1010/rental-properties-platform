import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDueDatesByLeaseId, getCandidateMonths, isPastGraceWindow, updateLeaseStatuses } from "@/lib/charge-generation";
import { getChargeUrgency, isRentOpenForTenant } from "@/lib/rent-urgency";
import { getNextRentDueDate } from "@/lib/tenant-pay-state";
import { addDays, daysBetween, todayDenver } from "@/lib/denver-calendar";

const E = new Date("2026-11-01T04:30:00Z");
const M = new Date("2026-11-01T12:00:00Z");
const lease = { id: "lease", unit_id: "unit", start_date: "2026-01-01", end_date: "2027-06-30",
  created_at: "2026-01-01T12:00:00Z", due_day_of_month: 1, monthly_rent_cents: 150000 };

function freeze(date: Date) { vi.setSystemTime(date); }

describe("Denver evening money rules", () => {
  afterEach(() => vi.useRealTimers());
  it("D2 keeps tomorrow upcoming until Denver midnight", () => {
    vi.useFakeTimers(); freeze(E);
    expect(getChargeUrgency({ status: "pending", dueDate: "2026-11-01" })).toEqual({
      level: "upcoming", daysUntilDue: 1
    });
    expect(isRentOpenForTenant("2026-11-06")).toEqual(false);
    freeze(M);
    expect(getChargeUrgency({ status: "pending", dueDate: "2026-11-01" })).toEqual({
      level: "due_today", daysUntilDue: 0
    });
    expect(isRentOpenForTenant("2026-11-06")).toEqual(true);
  });

  it("D4 generates October and November at E, November and December at M", () => {
    vi.useFakeTimers(); freeze(E);
    expect(getCandidateMonths()).toEqual([{ year: 2026, month: 9 }, { year: 2026, month: 10 }]);
    expect(buildDueDatesByLeaseId([lease], todayDenver()).get("lease")).toEqual(["2026-10-01", "2026-11-01"]);
    freeze(M);
    expect(buildDueDatesByLeaseId([lease], todayDenver()).get("lease")).toEqual(["2026-11-01", "2026-12-01"]);
  });

  it("D5 applies grace against the passed date, not the live clock", () => {
    vi.useFakeTimers(); freeze(M);
    expect(isPastGraceWindow("2026-10-26", 5, "2026-10-31")).toEqual(false);
    expect(isPastGraceWindow("2026-10-25", 5, "2026-10-31")).toEqual(true);
    expect(isPastGraceWindow("2026-10-26", 5, "2026-11-01")).toEqual(true);
  });

  it("D7 counts overdue days and reminder dates by Denver dates", () => {
    expect(daysBetween("2026-10-01", todayDenver(E))).toEqual(30);
    expect(daysBetween("2026-10-01", todayDenver(M))).toEqual(31);
    expect(addDays(todayDenver(E), 3)).toEqual("2026-11-03");
    expect(addDays(todayDenver(M), 3)).toEqual("2026-11-04");
  });

  it("D9 allows a due date on the Denver creation day", () => {
    const marchLease = { ...lease, due_day_of_month: 21, start_date: "2026-03-01",
      created_at: "2026-03-22T01:00:00Z" };
    expect(buildDueDatesByLeaseId([marchLease], "2026-03-21").get("lease")).toEqual([
      "2026-03-21", "2026-04-21"
    ]);
  });

  it("tenant next due date uses the Denver month", () => {
    expect(getNextRentDueDate(1, E)).toEqual("2026-11-01");
    expect(getNextRentDueDate(1, M)).toEqual("2026-11-01");
  });

  it("D9b changes lease statuses only on the Denver date boundary", async () => {
    vi.useFakeTimers();
    const updates: Array<{ status: string; ids: string[] }> = [];
    const leases = [
      { id: "oct31", end_date: "2026-10-31", lease_status: "active", active: true },
      { id: "nov30", end_date: "2026-11-30", lease_status: "active", active: true },
      { id: "dec01", end_date: "2026-12-01", lease_status: "active", active: true }
    ];
    const client = { from: (_table: string) => ({
      select: () => ({ in: () => ({
        eq: async () => ({ data: leases, error: null }),
        then: (done: (value: unknown) => void) => Promise.resolve({ data: [{ id: "unit" }], error: null }).then(done)
      }) }),
      update: (payload: { lease_status: string }) => ({ in: (_column: string, ids: string[]) => ({
        eq: async () => { updates.push({ status: payload.lease_status, ids }); return { error: null }; }
      }) })
    }) } as unknown as SupabaseClient;
    freeze(E);
    await updateLeaseStatuses(client, ["property"]);
    expect(updates).toEqual([{ status: "expiring_soon", ids: ["oct31", "nov30"] }]);
    updates.length = 0;
    freeze(M);
    await updateLeaseStatuses(client, ["property"]);
    expect(updates).toEqual([
      { status: "expiring_soon", ids: ["nov30", "dec01"] },
      { status: "expired", ids: ["oct31"] }
    ]);
  });

});
