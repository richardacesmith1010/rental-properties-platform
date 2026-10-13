import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), permission: vi.fn(), refresh: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.refresh }));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/property-access", () => ({ canUserAdministerProperty: mocks.permission }));

import { clearDepositReturn, recordDepositReturn } from "@/app/actions/deposits";

const leaseId = "33333333-3333-4333-8333-333333333333";
const unitId = "44444444-4444-4444-8444-444444444444";
const profileId = "55555555-5555-4555-8555-555555555555";
const propertyId = "66666666-6666-4666-8666-666666666666";
let rpc: ReturnType<typeof vi.fn>;
function adminFixture() {
  rpc = vi.fn(async (name: string) => ({ data: name === "record_deposit_return" ? "recorded" : "cleared", error: null }));
  return { rpc, from: (table: string) => ({ select: () => ({ eq: () => ({
    maybeSingle: async () => ({ data: table === "leases" ? { unit_id: unitId }
      : { property_id: propertyId }, error: null }),
    single: async () => ({ data: { deposit_cents: 235000 }, error: null })
  }) }) }) };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: profileId } });
  mocks.permission.mockResolvedValue(true);
  mocks.admin.mockImplementation(adminFixture);
});

describe("deposit return actions", () => {
  it("records and clears through audited RPCs", async () => {
    expect(await recordDepositReturn({ leaseId, returnedCents: 200000, returnedOn: "2026-10-01" }))
      .toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("record_deposit_return", { p_lease_id: leaseId,
      p_returned_cents: 200000, p_returned_on: "2026-10-01", p_actor_profile_id: profileId });
    expect(await clearDepositReturn(leaseId)).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("clear_deposit_return", {
      p_lease_id: leaseId, p_actor_profile_id: profileId });
  });
  it("rejects unrelated users, amounts above the deposit, negative amounts and future dates", async () => {
    mocks.permission.mockResolvedValueOnce(false);
    expect((await recordDepositReturn({ leaseId, returnedCents: 1, returnedOn: "2026-10-01" })).ok).toBe(false);
    expect((await recordDepositReturn({ leaseId, returnedCents: 235001, returnedOn: "2026-10-01" })).ok).toBe(false);
    expect((await recordDepositReturn({ leaseId, returnedCents: -1, returnedOn: "2026-10-01" })).ok).toBe(false);
    expect((await recordDepositReturn({ leaseId, returnedCents: 1, returnedOn: "2999-01-01" })).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("checks RPC errors and idempotent results", async () => {
    const admin = adminFixture();
    mocks.admin.mockReturnValue(admin);
    admin.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    expect((await recordDepositReturn({ leaseId, returnedCents: 1, returnedOn: "2026-10-01" })).ok).toBe(false);
    expect(mocks.refresh).not.toHaveBeenCalled();
    admin.rpc.mockResolvedValueOnce({ data: "already", error: null });
    expect(await recordDepositReturn({ leaseId, returnedCents: 1, returnedOn: "2026-10-01" }))
      .toEqual({ ok: false, error: "This deposit return is already recorded. Undo it first." });
    admin.rpc.mockResolvedValueOnce({ data: "none", error: null });
    expect(await clearDepositReturn(leaseId)).toEqual({ ok: true });
  });
});
