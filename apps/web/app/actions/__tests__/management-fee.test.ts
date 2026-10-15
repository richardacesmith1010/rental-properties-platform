import { beforeEach, describe, expect, it, vi } from "vitest";
import * as validations from "@/lib/validations";
import { parseFormData, updateManagementFeeSchema } from "@/lib/validations";

const revalidatePathMock = vi.hoisted(() => vi.fn());
const createAdminClientMock = vi.hoisted(() => vi.fn());
const requireAuthMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn());
const canUserAdministerPropertyMock = vi.hoisted(() => vi.fn());
const logAuditMock = vi.hoisted(() => vi.fn());
const sideEffectErrorMock = vi.hoisted(() => vi.fn(() => vi.fn()));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: createAdminClientMock }));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: requireAuthMock }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: checkRateLimitMock }));
vi.mock("@/lib/property-access", () => ({ canUserAdministerProperty: canUserAdministerPropertyMock }));
vi.mock("@/lib/audit", () => ({ logAudit: logAuditMock }));
vi.mock("@/lib/logger", () => ({ sideEffectError: sideEffectErrorMock }));

import { updateManagementFee } from "@/app/actions/management-fee";

const propertyId = "00000000-0000-4000-8000-000000000001";
const userId = "owner-1";
type QueryError = { code?: string; message: string } | null;
type Setup = {
  units?: number[];
  unitsError?: QueryError;
  activeConfig?: { manager_profile_id: string; frequency: string } | null;
  activeConfigError?: QueryError;
  latestManager?: { manager_profile_id: string } | null;
  latestManagerError?: QueryError;
  upsertError?: QueryError;
};

function form(fee = "125", includeProperty = true) {
  const data = new FormData();
  if (includeProperty) data.set("propertyId", propertyId);
  data.set("managementFeeDollars", fee);
  return data;
}

function setup(options: Setup = {}) {
  const upsert = vi.fn().mockResolvedValue({ error: options.upsertError ?? null });
  const requestFrom = vi.fn((table: string) => {
    if (table !== "manager_payment_configs") throw new Error(`Unexpected request table: ${table}`);
    return { upsert };
  });
  const chain = (result: unknown, final: "limit" | "maybeSingle") => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      order: vi.fn(() => query),
      limit: vi.fn(() => final === "limit" ? Promise.resolve(result) : query),
      maybeSingle: vi.fn().mockResolvedValue(result)
    };
    return query;
  };
  const adminFrom = vi.fn((table: string) => {
    if (table === "units") return chain({
      data: (options.units ?? [20000]).map((monthly_rent_cents) => ({ monthly_rent_cents })),
      error: options.unitsError ?? null
    }, "limit");
    if (table === "manager_payment_configs") return chain({
      data: options.activeConfig ?? null,
      error: options.activeConfigError ?? null
    }, "maybeSingle");
    if (table === "property_managers") return chain({
      data: options.latestManager ?? null,
      error: options.latestManagerError ?? null
    }, "maybeSingle");
    throw new Error(`Unexpected admin table: ${table}`);
  });
  requireAuthMock.mockResolvedValue({ user: { id: userId }, supabase: { from: requestFrom } });
  createAdminClientMock.mockReturnValue({ from: adminFrom });
  return { upsert, requestFrom, adminFrom };
}

function expectNoWrite(upsert: ReturnType<typeof vi.fn>) {
  expect(upsert).not.toHaveBeenCalled();
  expect(logAuditMock).not.toHaveBeenCalled();
}

function expectSuccess(feeCents: number) {
  expect(revalidatePathMock.mock.calls).toEqual([["/owner"], ["/manager"]]);
  expect(logAuditMock).toHaveBeenCalledExactlyOnceWith({
    userId,
    action: "update_management_fee",
    entityType: "property",
    entityId: propertyId,
    metadata: { propertyId, managementFeeCents: feeCents }
  });
}

function expectUpsert(upsert: ReturnType<typeof vi.fn>, managerId: string, frequency: string, feeCents: number) {
  expect(upsert.mock.calls).toEqual([[{
    property_id: propertyId,
    manager_profile_id: managerId,
    payment_type: "flat",
    percentage_rate: null,
    flat_amount_cents: feeCents,
    base_rent_cents: null,
    label: "Property Management Fee",
    frequency,
    active: feeCents > 0,
    updated_at: expect.any(String)
  }, { onConflict: "property_id,manager_profile_id" }]]);
  expect(new Date(upsert.mock.calls[0][0].updated_at).toISOString()).toBe(upsert.mock.calls[0][0].updated_at);
}

