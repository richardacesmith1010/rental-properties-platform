import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  administered: vi.fn(), portfolio: vi.fn(), accounts: vi.fn(), rentRows: vi.fn(), expenses: vi.fn(),
  countTasks: vi.fn(), from: vi.fn(), measurePerf: vi.fn()
}));

vi.mock("@/lib/property-access", () => ({ getAdministeredProperties: mocks.administered }));
vi.mock("@/lib/portfolio", () => ({ getPortfolioData: mocks.portfolio }));
vi.mock("@/lib/ownership", () => ({ getOwnershipAccountsForUser: mocks.accounts }));
vi.mock("@/lib/owner-rent-rows", () => ({ loadRentRowsForProperties: mocks.rentRows }));
vi.mock("@/lib/account-tasks", () => ({ countMyDueTasks: mocks.countTasks }));
vi.mock("@/lib/logger", () => ({ measurePerf: mocks.measurePerf }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }));

import { loadOwnerWalletHome } from "@/lib/owner-wallet-home";

const today = new Date("2026-10-11T12:00:00Z");
const properties = [{ id: "p1", ownerAccountId: "a1" }];
const accounts = [{ id: "a1", displayName: "Personal", accountType: "individual" as const }];
const portfolio = {
  properties: [{ id: "p1", name: "Home", city: "Denver", state: "CO", addressLine1: "1 Main St",
    ownerAccountName: "Personal" }],
  leases: [{ id: "l1", propertyId: "p1", tenantName: "Maya", active: true, monthlyRentCents: 100000,
    depositCents: 0,
    dueDayOfMonth: 1, startDate: "2025-01-01", endDate: "2028-01-01" }]
};
const rows = {
  units: [{ id: "u1", property_id: "p1" }],
  leases: [{ id: "l1", unit_id: "u1", grace_period_days: 0 }],
  charges: [], payments: []
};
const expenseRows = { data: [], error: null };
const expenseQuery: {
  select: ReturnType<typeof vi.fn>; in: ReturnType<typeof vi.fn>; gte: ReturnType<typeof vi.fn>;
  lt: ReturnType<typeof vi.fn>; then: (resolve: (value: unknown) => void) => Promise<void>;
} = { select: vi.fn(), in: vi.fn(), gte: vi.fn(), lt: vi.fn(), then: () => Promise.resolve() };
const expectedHome = {
  id: "p1", name: "Home", city: "Denver", state: "CO", accountId: "a1", accountName: "Personal",
  accountType: "individual", addressLine1: "1 Main St", leaseEndDate: "2028-01-01",
  rentDueThisYear: 0, rentOnTimeThisYear: 0,
  activeLeases: [{ tenantNames: ["Maya"], rentCents: 100000, nextDueDate: "2026-11-01" }],
  isLate: false, leftCents: 0, depositCents: 0, depositReturned: false
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.measurePerf.mockImplementation(async (_scope: string, _name: string, work: () => Promise<unknown>) => work());
  mocks.administered.mockResolvedValue(properties);
  mocks.portfolio.mockResolvedValue(portfolio);
  mocks.accounts.mockResolvedValue(accounts);
  mocks.rentRows.mockResolvedValue(rows);
  mocks.countTasks.mockResolvedValue(0);
  expenseQuery.select.mockReturnValue(expenseQuery);
  expenseQuery.in.mockReturnValue(expenseQuery);
  expenseQuery.gte.mockReturnValue(expenseQuery);
  expenseQuery.lt.mockReturnValue(expenseQuery);
  expenseQuery.then = (resolve: (value: unknown) => void) => Promise.resolve(expenseRows).then(resolve);
  mocks.from.mockImplementation((table: string) => table === "property_expenses" ? expenseQuery : {
    select: () => ({ in: () => ({ not: () => Promise.resolve({ data: [], error: null, count: 0 }) }) })
  });
});

describe("loadOwnerWalletHome performance measurements", () => {
  it("measures each of the eight steps once with homes", async () => {
    await loadOwnerWalletHome("owner", today);
    const calls = mocks.measurePerf.mock.calls.map(([scope, name]) => [scope, name]);
    expect(calls).toHaveLength(8);
    expect(calls).toEqual(expect.arrayContaining([
      ["owner", "home.wallet.administered"], ["owner", "home.wallet.portfolio"],
      ["owner", "home.wallet.accounts"], ["owner", "home.wallet.rent-rows"],
      ["owner", "home.wallet.expenses"], ["owner", "home.wallet.bank-needs"],
      ["owner", "home.wallet.charge-lines"], ["owner", "home.wallet.tasks"]
    ]));
  });

  it("measures only the four steps used without homes", async () => {
    mocks.administered.mockResolvedValue([]);
    const result = await loadOwnerWalletHome("owner", today);
    expect(mocks.measurePerf.mock.calls.map(([scope, name]) => [scope, name])).toEqual([
      ["owner", "home.wallet.administered"], ["owner", "home.wallet.accounts"],
      ["owner", "home.wallet.bank-needs"], ["owner", "home.wallet.tasks"]
    ]);
    expect(result).toEqual({ ok: true, homes: [], ytd: { inCents: 0, outCents: 0 }, recent: [],
      yearRentReceivedByPropertyId: {}, bankNeedsCount: 0, hasBankConnection: false,
      hasPendingBankConnection: false, myTasksDueCount: 0 });
  });

  it("returns the fixture-derived wallet object unchanged", async () => {
    expect(await loadOwnerWalletHome("owner", today)).toEqual({
      ok: true, homes: [expectedHome], yearRentReceivedByPropertyId: { p1: 0 },
      ytd: { inCents: 0, outCents: 0 }, recent: [], bankNeedsCount: 0,
      hasBankConnection: false, hasPendingBankConnection: false, myTasksDueCount: 0
    });
  });

  it("starts charge-lines after portfolio resolves and bank-needs after accounts resolve", async () => {
    let resolvePortfolio!: (value: typeof portfolio) => void;
    let resolveAccounts!: (value: typeof accounts) => void;
    mocks.portfolio.mockReturnValue(new Promise((resolve) => { resolvePortfolio = resolve; }));
    mocks.accounts.mockReturnValue(new Promise((resolve) => { resolveAccounts = resolve; }));
    const loading = loadOwnerWalletHome("owner", today);
    await vi.waitFor(() => expect(mocks.measurePerf.mock.calls.map(([, name]) => name))
      .toContain("home.wallet.tasks"));
    expect(mocks.measurePerf.mock.calls.map(([, name]) => name)).not.toContain("home.wallet.bank-needs");
    expect(mocks.measurePerf.mock.calls.map(([, name]) => name)).not.toContain("home.wallet.charge-lines");
    resolveAccounts(accounts);
    await vi.waitFor(() => expect(mocks.measurePerf.mock.calls.map(([, name]) => name))
      .toContain("home.wallet.bank-needs"));
    expect(mocks.measurePerf.mock.calls.map(([, name]) => name)).not.toContain("home.wallet.charge-lines");
    resolvePortfolio(portfolio);
    await loading;
    expect(mocks.measurePerf.mock.calls.map(([, name]) => name)).toContain("home.wallet.charge-lines");
  });
});
