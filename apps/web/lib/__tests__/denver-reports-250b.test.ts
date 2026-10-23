import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveMoneySelection } from "@/app/owner/money/resolve";
import { buildHomeMoney } from "@/lib/owner-recent-activity";
import { denverDateOf, denverMonth, denverYear, todayDenver } from "@/lib/denver-calendar";
import { buildMonthlyLeaseLedger } from "@/lib/reports-ledger";
import { buildLastTwelveMonths, startOfCurrentYearIso } from "@/lib/analytics-loader";

vi.mock("server-only", () => ({}));

const E = new Date("2026-11-01T04:30:00Z");
const M = new Date("2026-11-01T12:00:00Z");
const Y = new Date("2027-01-01T05:00:00Z");
afterEach(() => vi.useRealTimers());

describe("250b Denver report and dashboard periods", () => {
  it("R1 Money picks the Denver month and exact exclusive range", () => {
    expect(resolveMoneySelection(["p"], undefined, undefined, E)).toMatchObject({
      selectedMonth: "2026-10", currentMonth: "2026-10", alertToday: "2026-10-31",
      range: { from: "2026-10-01", to: "2026-11-01" }
    });
    expect(resolveMoneySelection(["p"], undefined, undefined, M)).toMatchObject({
      selectedMonth: "2026-11", range: { from: "2026-11-01", to: "2026-12-01" }
    });
  });

  it("R1 recent activity puts an early UTC November payment in October", () => {
    const rentRows = { units: [{ id: "u", property_id: "p" }],
      leases: [{ id: "l", unit_id: "u" }],
      charges: [{ id: "c", lease_id: "l", category: "rent", deleted_at: null }],
      payments: [{ id: "pay", rent_charge_id: "c", amount_cents: 1000,
        paid_at: "2026-11-01T04:00:00Z", reversed_at: null },
      { id: "next", rent_charge_id: "c", amount_cents: 2000,
        paid_at: "2026-11-01T06:00:00Z", reversed_at: null }] };
    const result = buildHomeMoney({ rentRows: rentRows as Parameters<typeof buildHomeMoney>[0]["rentRows"],
      expenses: [], propertyNames: { p: "Home" }, tenantNameByLeaseId: new Map(), ids: ["p"], today: E });
    expect(result).toMatchObject({ ok: true, leftByPropertyId: { p: 1000 },
      items: [{ id: "pay", date: "2026-10-31" }] });
    if (result.ok) expect(result.items.map((item) => item.id)).toEqual(["pay"]);
  });

  it("R2/R3 Denver year and timestamp date cross UTC year and month", () => {
    expect(denverYear(Y)).toBe(2026);
    expect(denverMonth(Y)).toBe("2026-12");
    expect(denverDateOf("2026-11-01T04:00:00Z")).toBe("2026-10-31");
  });

  it("R2 analytics ends in December and starts the year in January at Y", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Y);
    expect(buildLastTwelveMonths().at(-1)).toMatchObject({ key: "2026-12",
      startIso: "2026-12-01", endIso: "2026-12-31" });
    expect(startOfCurrentYearIso()).toBe("2026-01-01");
  });

  it("R4 report today follows the Denver clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(E);
    expect(todayDenver()).toBe("2026-10-31");
  });
});

import { computeFilteredKpis } from "@/components/dashboard/dashboard-kpi-loader";

it("R1 KPI rent uses October due dates at E and November at M", () => {
  const params = {
    baseKpis: {} as Parameters<typeof computeFilteredKpis>[0]["baseKpis"],
    charges: [
      { category: "rent", dueDate: "2026-10-15", amountCents: 1000, status: "paid" },
      { category: "rent", dueDate: "2026-11-15", amountCents: 2000, status: "paid" }
    ] as Parameters<typeof computeFilteredKpis>[0]["charges"],
    tickets: [], portfolio: { properties: [], units: [], leases: [], tenants: [] }, netCashFlowCents: 0
  } as Parameters<typeof computeFilteredKpis>[0];
  vi.useFakeTimers();
  vi.setSystemTime(E);
  expect(computeFilteredKpis(params).collectedRentCents).toBe(1000);
  vi.setSystemTime(M);
  expect(computeFilteredKpis(params).collectedRentCents).toBe(2000);
});