describe("updateManagementFee", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimitMock.mockReturnValue({ allowed: true });
    canUserAdministerPropertyMock.mockResolvedValue(true);
    logAuditMock.mockResolvedValue(undefined);
  });

  it("requires exactly the owner role", async () => {
    setup({ activeConfig: { manager_profile_id: "manager-1", frequency: "weekly" } });
    await updateManagementFee(null, form());
    expect(requireAuthMock).toHaveBeenCalledExactlyOnceWith("owner");
  });

  it("stops at the rate limit before parsing or database access", async () => {
    const { upsert } = setup();
    const parseFormDataSpy = vi.spyOn(validations, "parseFormData");
    checkRateLimitMock.mockReturnValue({ allowed: false });
    expect(await updateManagementFee(null, form())).toEqual({
      success: false, error: "Too many requests. Please try again later."
    });
    expect(checkRateLimitMock).toHaveBeenCalledWith(`updateManagementFee:${userId}`, 20, 60_000);
    expect(createAdminClientMock).not.toHaveBeenCalled();
    expect(parseFormDataSpy).not.toHaveBeenCalled();
    expect(canUserAdministerPropertyMock).not.toHaveBeenCalled();
    expectNoWrite(upsert);
    parseFormDataSpy.mockRestore();
  });

  it("returns the parser's exact invalid-form result without writing", async () => {
    const { upsert } = setup();
    const invalid = form("-1");
    expect(parseFormData(updateManagementFeeSchema, invalid)).toEqual({
      success: false, error: "Management fee cannot be negative."
    });
    expect(await updateManagementFee(null, invalid)).toEqual({
      success: false, error: "Management fee cannot be negative."
    });
    expect(createAdminClientMock).not.toHaveBeenCalled();
    expectNoWrite(upsert);
  });

  it("denies property access without writing", async () => {
    const { upsert } = setup();
    canUserAdministerPropertyMock.mockResolvedValue(false);
    expect(await updateManagementFee(null, form())).toEqual({ success: false, error: "Access denied." });
    expect(canUserAdministerPropertyMock).toHaveBeenCalledWith(userId, propertyId);
    expect(createAdminClientMock).not.toHaveBeenCalled();
    expectNoWrite(upsert);
  });

  it("reports a units query error without writing", async () => {
    const { upsert } = setup({ unitsError: { message: "units unavailable" } });
    expect(await updateManagementFee(null, form())).toEqual({
      success: false, error: "Unable to validate the management fee for this property."
    });
    expectNoWrite(upsert);
  });

  it("rejects a fee above the highest unit rent with both amounts", async () => {
    const { upsert } = setup({ units: [10000] });
    expect(await updateManagementFee(null, form("125"))).toEqual({
      success: false,
      error: "Management fee ($125.00) cannot exceed the highest unit rent ($100.00)."
    });
    expectNoWrite(upsert);
  });

  it("requires an active manager for a positive fee without an active config", async () => {
    const { upsert } = setup();
    expect(await updateManagementFee(null, form())).toEqual({
      success: false,
      error: "Assign an active manager to this property before setting a management fee."
    });
    expectNoWrite(upsert);
  });

  it("writes the exact active-config payload on the request client and audits it", async () => {
    const { upsert, requestFrom, adminFrom } = setup({
      activeConfig: { manager_profile_id: "manager-1", frequency: "weekly" }
    });
    expect(await updateManagementFee(null, form())).toEqual({
      success: true, message: "Management fee updated."
    });
    expect(requestFrom).toHaveBeenCalledExactlyOnceWith("manager_payment_configs");
    expect(adminFrom).toHaveBeenCalledWith("manager_payment_configs");
    expect(adminFrom).not.toHaveBeenCalledWith("property_managers");
    expectUpsert(upsert, "manager-1", "weekly", 12500);
    expectSuccess(12500);
  });

  it("uses the active manager and monthly frequency without an active config", async () => {
    const { upsert, adminFrom } = setup({ latestManager: { manager_profile_id: "manager-2" } });
    expect(await updateManagementFee(null, form())).toEqual({
      success: true, message: "Management fee updated."
    });
    expect(adminFrom).toHaveBeenCalledWith("property_managers");
    expectUpsert(upsert, "manager-2", "monthly", 12500);
    expectSuccess(12500);
  });

  it("deactivates an active config when the fee is zero", async () => {
    const { upsert } = setup({ activeConfig: { manager_profile_id: "manager-1", frequency: "weekly" } });
    expect(await updateManagementFee(null, form("0"))).toEqual({
      success: true, message: "Management fee updated."
    });
    expectUpsert(upsert, "manager-1", "weekly", 0);
    expectSuccess(0);
  });

  it("succeeds and audits zero without an active config or manager lookup", async () => {
    const { upsert, adminFrom, requestFrom } = setup();
    expect(await updateManagementFee(null, form("0"))).toEqual({
      success: true, message: "Management fee updated."
    });
    expect(adminFrom).not.toHaveBeenCalledWith("property_managers");
    expect(requestFrom).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    expectSuccess(0);
  });

  it.each([
    [{ code: "42P01", message: "relation missing" }, "This feature requires a database update."],
    [{ message: "connection failed" }, "Failed to update management fee."]
  ])("maps active-config query error %j", async (error, message) => {
    const { upsert } = setup({ activeConfigError: error });
    expect(await updateManagementFee(null, form())).toEqual({ success: false, error: message });
    expectNoWrite(upsert);
  });

  it.each([
    [{ code: "42P01", message: "relation missing" }, "This feature requires a database update."],
    [{ message: "connection failed" }, "Failed to update management fee."]
  ])("maps active-manager query error %j", async (error, message) => {
    const { upsert } = setup({ latestManagerError: error });
    expect(await updateManagementFee(null, form())).toEqual({ success: false, error: message });
    expectNoWrite(upsert);
  });

  it.each([
    [{ code: "42P01", message: "relation missing" }, "This feature requires a database update."],
    [{ message: "connection failed" }, "Failed to update management fee."]
  ])("maps upsert error %j", async (error, message) => {
    const { upsert } = setup({
      activeConfig: { manager_profile_id: "manager-1", frequency: "monthly" }, upsertError: error
    });
    expect(await updateManagementFee(null, form())).toEqual({ success: false, error: message });
    expect(upsert).toHaveBeenCalledOnce();
    expect(logAuditMock).not.toHaveBeenCalled();
  });

  it("keeps the barrel export identical to the fee action", async () => {
    setup({ activeConfig: { manager_profile_id: "manager-1", frequency: "monthly" } });
    expect((await import("@/app/actions")).updateManagementFee).toBe(updateManagementFee);
    expect(await updateManagementFee(null, form())).toEqual({
      success: true, message: "Management fee updated."
    });
  });
});
