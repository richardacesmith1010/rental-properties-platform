import { beforeEach, describe, expect, it, vi } from "vitest";

const createAdmin = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: createAdmin }));

import { managerFeeBaseForCharge } from "@/lib/charge-lines";
import { getManagerFeeForProperty } from "@/lib/payment-fees";

let lines: Array<{ id: string; lease_id: string; charge_id: string; kind: string;
  label: string; amount_cents: number }>;
let contractualBase: number | null;

beforeEach(() => {
  lines = [];
  contractualBase = null;
  createAdmin.mockImplementation(() => ({ from: (table: string) => {
    if (table === "rent_charge_lines") return { select: () => ({
      in: async () => ({ data: lines, error: null })
    }) };
    if (table === "manager_payment_configs") return { select: () => ({
      in: () => ({ eq: () => ({ order: async () => ({ data: [{
        property_id: "home", manager_profile_id: "manager", payment_type: "percentage",
        percentage_rate: 10, flat_amount_cents: null, base_rent_cents: contractualBase,
        created_at: "2026-01-01"
      }], error: null }) }) })
    }) };
    throw new Error(`Unexpected ${table}`);
  } }));
});

describe("manager fee base §8.6e", () => {
  it("keeps the unlined fallback fee identical", async () => {
    const base = await managerFeeBaseForCharge({ id: "c", amount_cents: 216000 });
    expect(base).toBe(216000);
    expect((await getManagerFeeForProperty("home", base)).feeCents).toBe(21600);
  });
  it("excludes water and applies a credit to rent for fallback fees", async () => {
    lines = [{ id: "w", lease_id: "l", charge_id: "c", kind: "utility",
      label: "Water", amount_cents: 11259 }];
    expect((await getManagerFeeForProperty("home", await managerFeeBaseForCharge({
      id: "c", amount_cents: 227259 }))).feeCents).toBe(21600);
    lines.push({ id: "credit", lease_id: "l", charge_id: "c", kind: "credit",
      label: "Credit", amount_cents: -10494 });
    expect((await getManagerFeeForProperty("home", await managerFeeBaseForCharge({
      id: "c", amount_cents: 216765 }))).feeCents).toBe(20551);
  });
  it("uses the contractual base for unlined, water, and credited bills", async () => {
    contractualBase = 216000;
    for (const amount of [216000, 227259, 216765]) {
      if (amount !== 216000) lines = [{ id: "w", lease_id: "l", charge_id: "c",
        kind: "utility", label: "Water", amount_cents: 11259 }];
      if (amount === 216765) lines.push({ id: "credit", lease_id: "l", charge_id: "c",
        kind: "credit", label: "Credit", amount_cents: -10494 });
      const base = await managerFeeBaseForCharge({ id: "c", amount_cents: amount });
      expect((await getManagerFeeForProperty("home", base)).feeCents).toBe(21600);
    }
  });
});