it("R4 ledger default today marks October 31 due and leaves November 1 future", () => {
  vi.useFakeTimers();
  vi.setSystemTime(E);
  const lease = { startDate: "2026-10-01", endDate: "2027-09-30", monthlyRentCents: 1000 };
  const charges = ["2026-10-31", "2026-11-01"].map((due_date, index) => ({
    id: `c${index}`, due_date, amount_cents: 1000, status: "pending", deleted_at: null
  }));
  const result = buildMonthlyLeaseLedger(lease, charges, [], []);
  expect(result.months.map((month) => [month.month, month.short])).toEqual([
    ["2026-10", true], ["2026-11", false]
  ]);
});

it("R4 delinquency uses Denver October 31 for exact days late", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(E);
  vi.resetModules();
  vi.doMock("@/lib/reports-rent-roll", () => ({
    differenceInDays: (from: string, to: string) =>
      Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000),
    getLeasesForScope: async () => ({
      context: { propertyIds: ["p"], unitById: new Map([["u", { propertyId: "p", unitNumber: "1" }]]),
        propertyById: new Map([["p", { name: "Home" }]]) },
      leases: [{ id: "l", unit_id: "u", tenant_profile_id: "t", collects_outside_domus: false }],
      tenantById: new Map([["t", { name: "Tenant", email: "t@example.com" }]])
    }),
    getChargeDetailsForLeases: async () => ({ detailsByLeaseId: new Map([["l", [{ id: "c", dueDate: "2026-09-30",
      amountCents: 1000, status: "late", category: "rent" }]]]), chargeIds: ["c"] })
  }));
  vi.doMock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => ({
    select: () => ({ in: async () => ({ data: [{ id: "l", unit_id: "u", collects_outside_domus: false }], error: null }) })
  }) }) }));
  const { getDelinquencyReport } = await import("@/lib/reports-delinquency");
  const rows = await getDelinquencyReport("owner");
  expect(rows[0]).toMatchObject({ current: 0, thirtyDay: 1000, totalOwed: 1000 });
  vi.doUnmock("@/lib/reports-rent-roll");
  vi.doUnmock("@/lib/supabase/admin");
});

it("R2 monthly P&L defaults to the Denver year at UTC New Year", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(Y);
  vi.resetModules();
  vi.doMock("@/lib/reports-rent-roll", () => ({
    buildMonthKeys: (year: number) => Array.from({ length: 12 }, (_, index) =>
      `${year}-${String(index + 1).padStart(2, "0")}`),
    startOfYear: (year: number) => `${year}-01-01`,
    endOfYear: (year: number) => `${year}-12-31`,
    monthKey: (value: string) => value.slice(0, 7),
    composePropertyAddress: () => "Home",
    getLeasesForScope: async () => ({ context: { propertyIds: ["p"],
      propertyById: new Map([["p", { id: "p", name: "Home" }]]), unitById: new Map() }, leases: [] })
  }));
  vi.doMock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => {
    const query = { select: () => query, in: () => query, gte: () => query, lte: () => query,
      then: (resolve: (value: unknown) => void) => Promise.resolve({ data: [], error: null }).then(resolve) };
    return query;
  } }) }));
  const { getMonthlyPnLReport } = await import("@/lib/reports-pnl");
  const rows = await getMonthlyPnLReport("owner");
  expect(rows.map((row) => row.month)).toEqual(Array.from({ length: 12 }, (_, index) =>
    `2026-${String(index + 1).padStart(2, "0")}`));
  vi.doUnmock("@/lib/reports-rent-roll");
  vi.doUnmock("@/lib/supabase/admin");
});

it("R2 receipts PDF chooses Denver year when year is omitted", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(Y);
  vi.resetModules();
  const years: number[] = [];
  vi.doMock("@/lib/supabase/server", () => ({ createClient: () => ({ auth: {
    getUser: async () => ({ data: { user: { id: "owner" } } })
  } }) }));
  vi.doMock("@/lib/auth", () => ({ getCurrentUserRole: async () => "owner" }));
  vi.doMock("@/lib/pdf/pdf-data", () => ({
    buildReceiptsExportFileName: (year: number) => `receipts-${year}.pdf`,
    getReceiptsPdfDataForYear: async (_id: string, _role: string, year: number) => {
      years.push(year);
      return { ok: false, error: "unavailable", status: 422 };
    }
  }));
  const { GET } = await import("@/app/api/pdf/receipts/route");
  const response = await GET(new Request("https://domusbase.com/api/pdf/receipts"));
  expect(response.status).toBe(422);
  expect(years).toEqual([2026]);
  vi.doUnmock("@/lib/supabase/server");
  vi.doUnmock("@/lib/auth");
  vi.doUnmock("@/lib/pdf/pdf-data");
});

