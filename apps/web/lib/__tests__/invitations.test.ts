import { describe, expect, it, vi } from "vitest";
import { extractTenantInviteNames } from "@/lib/invitations";

describe("tenant invite onboarding metadata", () => {
  it("extracts the inviter and property names stored by tenant invites", () => {
    expect(
      extractTenantInviteNames({
        owner_name: "Smoke Owner",
        property_name: "Smoke Test Property",
        property_address: "135 Meridian Way"
      })
    ).toEqual({
      ownerName: "Smoke Owner",
      propertyName: "Smoke Test Property",
      propertyAddress: "135 Meridian Way"
    });
  });

  it("returns null names for legacy invite metadata", () => {
    expect(extractTenantInviteNames({ unit_label: "Unit S" })).toEqual({
      ownerName: null,
      propertyName: null,
      propertyAddress: null
    });
  });
});

const managerMocks = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: managerMocks.admin }));
import { markManagerInvitationsAccepted, markTenantInvitationAccepted } from "@/lib/invitations";

describe("A30 manager invitation acceptance", () => {
  it("calls the acceptance RPC once and writes no table", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const from = vi.fn(); managerMocks.admin.mockReturnValue({ rpc, from });
    const profileId = crypto.randomUUID();
    await markManagerInvitationsAccepted(profileId);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("manager_invite_accept", { p_profile_id: profileId });
    expect(from).not.toHaveBeenCalled();
  });
  it("logs an RPC error and swallows a throw", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const rpc = vi.fn().mockResolvedValueOnce({ data: null,
      error: { code: "XX000", message: "test failure" } }).mockRejectedValueOnce(new Error("test failure"));
    managerMocks.admin.mockReturnValue({ rpc });
    const profileId = crypto.randomUUID();
    await expect(markManagerInvitationsAccepted(profileId)).resolves.toBeUndefined();
    await expect(markManagerInvitationsAccepted(profileId)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledTimes(2); spy.mockRestore();
  });
  it("leaves the tenant acceptance write unchanged", async () => {
    const update = vi.fn();
    const query = { eq: vi.fn() } as { eq: ReturnType<typeof vi.fn> };
    query.eq.mockReturnValue(query);
    update.mockReturnValue(query);
    const from = vi.fn().mockReturnValue({ update });
    managerMocks.admin.mockReturnValue({ from });
    const profileId = crypto.randomUUID();
    await markTenantInvitationAccepted(profileId);
    expect(from).toHaveBeenCalledWith("invitations");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: "accepted" }));
    expect(query.eq.mock.calls).toEqual([
      ["role", "tenant"], ["invited_profile_id", profileId], ["status", "pending"]
    ]);
  });
});
