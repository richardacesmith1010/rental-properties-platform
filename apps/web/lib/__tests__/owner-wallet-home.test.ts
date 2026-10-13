import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  administered: vi.fn(), portfolio: vi.fn(), accounts: vi.fn(), rentRows: vi.fn(),
  expenses: vi.fn(), inIds: vi.fn(), gte: vi.fn(), lt: vi.fn(), from: vi.fn()
}));
vi.mock("@/lib/property-access", () => ({ getAdministeredProperties: mocks.administered }));
vi.mock("@/lib/portfolio", () => ({ getPortfolioData: mocks.portfolio }));
vi.mock("@/lib/ownership", () => ({ getOwnershipAccountsForUser: mocks.accounts }));
vi.mock("@/lib/owner-rent-rows", () => ({ loadRentRowsForProperties: mocks.rentRows }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }));
import { loadOwnerWalletHome } from "@/lib/owner-wallet-home";

const today = new Date("2026-10-11T12:00:00Z");
const homes = [
  { id: "p1", name: "First", city: "Denver", state: "CO", addressLine1: "1 Main St", ownerAccountName: "Personal" },
  { id: "p2", name: "Second", city: "Boulder", state: "CO", addressLine1: "2 Main St", ownerAccountName: "J&MSP" }
];
const rentRows = () => ({ units: [{ id: "u1", property_id: "p1" }, { id: "u2", property_id: "p2" }],
  leases: [{ id: "l1", unit_id: "u1", grace_period_days: 4 }, { id: "l2", unit_id: "u2", grace_period_days: 0 }],
  charges: [{ id: "c1", lease_id: "l1", category: "rent", amount_cents: 100000,
    status: "pending", due_date: "2026-10-10", deleted_at: null },
    { id: "c2", lease_id: "l2", category: "rent", amount_cents: 50000,
      status: "pending", due_date: "2026-10-12", deleted_at: null },
    { id: "c3", lease_id: "l2", category: "rent", amount_cents: 50000,
      status: "paid", due_date: "2026-10-01", deleted_at: null }],
  payments: [{ id: "pay1", rent_charge_id: "c1", amount_cents: 100000, paid_at: "2026-10-01", reversed_at: null },
    { id: "pay2", rent_charge_id: "c2", amount_cents: 50000, paid_at: "2026-09-01", reversed_at: null }] });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.administered.mockResolvedValue([{ id: "p1", ownerAccountId: "a1" }, { id: "p2", ownerAccountId: "a2" }]);
  mocks.accounts.mockResolvedValue([{ id: "a1", displayName: "Personal", accountType: "individual" },
    { id: "a2", displayName: "J&MSP", accountType: "llc" }]);
  mocks.portfolio.mockResolvedValue({ properties: homes, leases: [
    { id: "l1", propertyId: "p1", unitId: "u1", tenantName: "Maya", active: true,
      monthlyRentCents: 100000, dueDayOfMonth: 1, startDate: "2025-01-01", endDate: "2028-01-01" }
  ] });
  mocks.rentRows.mockResolvedValue(rentRows());
  mocks.expenses.mockResolvedValue({ data: [
    { id: "e1", property_id: "p1", category: "repair", description: "Plumber", amount_cents: 25000,
      expense_date: "2026-10-02" },
    { id: "e2", property_id: "p2", category: "repair", description: "Roof", amount_cents: 4000,
      expense_date: "2026-09-02" }
  ], error: null });
  mocks.from.mockImplementation((table: string) => {
    const query = { select: () => query, in: mocks.inIds, gte: mocks.gte, lt: mocks.lt,
      not: () => query, then: (resolve: (value: unknown) => void) => Promise.resolve(
        table === "property_expenses" ? mocks.expenses() : { data: [], error: null, count: 0 }).then(resolve) };
    mocks.inIds.mockReturnValue(query);
    mocks.gte.mockReturnValue(query);
    mocks.lt.mockReturnValue(query);
    return query;
  });
});

