import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createNotificationWithDeliveryMock = vi.hoisted(() => vi.fn());
const notifyPropertyTeamMock = vi.hoisted(() => vi.fn());
const getPropertyNotificationDeliveryPreferencesMock = vi.hoisted(() => vi.fn());
const createAdminClientMock = vi.hoisted(() => vi.fn());
const createRentChargeWithLinesMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/notifications", () => ({
  createNotificationWithDelivery: createNotificationWithDeliveryMock,
  notifyPropertyTeam: notifyPropertyTeamMock
}));
vi.mock("@/lib/notification-preferences", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/notification-preferences")>(),
  getPropertyNotificationDeliveryPreferences: getPropertyNotificationDeliveryPreferencesMock,
  getNotificationPreference: vi.fn().mockResolvedValue({ inAppEnabled: true, emailEnabled: true })
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: createAdminClientMock }));
vi.mock("@/lib/charge-lines", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/charge-lines")>(),
  createRentChargeWithLines: createRentChargeWithLinesMock
}));
vi.mock("@/lib/late-fee-policy", () => ({ automaticLateFeesEnabled: vi.fn(() => false) }));
import { automaticLateFeesEnabled } from "@/lib/late-fee-policy";
import { formatDate } from "@/lib/format";
import { createLateFeeSupabaseMock, setToday } from "./late-fee-test-helpers";
import { createNotificationAdminClient, notificationUpserts } from "./notification-test-helpers";
import {
  buildDueDatesByLeaseId,
  getCandidateMonths,
  isLeaseActiveForChargeMonth,
  applyLateFeesToOverdueCharges,
  generateMonthlyChargesForPropertyIdsWithClient
} from "@/lib/charge-generation";

