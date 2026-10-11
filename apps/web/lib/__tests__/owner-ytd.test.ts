import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadHomeMoney } from "@/lib/home-money";
import { loadOwnerYearRentReceived } from "@/lib/owner-ytd";
import { selectedRentReceivedCents } from "@/lib/rent-received";
import { resolveMoneySelection } from "@/app/owner/money/resolve";

const fixture = vi.hoisted(() => ({
  rows: {} as Record<string, Array<Record<string, unknown>>>,
  properties: [
    { id: "home-a", ownerAccountId: "account-a" },
    { id: "home-b", ownerAccountId: "account-a" }
  ],
  failedPage: -1
}));
vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: async () => ({ id: "owner" }), getCurrentUserRole: async () => "owner"
}));
vi.mock("@/lib/ownership", () => ({
  getOwnershipAccountsForUser: async () => [{ id: "account-a" }]
}));
vi.mock("@/lib/property-access", () => ({
  getAdministeredProperties: async () => fixture.properties,
  canUserAdministerProperty: async (_user: string, id: string) => fixture.properties.some((row) => row.id === id)
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (table: string) => {
  const filters: Array<(row: Record<string, unknown>) => boolean> = [];
  let start = 0, end = Number.MAX_SAFE_INTEGER, orderBy = "id";
  const result = () => {
    if (table === "payments" && start === fixture.failedPage) return { data: null, error: { message: "page failed" } };
    const data = (fixture.rows[table] ?? []).filter((row) => filters.every((filter) => filter(row)))
      .sort((a, b) => String(a[orderBy] ?? "").localeCompare(String(b[orderBy] ?? "")))
      .slice(start, end + 1);
    return { data, error: null };
  };
  const builder = {
    select: () => builder,
    eq: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return builder; },
    in: (key: string, values: unknown[]) => { filters.push((row) => values.includes(row[key])); return builder; },
    is: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return builder; },
    gte: (key: string, value: unknown) => { filters.push((row) => String(row[key]) >= String(value)); return builder; },
    lt: (key: string, value: unknown) => { filters.push((row) => String(row[key]) < String(value)); return builder; },
    order: (key: string) => { orderBy = key; return builder; },
    range: (from: number, to: number) => { start = from; end = to; return builder; },
    maybeSingle: async () => ({ data: result().data?.[0] ?? null, error: result().error }),
    then: (resolve: (value: unknown) => void) => Promise.resolve(result()).then(resolve)
  };
  return builder;
} }) }));

const payment = (id: string, charge: string, cents: number, paidAt: string, reversedAt: string | null = null) => ({
  id, rent_charge_id: charge, amount_cents: cents, paid_at: paidAt, reversed_at: reversedAt,
  method: "ach", stripe_payment_intent_id: null
});
const range = resolveMoneySelection(["home-a"], "home-a", "year",
  new Date("2026-10-11T12:00:00Z")).range;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-11T12:00:00Z"));
  fixture.failedPage = -1;
  fixture.properties = [
    { id: "home-a", ownerAccountId: "account-a" },
    { id: "home-b", ownerAccountId: "account-a" }
  ];
  fixture.rows = {
    properties: [{ id: "home-a", name: "A" }, { id: "home-b", name: "B" }],
    units: [{ id: "unit-a", property_id: "home-a" }, { id: "unit-b", property_id: "home-b" }],
    leases: [
      { id: "lease-a1", unit_id: "unit-a", tenant_profile_id: null, grace_period_days: 4, active: true },
      { id: "lease-a2", unit_id: "unit-a", tenant_profile_id: null, grace_period_days: 4, active: false },
      { id: "lease-b", unit_id: "unit-b", tenant_profile_id: null, grace_period_days: 4, active: true }
    ],
    rent_charges: [
      { id: "rent-a1", lease_id: "lease-a1", category: "rent", deleted_at: null },
      { id: "rent-a2", lease_id: "lease-a2", category: "rent", deleted_at: null },
      { id: "rent-b", lease_id: "lease-b", category: "rent", deleted_at: null },
      { id: "deleted", lease_id: "lease-a1", category: "rent", deleted_at: "2026-04-01" },
      { id: "fee", lease_id: "lease-a1", category: "late_fee", deleted_at: null }
    ],
    payments: [
      payment("jan", "rent-a1", 10000, "2026-01-02"),
      payment("partial", "rent-a1", 5000, "2026-10-03"),
      payment("old-lease", "rent-a2", 7000, "2026-06-01"),
      payment("other-home", "rent-b", 8000, "2026-09-01"),
      payment("dec-before", "rent-a1", 9000, "2025-12-31"),
      payment("future-this-year", "rent-a1", 3000, "2026-12-20"),
      payment("next-year", "rent-a1", 1000, "2027-01-01"),
      payment("reversed", "rent-a1", 1200, "2026-03-01", "2026-03-02"),
      payment("deleted-pay", "deleted", 6000, "2026-04-01"),
      payment("fee-pay", "fee", 1500, "2026-05-01")
    ],
    profiles: [], property_expenses: [], bank_transactions: [], bank_accounts: []
  };
});

describe("owner year rent received", () => {
  it("matches Money This year for one home, several homes and selected Show homes", async () => {
    const home = await loadOwnerYearRentReceived("account-a");
    expect(home).toEqual({ ok: true, byPropertyId: { "home-a": 26500, "home-b": 8000 } });
    const moneyA = await loadHomeMoney("owner", "home-a", range);
    const moneyB = await loadHomeMoney("owner", "home-b", range);
    expect(moneyA?.totals.inCents).toBe(26500);
    expect(moneyB?.totals.inCents).toBe(8000);
    if (home.ok) {
      expect(selectedRentReceivedCents(home.byPropertyId)).toBe(
        moneyA!.totals.inCents + moneyB!.totals.inCents);
      expect(selectedRentReceivedCents(home.byPropertyId, new Set(["home-b"]))).toBe(moneyB!.totals.inCents);
    }
  });

  it("counts every payment beyond a 1000-row page", async () => {
    fixture.rows.payments = Array.from({ length: 1005 }, (_, index) =>
      payment(`payment-${String(index).padStart(4, "0")}`, "rent-a1", 123, "2026-05-01"));
    const result = await loadOwnerYearRentReceived("account-a");
    expect(result).toEqual({ ok: true, byPropertyId: { "home-a": 123615, "home-b": 0 } });
    expect((await loadHomeMoney("owner", "home-a", range))?.totals.inCents).toBe(123615);
  });

  it("fails completely when the second payments page fails", async () => {
    fixture.rows.payments = Array.from({ length: 1005 }, (_, index) =>
      payment(`payment-${String(index).padStart(4, "0")}`, "rent-a1", 100, "2026-05-01"));
    fixture.failedPage = 1000;
    expect(await loadOwnerYearRentReceived("account-a")).toEqual({ ok: false, error: "load_failed" });
  });

  it("returns zero for no rent and an empty authorized list", async () => {
    fixture.rows.payments = [];
    expect(await loadOwnerYearRentReceived("account-a")).toEqual({
      ok: true, byPropertyId: { "home-a": 0, "home-b": 0 }
    });
    fixture.properties = [];
    expect(await loadOwnerYearRentReceived("account-a")).toEqual({ ok: true, byPropertyId: {} });
  });

  it("returns no homes from an account the owner does not own", async () => {
    expect(await loadOwnerYearRentReceived("account-other")).toEqual({ ok: true, byPropertyId: {} });
  });
});