describe("loadOwnerWalletHome", () => {
  it("returns homes from two accounts with account names", async () => {
    const result = await loadOwnerWalletHome("owner", today);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.homes.map((home) => home.accountName)).toEqual(["Personal", "J&MSP"]);
  });
  it("uses this month's received rent minus expenses for each home", async () => {
    const result = await loadOwnerWalletHome("owner", today);
    if (result.ok) expect(result.homes.map((home) => home.leftCents)).toEqual([75000, 0]);
  });
  it("sums year rent and expenses across accounts", async () => {
    const result = await loadOwnerWalletHome("owner", today);
    if (result.ok) expect(result.ytd).toEqual({ inCents: 150000, outCents: 29000 });
  });
  it("does not mark a pending charge due before today late", async () => {
    const result = await loadOwnerWalletHome("owner", today);
    if (result.ok) expect(result.homes.map((home) => home.isLate)).toEqual([false, false]);
  });
  it("marks a late charge on a tracked lease late", async () => {
    const rows = rentRows();
    rows.charges[0].status = "late";
    mocks.rentRows.mockResolvedValue(rows);
    const result = await loadOwnerWalletHome("owner", today);
    if (result.ok) expect(result.homes[0].isLate).toBe(true);
  });
  it("does not mark a late charge on an outside-Domus lease late", async () => {
    mocks.portfolio.mockResolvedValue({ properties: homes, leases: [
      { id: "l1", propertyId: "p1", unitId: "u1", tenantName: "Maya", active: true,
        monthlyRentCents: 100000, dueDayOfMonth: 1, startDate: "2025-01-01", endDate: "2028-01-01",
        collectsOutsideDomus: true }
    ] });
    const rows = rentRows();
    rows.charges[0].status = "late";
    mocks.rentRows.mockResolvedValue(rows);
    const result = await loadOwnerWalletHome("owner", today);
    if (result.ok) expect(result.homes[0].isLate).toBe(false);
  });
  it("fails closed when a query reports an error", async () => {
    mocks.expenses.mockResolvedValue({ data: null, error: { message: "broken" } });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await loadOwnerWalletHome("owner", today)).toEqual({ ok: false, error: "load_failed" });
    vi.restoreAllMocks();
  });
  it("queries only ids returned by administered properties", async () => {
    await loadOwnerWalletHome("owner", today);
    expect(mocks.inIds).toHaveBeenCalledWith("property_id", ["p1", "p2"]);
    expect(mocks.portfolio).toHaveBeenCalledWith("owner", null, ["p1", "p2"]);
    expect(mocks.rentRows).toHaveBeenCalledWith(["p1", "p2"], "2026-01-01", "2027-01-01");
    expect(mocks.rentRows).toHaveBeenCalledTimes(1);
    expect(mocks.from).not.toHaveBeenCalledWith("profiles");
    expect(mocks.from).not.toHaveBeenCalledWith("properties");
  });
  it("4a counts grace-day payment and excludes payment after grace", async () => {
    const rows = rentRows();
    rows.payments[0].paid_at = "2026-10-14";
    mocks.rentRows.mockResolvedValue(rows);
    const onTime = await loadOwnerWalletHome("owner", new Date("2026-10-20T12:00:00Z"));
    if (onTime.ok) expect(onTime.homes[0].rentOnTimeThisYear).toBe(1);
    rows.payments[0].paid_at = "2026-10-15";
    const late = await loadOwnerWalletHome("owner", new Date("2026-10-20T12:00:00Z"));
    if (late.ok) expect(late.homes[0].rentOnTimeThisYear).toBe(0);
  });
  it("4b future due rent is not counted", async () => {
    const result = await loadOwnerWalletHome("owner", today);
    if (result.ok) expect(result.homes[1].rentDueThisYear).toBe(1);
  });

  it("starts bank and charge-line reads before rent rows finish", async () => {
    let release!: (rows: ReturnType<typeof rentRows>) => void;
    mocks.rentRows.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    const loading = loadOwnerWalletHome("owner", today);
    await vi.waitFor(() => {
      expect(mocks.from).toHaveBeenCalledWith("bank_transactions");
      expect(mocks.from).toHaveBeenCalledWith("rent_charge_lines");
    });
    expect(mocks.rentRows).toHaveBeenCalledOnce();
    release(rentRows());
    expect((await loading).ok).toBe(true);
  });

  it("includes prior December in January recent, while year totals start in January", async () => {
    mocks.rentRows.mockResolvedValue({ units: [{ id: "u1", property_id: "p1" }],
      leases: [{ id: "l1", unit_id: "u1", tenant_profile_id: "t1", grace_period_days: 0, active: true }],
      charges: [{ id: "c1", lease_id: "l1", category: "rent", amount_cents: 10000,
        due_date: "2027-01-01", status: "paid", deleted_at: null }],
      payments: [
        { id: "dec", rent_charge_id: "c1", amount_cents: 4000, paid_at: "2026-12-30", reversed_at: null },
        { id: "jan", rent_charge_id: "c1", amount_cents: 6000, paid_at: "2027-01-03", reversed_at: null }
      ] });
    mocks.expenses.mockResolvedValue({ data: [
      { id: "dec-exp", property_id: "p1", category: "repair", description: "December repair",
        amount_cents: 1000, expense_date: "2026-12-31" },
      { id: "jan-exp", property_id: "p1", category: "repair", description: "January repair",
        amount_cents: 2000, expense_date: "2027-01-04" }
    ], error: null });
    const result = await loadOwnerWalletHome("owner", new Date("2027-01-10T12:00:00Z"));
    expect(mocks.rentRows).toHaveBeenCalledWith(["p1", "p2"], "2026-12-01", "2028-01-01");
    if (result.ok) {
      expect(result.homes[0].leftCents).toBe(4000);
      expect(result.ytd).toEqual({ inCents: 6000, outCents: 2000 });
      expect(result.yearRentReceivedByPropertyId).toEqual({ p1: 6000, p2: 0 });
      expect(result.recent.map((item) => item.id)).toEqual(["jan-exp", "jan", "dec-exp", "dec"]);
    }
  });

  it("keeps month, year, and recent parity with one rent pass under the query budget", async () => {
    const rows: Record<string, Record<string, unknown>[]> = {
      units: [{ id: "u1", property_id: "p1" }, { id: "u2", property_id: "p2" }],
      leases: [{ id: "l1", unit_id: "u1", tenant_profile_id: "t1", grace_period_days: 4, active: true },
        { id: "l2", unit_id: "u2", tenant_profile_id: "t2", grace_period_days: 0, active: true }],
      rent_charges: [
        { id: "c1", lease_id: "l1", category: "rent", amount_cents: 100000, due_date: "2026-10-01",
          status: "paid", deleted_at: null },
        { id: "c2", lease_id: "l2", category: "rent", amount_cents: 50000, due_date: "2026-09-01",
          status: "late", deleted_at: null },
        { id: "c3", lease_id: "l1", category: "late_fee", amount_cents: 5000, due_date: "2026-09-01",
          status: "paid", deleted_at: null }],
      payments: [
        { id: "pay1", rent_charge_id: "c1", amount_cents: 100000, paid_at: "2026-10-04", reversed_at: null },
        { id: "pay2", rent_charge_id: "c2", amount_cents: 50000, paid_at: "2026-09-10", reversed_at: null },
        { id: "pay3", rent_charge_id: "c3", amount_cents: 5000, paid_at: "2026-09-11", reversed_at: null }],
      property_expenses: [
        { id: "e1", property_id: "p1", category: "repair", description: "Plumber · invoice",
          amount_cents: 20000, expense_date: "2026-10-05" },
        { id: "e2", property_id: "p2", category: "tax", description: null,
          amount_cents: 4000, expense_date: "2026-09-12" },
        { id: "e3", property_id: "p1", category: "insurance", description: null,
          amount_cents: 3000, expense_date: "2026-02-01" }],
      rent_charge_lines: [{ id: "line1", lease_id: "l1", charge_id: "c1", kind: "utility",
        label: "Water", amount_cents: 10000, created_at: "2026-10-01" }],
      bank_review_items: [], bank_transactions: [], bank_connections: []
    };
    mocks.portfolio.mockResolvedValue({ properties: homes, leases: [
      { id: "l1", propertyId: "p1", tenantName: "Maya", active: true, monthlyRentCents: 100000,
        dueDayOfMonth: 1, startDate: "2025-01-01", endDate: "2028-01-01" },
      { id: "l2", propertyId: "p2", tenantName: "Angel", active: true, monthlyRentCents: 50000,
        dueDayOfMonth: 1, startDate: "2025-01-01", endDate: "2028-01-01" }
    ] });
    const queried: string[] = [];
    mocks.from.mockImplementation((table: string) => {
      queried.push(table);
      let selected = rows[table] ?? [];
      const query = {
        select: () => query, order: () => query, range: () => query, is: () => query, not: () => query,
        in: (column: string, values: string[]) => {
          if (column !== "bank_accounts.owner_account_id") selected = selected.filter((row) => values.includes(String(row[column])));
          return query;
        },
        gte: (column: string, value: string) => { selected = selected.filter((row) => String(row[column]) >= value); return query; },
        lt: (column: string, value: string) => { selected = selected.filter((row) => String(row[column]) < value); return query; },
        then: (resolve: (value: unknown) => void) => Promise.resolve({ data: selected, error: null, count: 0 }).then(resolve)
      };
      return query;
    });
    const actual = await vi.importActual<typeof import("@/lib/owner-rent-rows")>("@/lib/owner-rent-rows");
    mocks.rentRows.mockImplementation(actual.loadRentRowsForProperties);
    const result = await loadOwnerWalletHome("owner", today);
    expect(result.ok).toBe(true);
    expect(queried.length).toBeLessThanOrEqual(14);
    expect(queried.filter((table) => table === "units")).toHaveLength(1);
    expect(queried).not.toContain("profiles");
    expect(queried).not.toContain("properties");
    if (result.ok) {
      expect(result.homes.map((home) => ({ left: home.leftCents, late: home.isLate,
        due: home.rentDueThisYear, onTime: home.rentOnTimeThisYear }))).toEqual([
        { left: 80000, late: false, due: 1, onTime: 1 },
        { left: 0, late: true, due: 1, onTime: 0 }
      ]);
      expect(result.ytd).toEqual({ inCents: 145000, outCents: 27000 });
      expect(result.yearRentReceivedByPropertyId).toEqual({ p1: 95000, p2: 50000 });
      expect(result.recent.map(({ id, title, amountCents, direction, propertyName }) =>
        ({ id, title, amountCents, direction, propertyName }))).toEqual([
        { id: "e1", title: "Plumber", amountCents: 20000, direction: "out", propertyName: "First" },
        { id: "pay1", title: "Rent from Maya", amountCents: 100000, direction: "in", propertyName: "First" },
        { id: "e2", title: "tax", amountCents: 4000, direction: "out", propertyName: "Second" },
        { id: "pay3", title: "Rent from Maya", amountCents: 5000, direction: "in", propertyName: "First" },
        { id: "pay2", title: "Rent from Angel", amountCents: 50000, direction: "in", propertyName: "Second" }
      ]);
    }
  });
});
