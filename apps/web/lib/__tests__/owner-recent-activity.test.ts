import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildHomeMoney, loadOwnerHomeMoney } from "@/lib/owner-recent-activity";

const { rentRows, tableData } = vi.hoisted(() => ({
  rentRows: vi.fn(), tableData: new Map<string, { data: unknown; error: unknown }>()
}));
vi.mock("@/lib/owner-rent-rows", () => ({ loadRentRowsForProperties: rentRows }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (table: string) => {
  const query = { select: () => query, in: () => query, gte: () => query, lt: () => query,
    then: (resolve: (value: unknown) => void) => Promise.resolve(tableData.get(table) ?? { data: [], error: null }).then(resolve) };
  return query;
} }) }));

beforeEach(() => {
  tableData.clear();
  rentRows.mockReset();
  rentRows.mockResolvedValue({
    units: [{ id: "u1", property_id: "p1" }, { id: "u2", property_id: "p2" }],
    leases: [{ id: "l1", unit_id: "u1", tenant_profile_id: "t1" },
      { id: "l2", unit_id: "u2", tenant_profile_id: "t2" }],
    charges: [{ id: "c1", lease_id: "l1", category: "rent", deleted_at: null },
      { id: "c2", lease_id: "l2", category: "rent", deleted_at: null }],
    payments: [{ id: "pay1", rent_charge_id: "c1", amount_cents: 100000, paid_at: "2026-10-05", reversed_at: null },
      { id: "pay2", rent_charge_id: "c2", amount_cents: 200000, paid_at: "2026-10-06", reversed_at: null }]
  });
  tableData.set("property_expenses", { data: [
    { id: "e1", property_id: "p1", category: "repair", description: "Plumber", amount_cents: 25000, expense_date: "2026-10-07" },
    { id: "e2", property_id: "p2", category: "insurance", description: "Insurance", amount_cents: 204000, expense_date: "2026-10-08" }
  ], error: null });
  tableData.set("properties", { data: [{ id: "p1", name: "Aspen" }, { id: "p2", name: "Zenith" }], error: null });
  tableData.set("profiles", { data: [{ id: "t1", full_name: "Angel" }, { id: "t2", full_name: "Maya" }], error: null });
});

describe("loadOwnerHomeMoney", () => {
  it("batches all homes and computes current-month collected minus expenses per home", async () => {
    const result = await loadOwnerHomeMoney(["p1", "p2"], new Date("2026-10-11T00:00:00Z"));
    expect(rentRows).toHaveBeenCalledOnce();
    expect(rentRows).toHaveBeenCalledWith(["p1", "p2"], "2026-08-31", "2026-11-02");
    expect(result).toMatchObject({ ok: true, leftByPropertyId: { p1: 75000, p2: -4000 } });
    if (result.ok) expect(result.items.map((item) => item.title)).toEqual(["Insurance", "Plumber", "Rent from Maya", "Rent from Angel"]);
  });
  it("fails closed if a money source fails", async () => {
    tableData.set("property_expenses", { data: null, error: { message: "offline" } });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await loadOwnerHomeMoney(["p1"], new Date("2026-10-11T00:00:00Z")))
      .toEqual({ ok: false, error: "load_failed" });
    spy.mockRestore();
  });
});

describe("buildHomeMoney", () => {
  it("computes monthly left and the five newest recent items with tenant fallback", () => {
    const payments = Array.from({ length: 6 }, (_, index) => ({ id: `pay${index}`, rent_charge_id: "c1",
      amount_cents: 1000, paid_at: `2026-10-0${index + 1}`, reversed_at: null,
      method: null, stripe_payment_intent_id: null }));
    const result = buildHomeMoney({ ids: ["p1"], today: new Date("2026-10-11T00:00:00Z"),
      rentRows: { units: [{ id: "u1", property_id: "p1" }], leases: [{ id: "l1", unit_id: "u1",
        tenant_profile_id: "t1", grace_period_days: 0, active: true }],
      charges: [{ id: "c1", lease_id: "l1", category: "rent", amount_cents: 6000,
        due_date: "2026-10-01", status: "paid", deleted_at: null }], payments },
      expenses: [{ id: "e1", property_id: "p1", category: "repair", description: "Plumber · invoice",
        amount_cents: 1500, expense_date: "2026-10-07" }], propertyNames: { p1: "Aspen" },
      tenantNameByLeaseId: new Map([["l1", "Tenant"]]) });
    expect(result).toMatchObject({ ok: true, leftByPropertyId: { p1: 4500 } });
    if (result.ok) {
      expect(result.items.map((item) => item.id)).toEqual(["e1", "pay5", "pay4", "pay3", "pay2"]);
      expect(result.items[0]).toMatchObject({ title: "Plumber", amountCents: 1500, direction: "out",
        propertyName: "Aspen" });
      expect(result.items[1]).toMatchObject({ title: "Rent from Tenant", direction: "in" });
    }
  });
});
