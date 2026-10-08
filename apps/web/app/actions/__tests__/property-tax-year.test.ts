import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), owner: vi.fn(), limit: vi.fn(), upsert: vi.fn(), revalidate: vi.fn() }));
vi.mock("../auth-helpers", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/property-access", () => ({ isOwnerMemberOfProperty: mocks.owner }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.limit }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => ({ upsert: mocks.upsert }) }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { savePropertyTaxYear } from "../property-tax-year";
function form(values: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    propertyId: "00000000-0000-4000-8000-000000000001", taxYear: "2026",
    mortgageInterest: "7000.12", escrowPropertyTax: "100.30", escrowInsurance: "", depreciation: "500", ...values
  })) data.set(key, value);
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "owner-1" } });
  mocks.owner.mockResolvedValue(true);
  mocks.limit.mockReturnValue({ allowed: true });
  mocks.upsert.mockResolvedValue({ error: null });
});
describe("savePropertyTaxYear", () => {
  it("refuses a manager before any write", async () => {
    mocks.auth.mockRejectedValue(new Error("REDIRECT:/manager"));
    await expect(savePropertyTaxYear(null, form())).rejects.toThrow("REDIRECT:/manager");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("refuses an owner outside the account", async () => {
    mocks.owner.mockResolvedValue(false);
    expect(await savePropertyTaxYear(null, form())).toEqual({ success: false, error: "You can't edit this home." });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it.each(["-1", "12.345", "10000001", "abc"])("rejects invalid amount %s", async (amount) => {
    expect(await savePropertyTaxYear(null, form({ mortgageInterest: amount }))).toMatchObject({ success: false });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("saves exact cents and blank as zero", async () => {
    expect(await savePropertyTaxYear(null, form())).toEqual({ success: true, message: "Saved." });
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      mortgage_interest_cents: 700012, escrow_property_tax_cents: 10030,
      escrow_insurance_cents: 0, depreciation_cents: 50000, updated_by: "owner-1"
    }), { onConflict: "property_id,tax_year" });
    expect(mocks.revalidate).toHaveBeenCalledWith("/owner/reports");
  });
  it("returns failure on database error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.upsert.mockResolvedValue({ error: new Error("db") });
    expect(await savePropertyTaxYear(null, form())).toEqual({ success: false, error: "Could not save. Please try again." });
  });
  it("enforces the hourly rate limit", async () => {
    mocks.limit.mockReturnValue({ allowed: false });
    expect(await savePropertyTaxYear(null, form())).toMatchObject({ success: false });
    expect(mocks.limit).toHaveBeenCalledWith("savePropertyTaxYear:owner-1", 30, 3600000);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