describe("charge generation", () => {
  it("N3 merges tenant late notice denial and keeps the in-app channel", async () => {
    setToday("2026-10-03T12:00:00.000Z");
    const { supabase } = createLateFeeSupabaseMock({
      collectsOutsideDomus: false, tenantPrefs: { late_rent: false }
    });
    await applyLateFeesToOverdueCharges(supabase, ["lease-1"], "2026-10-03");
    expect(createNotificationWithDeliveryMock).toHaveBeenCalledWith(expect.objectContaining({
      deliveryPreference: { emailEnabled: false, inAppEnabled: true,
        emailBlockReason: "late_rent emails are disabled" }
    }));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(automaticLateFeesEnabled).mockReturnValue(false);
    createNotificationWithDeliveryMock.mockResolvedValue({
      inApp: { status: "sent" }, email: { status: "skipped" }
    });
    notifyPropertyTeamMock.mockResolvedValue(undefined);
    getPropertyNotificationDeliveryPreferencesMock.mockResolvedValue(new Map());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("P2 pauses eligible fees without querying existing fees and preserves late status and summary", async () => {
    setToday("2026-10-03T12:00:00.000Z");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { supabase, from, update, insert } = createLateFeeSupabaseMock({
      collectsOutsideDomus: false, lateFeeCents: 5000, dueDate: "2026-09-01"
    });
    expect(await applyLateFeesToOverdueCharges(supabase, ["lease-1"], "2026-10-03"))
      .toBe("Late notices: 1 sent, 0 emailed, 0 skipped.");
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls).toEqual([[{ status: "late" }]]);
    expect(insert).not.toHaveBeenCalled();
    const chargeQueries = from.mock.results.filter((_, index) => from.mock.calls[index][0] === "rent_charges");
    expect(chargeQueries.flatMap(({ value }) => value.select.mock.calls))
      .toEqual([["id, lease_id, due_date, status, category"]]);
    expect(log.mock.calls).toEqual([["[late-fees] paused:", 1, "fee(s) not added"]]);
  });

  it("P3 preserves exact tenant and team late notices while fees are paused", async () => {
    setToday("2026-10-03T12:00:00.000Z");
    const { supabase } = createLateFeeSupabaseMock({ collectsOutsideDomus: false, lateFeeCents: 5000 });
    await applyLateFeesToOverdueCharges(supabase, ["lease-1"], "2026-10-03");
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
    for (const [notice] of [...createNotificationWithDeliveryMock.mock.calls, ...notifyPropertyTeamMock.mock.calls]) {
      expect(`${notice.title} ${notice.body}`).not.toMatch(/fee/i);
    }
  });

  it("P4 logs once with two eligible charges on two leases", async () => {
    setToday("2026-10-03T12:00:00.000Z");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { supabase, insert } = createLateFeeSupabaseMock({
      collectsOutsideDomus: false, additionalCandidates: [{ lateFeeCents: 5000 }]
    });
    await applyLateFeesToOverdueCharges(supabase, ["lease-1", "lease-2"], "2026-10-03");
    expect(log.mock.calls).toEqual([["[late-fees] paused:", 2, "fee(s) not added"]]);
    expect(insert).not.toHaveBeenCalled();
  });

  it("P4b counts only fee-eligible candidates among zero-fee and within-grace charges", async () => {
    setToday("2026-10-03T12:00:00.000Z");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { supabase, insert } = createLateFeeSupabaseMock({
      collectsOutsideDomus: false,
      additionalCandidates: [{ lateFeeCents: 0 }, { dueDate: "2026-10-01" }]
    });
    await applyLateFeesToOverdueCharges(supabase, ["lease-1", "lease-2", "lease-3"], "2026-10-03");
    expect(log.mock.calls).toEqual([["[late-fees] paused:", 1, "fee(s) not added"]]);
    expect(insert).not.toHaveBeenCalled();
  });

  it.each([
    { collectsOutsideDomus: false, lateFeeCents: 0 },
    { collectsOutsideDomus: true, lateFeeCents: 5000 }
  ])("P5 skips the paused log and insert for ineligible lease %j", async (options) => {
    setToday("2026-10-03T12:00:00.000Z");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { supabase, insert } = createLateFeeSupabaseMock(options);
    await applyLateFeesToOverdueCharges(supabase, ["lease-1"], "2026-10-03");
    expect(log).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("returns exact rent messages for two added rows and none", async () => {
    setToday("2026-10-15T12:00:00.000Z");
    createRentChargeWithLinesMock.mockResolvedValue(true);
    createAdminClientMock.mockReturnValue({});
    const lease = { id: "lease-1", unit_id: "unit-1", tenant_profile_id: "tenant-1",
      start_date: "2026-10-01", end_date: "2027-12-31", created_at: "2026-10-01",
      due_day_of_month: 20, monthly_rent_cents: 100000, lease_status: "active" };
    let existing: { lease_id: string; due_date: string }[] = [];
    const client = { from: (table: string) => ({ select: (columns: string) => {
      let data: unknown[] = table === "units" ? [{ id: "unit-1", property_id: "property-1" }]
        : table === "leases" ? [lease]
          : columns === "lease_id, due_date" ? existing : [];
      const query = { in: () => query, eq: () => query, is: () => query, lt: () => query,
        then: (resolve: (value: unknown) => void) => Promise.resolve({ data, error: null }).then(resolve) };
      return query;
    } }) } as unknown as SupabaseClient;
    expect(await generateMonthlyChargesForPropertyIdsWithClient(client, ["property-1"]))
      .toBe("Rent added for this month.");
    expect(createRentChargeWithLinesMock).toHaveBeenCalledTimes(2);
    existing = [{ lease_id: "lease-1", due_date: "2026-10-20" },
      { lease_id: "lease-1", due_date: "2026-11-20" }];
    expect(await generateMonthlyChargesForPropertyIdsWithClient(client, ["property-1"]))
      .toBe("Rent is already up to date.");
  });

  // Dormant-path coverage
  // only. Passing these tests does not make automatic late fees legal; see lib/late-fee-policy.ts.
  it("[fees on] D5 marks October 26 rent late only after Denver leaves October 31", async () => {
    vi.mocked(automaticLateFeesEnabled).mockReturnValue(true);
    setToday("2026-11-01T04:30:00Z");
    const evening = createLateFeeSupabaseMock({ collectsOutsideDomus: false, dueDate: "2026-10-26" });
    await applyLateFeesToOverdueCharges(evening.supabase, ["lease-1"], "2026-10-31");
    expect(evening.update).not.toHaveBeenCalled();
    expect(evening.insert).not.toHaveBeenCalled();
    setToday("2026-11-01T12:00:00Z");
    const morning = createLateFeeSupabaseMock({ collectsOutsideDomus: false, dueDate: "2026-10-26" });
    await applyLateFeesToOverdueCharges(morning.supabase, ["lease-1"], "2026-11-01");
    expect(morning.update).toHaveBeenCalledTimes(1);
    expect(morning.insert).toHaveBeenCalledTimes(1);
  });

  // Dormant-path coverage
  // only. Passing these tests does not make automatic late fees legal; see lib/late-fee-policy.ts.
  it("[fees on] D4s inserts one late fee before cron and none on rerun", async () => {
    vi.mocked(automaticLateFeesEnabled).mockReturnValue(true);
    setToday("2026-11-01T04:30:00Z");
    const evening = createLateFeeSupabaseMock({ collectsOutsideDomus: false, dueDate: "2026-10-25" });
    await applyLateFeesToOverdueCharges(evening.supabase, ["lease-1"], "2026-10-31");
    expect(evening.insert).toHaveBeenCalledTimes(1);
    setToday("2026-11-01T08:00:00Z");
    const cron = createLateFeeSupabaseMock({ collectsOutsideDomus: false,
      dueDate: "2026-10-25", existingLateFee: true });
    await applyLateFeesToOverdueCharges(cron.supabase, ["lease-1"], "2026-11-01");
    await applyLateFeesToOverdueCharges(cron.supabase, ["lease-1"], "2026-11-01");
    expect(cron.insert).not.toHaveBeenCalled();
  });

  it("D4s keeps one rent row per due date across evening, cron, and rerun", async () => {
    const rows: Array<{ lease_id: string; due_date: string; category: string }> = [];
    const lease = { id: "lease-1", unit_id: "unit-1", tenant_profile_id: "tenant-1",
      start_date: "2026-01-01", end_date: "2027-06-30", created_at: "2026-01-01T12:00:00Z",
      due_day_of_month: 1, monthly_rent_cents: 100000, lease_status: "active" };
    createAdminClientMock.mockReturnValue({});
    createRentChargeWithLinesMock.mockImplementation(async (_admin: unknown, leaseId: string, dueDate: string) => {
      if (rows.some((row) => row.lease_id === leaseId && row.due_date === dueDate && row.category === "rent")) {
        return false;
      }
      rows.push({ lease_id: leaseId, due_date: dueDate, category: "rent" });
      return true;
    });
    const client = { from: (table: string) => ({ select: (columns: string) => {
      const data = table === "units" ? [{ id: "unit-1", property_id: "property-1" }]
        : table === "leases" ? [lease]
          : table === "rent_charges" && columns === "lease_id, due_date" ? rows
            : [];
      const query = { in: () => query, eq: () => query, is: () => query, lt: () => query,
        then: (done: (value: unknown) => void) => Promise.resolve({ data, error: null }).then(done) };
      return query;
    } }) } as unknown as SupabaseClient;
    for (const instant of ["2026-11-01T04:30:00Z", "2026-11-01T08:00:00Z", "2026-11-01T08:00:00Z"]) {
      setToday(instant);
      await generateMonthlyChargesForPropertyIdsWithClient(client, ["property-1"]);
    }
    expect(rows.map((row) => row.due_date).sort()).toEqual([
      "2026-10-01", "2026-11-01", "2026-12-01"
    ]);
    expect(createRentChargeWithLinesMock).toHaveBeenCalledTimes(3);
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
    ).resolves.toBe("Late notices: 0 sent, 0 emailed, 0 skipped.");
    expect(update).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("marks outside client rent late without a fee using one account lookup", async () => {
    setToday("2026-10-03T12:00:00.000Z");
    const { supabase, from, update, insert } = createLateFeeSupabaseMock({
      collectsOutsideDomus: true, clientHome: true
    });
    await applyLateFeesToOverdueCharges(supabase, ["lease-1"], "2026-10-03");
    expect(update).toHaveBeenCalledTimes(1);
    expect(insert).not.toHaveBeenCalled();
    expect(createNotificationWithDeliveryMock).not.toHaveBeenCalled();
    expect(notifyPropertyTeamMock).toHaveBeenCalledWith(expect.objectContaining({ event: "late_fee", propertyId: "property-1" }));
    expect(from.mock.calls.filter(([table]) => table === "ownership_accounts")).toHaveLength(1);
  });

  it("throws when the batched client lookup fails", async () => {
    setToday("2026-10-03T12:00:00.000Z");
    const { supabase } = createLateFeeSupabaseMock({
      collectsOutsideDomus: true, accountError: true
    });
    await expect(applyLateFeesToOverdueCharges(supabase, ["lease-1"], "2026-10-03"))
      .rejects.toThrow("account lookup failed");
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

  // Dormant-path coverage
  // only. Passing these tests does not make automatic late fees legal; see lib/late-fee-policy.ts.
  it("[fees on] preserves late status and late-fee behavior for unflagged leases", async () => {
    vi.mocked(automaticLateFeesEnabled).mockReturnValue(true);
    setToday("2026-10-03T12:00:00.000Z");
    const { supabase, update, insert } = createLateFeeSupabaseMock({
      collectsOutsideDomus: false
    });

    await expect(
      applyLateFeesToOverdueCharges(supabase, ["lease-1"], "2026-10-03")
    ).resolves.toBe("Late notices: 1 sent, 0 emailed, 0 skipped.");
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

  // Dormant-path coverage
  // only. Passing these tests does not make automatic late fees legal; see lib/late-fee-policy.ts.
  it("[fees on] null lease collection flag keeps the fee and owner notice but blocks tenant late notice", async () => {
    vi.mocked(automaticLateFeesEnabled).mockReturnValue(true);
    setToday("2026-10-03T12:00:00.000Z");
    const { supabase, update, insert } = createLateFeeSupabaseMock({ collectsOutsideDomus: null });
    await expect(applyLateFeesToOverdueCharges(supabase, ["lease-1"], "2026-10-03"))
      .resolves.toBe("Late notices: 0 sent, 0 emailed, 0 skipped.");
    expect(update).toHaveBeenCalledWith({ status: "late" });
    expect(insert).toHaveBeenCalledWith([expect.objectContaining({
      category: "late_fee", amount_cents: 5000, parent_charge_id: "charge-1"
    })]);
    expect(createNotificationWithDeliveryMock).not.toHaveBeenCalled();
    expect(notifyPropertyTeamMock).toHaveBeenCalledWith(expect.objectContaining({
      event: "late_fee", propertyId: "property-1"
    }));
  });

  it("allowlisted tenant A gets no notice for tenant B's late rent and unlisted B gets none", async () => {
    vi.stubEnv("DOMUS_NOTIFICATIONS_ENABLED", "true");
    vi.stubEnv("DOMUS_NOTIFICATIONS_ALLOWLIST", "tenant-a@example.com");
    const notificationAdmin = createNotificationAdminClient({ profiles: [
      { id: "tenant-a", email: "tenant-a@example.com" },
      { id: "tenant-1", email: "tenant-b@example.com" }
    ] });
    createAdminClientMock.mockReturnValue(notificationAdmin);
    const actual = await vi.importActual<typeof import("@/lib/notifications")>("@/lib/notifications");
    createNotificationWithDeliveryMock.mockImplementation(actual.createNotificationWithDelivery);
    setToday("2026-10-03T12:00:00.000Z");
    const { supabase } = createLateFeeSupabaseMock({ collectsOutsideDomus: false });
    await applyLateFeesToOverdueCharges(supabase, ["lease-1"], "2026-10-03");
    expect(createNotificationWithDeliveryMock.mock.calls.map(([row]) => row.recipientProfileId))
      .toEqual(["tenant-1"]);
    expect(notificationUpserts(notificationAdmin)).toHaveLength(0);
    expect(notifyPropertyTeamMock).toHaveBeenCalledWith(expect.objectContaining({ event: "late_fee" }));
  });
});
