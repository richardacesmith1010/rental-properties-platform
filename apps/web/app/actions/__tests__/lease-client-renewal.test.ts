import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), rate: vi.fn(), parse: vi.fn(), access: vi.fn(), client: vi.fn()
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.rate }));
vi.mock("@/lib/validations", () => ({ renewLeaseSchema: {}, terminateLeaseSchema: {}, parseFormData: mocks.parse }));
vi.mock("@/lib/property-access", () => ({ canUserAdministerProperty: mocks.access }));
vi.mock("@/lib/client-accounts", () => ({ isUnclaimedClientProperty: mocks.client }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/logger", () => ({ sideEffectError: () => () => undefined }));
vi.mock("@/lib/notifications", () => ({ createNotificationWithDelivery: vi.fn() }));
import { renewLease } from "@/app/actions/lease-lifecycle-actions";

describe("client lease renewal", () => {
  it("sends outside collection on the new lease", async () => {
    const insert = vi.fn().mockReturnValue({ select: () => ({ single: async () => ({
      data: null, error: { code: "TEST" }
    }) }) });
    const supabase = { from: vi.fn((table: string) => table === "units"
      ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({
        data: { id: "unit", property_id: "home" }, error: null
      }) }) }) }
      : { select: () => ({ eq: () => ({ maybeSingle: async () => ({
        data: { id: "lease", unit_id: "unit", active: true, lease_status: "active",
          tenant_profile_id: null, monthly_rent_cents: 10000 }, error: null
      }) }) }), insert }) };
    mocks.auth.mockResolvedValue({ user: { id: "manager" }, supabase });
    mocks.rate.mockReturnValue({ allowed: true });
    mocks.access.mockResolvedValue(true);
    mocks.client.mockResolvedValue(true);
    mocks.parse.mockReturnValue({ success: true, data: {
      leaseId: "lease", newStartDate: "2026-11-01", newEndDate: "2027-10-31",
      newMonthlyRentDollars: 100, newDueDayOfMonth: 1
    } });
    expect(await renewLease(null, new FormData())).toMatchObject({ success: false });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ collects_outside_domus: true }));
  });
});