it("R2 reports page passes the Denver default year to P&L and tax reports", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(Y);
  vi.resetModules();
  const pnl = vi.fn(async () => []);
  const tax = vi.fn(async () => []);
  vi.doMock("@/lib/auth", () => ({ requireRole: async () => ({ user: { id: "owner" }, role: "owner" }),
    getRoleHomePath: () => "/owner" }));
  vi.doMock("@/lib/reports", () => ({
    getRentRollReport: async () => [], getDelinquencyReport: async () => [],
    getTenantLedgerReport: async () => [], getMonthlyPnLReport: pnl,
    getTaxSummaryReport: tax, getReceivablesReport: async () => []
  }));
  vi.doMock("@/lib/reports-ledger", () => ({ getMonthlyLeaseLedgers: async () => new Map() }));
  const { default: ReportsPage } = await import("@/app/owner/reports/page");
  await ReportsPage({});
  expect(pnl).toHaveBeenCalledWith("owner", 2026);
  expect(tax).toHaveBeenCalledWith("owner", 2026);
  vi.doUnmock("@/lib/auth");
  vi.doUnmock("@/lib/reports");
  vi.doUnmock("@/lib/reports-ledger");
});

it("R3 monthly P&L buckets an early UTC November payment in October", async () => {
  vi.resetModules();
  vi.doMock("@/lib/reports-rent-roll", () => ({
    buildMonthKeys: (year: number) => Array.from({ length: 12 }, (_, index) =>
      `${year}-${String(index + 1).padStart(2, "0")}`),
    startOfYear: (year: number) => `${year}-01-01`, endOfYear: (year: number) => `${year}-12-31`,
    monthKey: (value: string) => value.slice(0, 7), composePropertyAddress: () => "Home",
    getLeasesForScope: async () => ({ context: { propertyIds: ["p"],
      propertyById: new Map([["p", { id: "p", name: "Home" }]]),
      unitById: new Map([["u", { propertyId: "p", unitNumber: "1" }]]) },
    leases: [{ id: "l", unit_id: "u", tenant_profile_id: "t" }] })
  }));
  const data: Record<string, object[]> = {
    rent_charges: [{ id: "c", lease_id: "l", category: "rent", due_date: "2026-10-01",
      amount_cents: 1000, status: "paid" }],
    payments: [{ rent_charge_id: "c", amount_cents: 1000, paid_at: "2026-11-01T04:00:00Z", reversed_at: null }],
    rent_charge_lines: [], property_expenses: []
  };
  vi.doMock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (table: string) => {
    const query = { select: () => query, in: () => query, is: () => query, gte: () => query,
      lt: () => query, lte: () => query,
      then: (resolve: (value: unknown) => void) => Promise.resolve({ data: data[table], error: null }).then(resolve) };
    return query;
  } }) }));
  const { getMonthlyPnLReport } = await import("@/lib/reports-pnl");
  const rows = await getMonthlyPnLReport("owner", 2026);
  expect(rows.find((row) => row.month === "2026-10")?.rentalIncome).toBe(1000);
  expect(rows.find((row) => row.month === "2026-11")?.rentalIncome).toBe(0);
  vi.doUnmock("@/lib/reports-rent-roll");
  vi.doUnmock("@/lib/supabase/admin");
});

