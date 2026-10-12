import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  administered: vi.fn(), portfolio: vi.fn(), accounts: vi.fn(), rentRows: vi.fn(), money: vi.fn(),
  expenses: vi.fn(), inIds: vi.fn(), gte: vi.fn(), lt: vi.fn()
}));
vi.mock("@/lib/property-access", () => ({ getAdministeredProperties: mocks.administered }));
vi.mock("@/lib/portfolio", () => ({ getPortfolioData: mocks.portfolio }));
vi.mock("@/lib/ownership", () => ({ getOwnershipAccountsForUser: mocks.accounts }));
vi.mock("@/lib/owner-rent-rows", () => ({ loadRentRowsForProperties: mocks.rentRows }));
vi.mock("@/lib/owner-recent-activity", () => ({ loadOwnerHomeMoney: mocks.money }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => ({
  select: () => ({ in: mocks.inIds })
}) }) }));
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
  mocks.money.mockResolvedValue({ ok: true, leftByPropertyId: { p1: 75000, p2: -4000 }, items: [] });
  mocks.expenses.mockResolvedValue({ data: [
    { property_id: "p1", amount_cents: 25000, expense_date: "2026-10-02" },
    { property_id: "p2", amount_cents: 4000, expense_date: "2026-09-02" }
  ], error: null });
  mocks.inIds.mockImplementation(() => ({ gte: mocks.gte }));
  mocks.gte.mockImplementation(() => ({ lt: mocks.lt }));
  mocks.lt.mockImplementation(() => mocks.expenses());
});

describe("loadOwnerWalletHome", () => {
  it("returns homes from two accounts with account names", async () => {
    const result = await loadOwnerWalletHome("owner", today);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.homes.map((home) => home.accountName)).toEqual(["Personal", "J&MSP"]);
  });
  it("uses this month's received rent minus expenses for each home", async () => {
    const result = await loadOwnerWalletHome("owner", today);
    if (result.ok) expect(result.homes.map((home) => home.leftCents)).toEqual([75000, -4000]);
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
    expect(mocks.money).toHaveBeenCalledWith(["p1", "p2"], today);
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
});
