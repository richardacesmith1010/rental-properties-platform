import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  role: vi.fn(), ownerIds: vi.fn(), leases: vi.fn(), from: vi.fn()
}));
vi.mock("@/lib/auth", () => ({ getCurrentUserRole: mocks.role }));
vi.mock("@/lib/property-access", () => ({ getOwnerMemberPropertyIds: mocks.ownerIds }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }));
vi.mock("../reports-rent-roll", () => ({
  getLeasesForScope: mocks.leases,
  startOfYear: (year: number) => `${year}-01-01`,
  endOfYear: (year: number) => `${year}-12-31`,
  composePropertyAddress: () => "123 Main",
  buildMonthKeys: () => [], monthKey: () => null
}));

import { getTaxSummaryReport } from "../reports-pnl";
import { dollarsToCents, updatePropertyTaxYearSchema } from "../validations";

function query(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "in", "is", "gte", "lte", "eq"]) chain[method] = () => chain;
  chain.then = (resolve: (value: unknown) => void) => Promise.resolve(result).then(resolve);
  return chain;
}

const ids = ["home-1", "home-2"];
function setup(expenses: object[], inputs: object[], errors: Record<string, unknown> = {}) {
  mocks.role.mockResolvedValue("owner");
  mocks.ownerIds.mockResolvedValue(ids);
  mocks.leases.mockResolvedValue({
    context: {
      propertyIds: ids,
      propertyById: new Map(ids.map((id) => [id, { id, name: id }])),
      unitById: new Map([["unit-1", { propertyId: "home-1" }]])
    },
    leases: [{ id: "lease-1", unit_id: "unit-1" }]
  });
  const data: Record<string, unknown> = {
    rent_charges: [{ id: "charge-1", lease_id: "lease-1" }],
    payments: [{ rent_charge_id: "charge-1", amount_cents: 2_000_000 }],
    property_expenses: expenses,
    property_tax_years: inputs
  };
  mocks.from.mockImplementation((table: string) => query({ data: data[table], error: errors[table] ?? null }));
}

beforeEach(() => vi.clearAllMocks());

describe("tax summary money", () => {
  it("keeps mortgage cash flow out of deductions and uses saved inputs once", async () => {
    setup([
      { property_id: "home-1", category: "mortgage", amount_cents: 1_200_000 },
      { property_id: "home-1", category: "property_tax", amount_cents: 10000 },
      { property_id: "home-1", category: "insurance", amount_cents: 20000 }
    ], [{ property_id: "home-1", mortgage_interest_cents: 700000, escrow_property_tax_cents: 30000,
      escrow_insurance_cents: 40000, depreciation_cents: 50000 }]);
    const [first, second] = await getTaxSummaryReport("owner", 2026);
    expect(first).toMatchObject({ mortgageInterest: 700000, mortgagePaymentsCashFlow: 1200000,
      taxes: 40000, insurance: 60000, depreciation: 50000, totalExpenses: 850000,
      netIncome: 1150000, needsInputs: false });
    expect(second).toMatchObject({ mortgageInterest: 0, mortgagePaymentsCashFlow: 0,
      totalExpenses: 0, needsInputs: false });
  });

  it("flags a mortgage only when no input row exists", async () => {
    setup([{ property_id: "home-1", category: "mortgage", amount_cents: 1200000 }], []);
    expect((await getTaxSummaryReport("owner", 2026))[0]).toMatchObject({
      mortgageInterest: 0, mortgagePaymentsCashFlow: 1200000, totalExpenses: 0, needsInputs: true
    });
    setup([{ property_id: "home-1", category: "mortgage", amount_cents: 1200000 }],
      [{ property_id: "home-1", mortgage_interest_cents: 0 }]);
    expect((await getTaxSummaryReport("owner", 2026))[0].needsInputs).toBe(false);
  });

  it.each(["payments", "property_expenses", "property_tax_years"])("throws on %s query failure", async (table) => {
    setup([], [], { [table]: new Error("query failed") });
    await expect(getTaxSummaryReport("owner", 2026)).rejects.toThrow("query failed");
  });

  it("refuses managers before querying tax data", async () => {
    mocks.role.mockResolvedValue("manager");
    await expect(getTaxSummaryReport("manager", 2026)).rejects.toThrow("Owner access required");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("excludes homes the owner only manages", async () => {
    setup([{ property_id: "home-2", category: "mortgage", amount_cents: 1200000 }], []);
    mocks.ownerIds.mockResolvedValue(["home-1"]);
    const rows = await getTaxSummaryReport("owner", 2026);
    expect(rows.map((row) => row.propertyId)).toEqual(["home-1"]);
    expect(rows[0].mortgagePaymentsCashFlow).toBe(0);
  });
});

describe("tax input dollars", () => {
  it.each([["", 0], ["0", 0], ["12", 1200], ["12.3", 1230], ["12.34", 1234],
    ["10000000", 1_000_000_000]])("converts %s to %i cents", (value, expected) => {
    expect(dollarsToCents(value)).toBe(expected);
  });
  it.each(["12.345", "1e3", "$12.34", "10,000", "-1", "abc", "10000001"])("rejects %s", (value) => {
    expect(() => dollarsToCents(value)).toThrow();
  });
  it("validates every amount", () => {
    const base = { propertyId: "00000000-0000-4000-8000-000000000001", taxYear: "2026",
      mortgageInterest: "", escrowPropertyTax: "", escrowInsurance: "", depreciation: "" };
    expect(updatePropertyTaxYearSchema.safeParse(base).success).toBe(true);
    for (const key of ["mortgageInterest", "escrowPropertyTax", "escrowInsurance", "depreciation"]) {
      expect(updatePropertyTaxYearSchema.safeParse({ ...base, [key]: "12.345" }).success).toBe(false);
    }
  });
});