it("R1/R3 wallet reads September and buckets an early UTC November payment in October", async () => {
  vi.resetModules();
  const rentQuery = vi.fn(async () => ({
    units: [{ id: "u", property_id: "p" }],
    leases: [{ id: "l", unit_id: "u", grace_period_days: 0 }],
    charges: [{ id: "c", lease_id: "l", category: "rent", due_date: "2026-10-01",
      amount_cents: 1000, status: "paid", deleted_at: null }],
    payments: [{ id: "pay", rent_charge_id: "c", amount_cents: 1000,
      paid_at: "2026-11-01T04:00:00Z", reversed_at: null }]
  }));
  const expenseStart = vi.fn();
  vi.doMock("@/lib/property-access", () => ({ getAdministeredProperties: async () =>
    [{ id: "p", ownerAccountId: "a" }] }));
  vi.doMock("@/lib/portfolio", () => ({ getPortfolioData: async () => ({
    properties: [{ id: "p", name: "Home", ownerAccountName: "Owner", city: "Denver", state: "CO",
      addressLine1: "1 Main" }], leases: []
  }) }));
  vi.doMock("@/lib/ownership", () => ({ getOwnershipAccountsForUser: async () =>
    [{ id: "a", displayName: "Owner", accountType: "individual" }] }));
  vi.doMock("@/lib/owner-rent-rows", () => ({ loadRentRowsForProperties: rentQuery }));
  vi.doMock("@/lib/account-tasks", () => ({ countMyDueTasks: async () => 0 }));
  vi.doMock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (table: string) => {
    const query = { select: () => query, in: () => query, eq: () => query, not: () => query,
      gte: (column: string, value: string) => { if (table === "property_expenses") expenseStart(column, value); return query; },
      lt: () => query,
      then: (resolve: (value: unknown) => void) => Promise.resolve({
        data: table === "property_expenses" ? [
          { id: "sep", property_id: "p", category: "repair", description: "September",
            amount_cents: 100, expense_date: "2026-09-01" },
          { id: "aug", property_id: "p", category: "repair", description: "August",
            amount_cents: 100, expense_date: "2026-08-31" }
        ] : [], error: null, count: 0
      }).then(resolve) };
    return query;
  } }) }));
  const { loadOwnerWalletHome } = await import("@/lib/owner-wallet-home");
  const result = await loadOwnerWalletHome("owner", E);
  expect(expenseStart).toHaveBeenCalledWith("expense_date", "2026-01-01");
  expect(result).toMatchObject({ ok: true, yearRentReceivedByPropertyId: { p: 1000 } });
  if (result.ok) {
    expect(result.homes[0].leftCents).toBe(1000);
    expect(result.recent.map((item) => item.id)).toEqual(["pay", "sep"]);
  }
  for (const moduleName of ["@/lib/property-access", "@/lib/portfolio", "@/lib/ownership",
    "@/lib/owner-rent-rows", "@/lib/account-tasks", "@/lib/supabase/admin"]) vi.doUnmock(moduleName);
});

it("R2/R3 owner YTD uses 2026 and includes an early UTC January payment", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(Y);
  vi.resetModules();
  const rentQuery = vi.fn(async () => ({ units: [{ id: "u", property_id: "p" }],
    leases: [{ id: "l", unit_id: "u" }],
    charges: [{ id: "c", lease_id: "l", category: "rent", status: "paid", deleted_at: null }],
    payments: [{ id: "pay", rent_charge_id: "c", amount_cents: 1000,
      paid_at: "2027-01-01T05:00:00Z", reversed_at: null }] }));
  vi.doMock("@/lib/auth", () => ({ getAuthenticatedUser: async () => ({ id: "owner" }),
    getCurrentUserRole: async () => "owner" }));
  vi.doMock("@/lib/property-access", () => ({ getAdministeredProperties: async () =>
    [{ id: "p", ownerAccountId: "a" }] }));
  vi.doMock("@/lib/ownership", () => ({ getOwnershipAccountsForUser: async () =>
    [{ id: "a" }] }));
  vi.doMock("@/lib/owner-rent-rows", () => ({ loadRentRowsForProperties: rentQuery }));
  vi.doMock("@/lib/charge-lines", () => ({ getChargeLines: async () => [] }));
  const { loadOwnerYearRentReceived } = await import("@/lib/owner-ytd");
  expect(await loadOwnerYearRentReceived()).toEqual({ ok: true, byPropertyId: { p: 1000 } });
  expect(rentQuery).toHaveBeenCalledWith(["p"], "2025-12-31", "2027-01-02");
  for (const moduleName of ["@/lib/auth", "@/lib/property-access", "@/lib/ownership",
    "@/lib/owner-rent-rows", "@/lib/charge-lines"]) vi.doUnmock(moduleName);
});
