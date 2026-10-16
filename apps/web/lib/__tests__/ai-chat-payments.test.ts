import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ payments: [] as Array<Record<string, unknown>>, calls: [] as string[] }));
vi.mock("@/lib/property-access", () => ({
  getAdministeredPropertyIds: async () => ["property-1"],
  getAdministeredPropertyIdsForAccount: async () => ["property-1"]
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (table: string) => {
  const rows: Record<string, Array<Record<string, unknown>>> = {
    units: [{ id: "unit-1", property_id: "property-1" }],
    leases: [{ id: "lease-1", unit_id: "unit-1", tenant_profile_id: "tenant-1" }],
    rent_charges: [{ id: "charge-1", lease_id: "lease-1" }],
    profiles: [{ id: "tenant-1", full_name: "Tenant", email: null }]
  };
  const filters: Array<(row: Record<string, unknown>) => boolean> = [];
  let cap = Infinity;
  const result = () => ({ data: (table === "payments" ? state.payments : rows[table] ?? [])
    .filter((row) => filters.every((filter) => filter(row)))
    .sort((a, b) => String(b.paid_at).localeCompare(String(a.paid_at))).slice(0, cap), error: null });
  const builder = {
    select: () => builder,
    in: (key: string, ids: unknown[]) => { filters.push((row) => ids.includes(row[key])); return builder; },
    gte: () => builder,
    is: (key: string, value: unknown) => { if (table === "payments") state.calls.push(`is:${key}`);
      filters.push((row) => row[key] === value); return builder; },
    order: () => builder,
    limit: (value: number) => { if (table === "payments") state.calls.push(`limit:${value}`);
      cap = value; return builder; },
    then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve)
  };
  return builder;
} }) }));

import { getRecentPaymentsForAi } from "@/lib/ai-recent-payments";

describe("AI recent payments", () => {
  it("filters eleven newer reversed rows before the ten-payment cap", async () => {
    const now = Date.now();
    state.calls = [];
    state.payments = [
      ...Array.from({ length: 11 }, (_, index) => ({ rent_charge_id: "charge-1", amount_cents: 1000,
        paid_at: new Date(now - index * 1000).toISOString(), reversed_at: "2026-10-15" })),
      { rent_charge_id: "charge-1", amount_cents: 2000,
        paid_at: new Date(now - 100000).toISOString(), reversed_at: null },
      { rent_charge_id: "charge-1", amount_cents: 3000,
        paid_at: new Date(now - 200000).toISOString(), reversed_at: null }
    ];
    const result = await getRecentPaymentsForAi("owner-1");
    expect(result.map((payment) => payment.amountCents)).toEqual([2000, 3000]);
    expect(state.calls).toEqual(["is:reversed_at", "limit:10"]);
  });
});
