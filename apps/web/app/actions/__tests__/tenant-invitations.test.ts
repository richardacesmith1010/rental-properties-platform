import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(), rate: vi.fn(), access: vi.fn(), admin: vi.fn(), parse: vi.fn(), context: vi.fn(),
  generate: vi.fn(), fallback: vi.fn(), send: vi.fn(), audit: vi.fn(), notify: vi.fn()
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.rate }));
vi.mock("@/lib/property-access", () => ({ canUserAdministerProperty: mocks.access }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/invite-email", () => ({ sendTenantInviteEmail: mocks.send }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.audit }));
vi.mock("@/lib/notifications", () => ({ notifyOwnerMembersOfAcceptedTenantInvite: mocks.notify }));
vi.mock("@/lib/validations", () => ({
  inviteTenantSchema: {}, resendInviteSchema: {}, revokeInviteSchema: {}, parseFormData: mocks.parse
}));
vi.mock("@/app/actions/tenant-invitation-support", () => ({
  buildPropertyAddress: () => "Home address", buildTenantInviteMetadata: () => ({}),
  buildTenantResendPayload: () => null, createTenantInviteLink: mocks.generate,
  deleteGeneratedInviteUser: vi.fn(), fallbackToSupabaseInvite: mocks.fallback,
  getTenantInviteContext: mocks.context, normalizeOptionalString: (value: string) => value
}));
import { inviteTenant, resendInvite } from "@/app/actions/tenant-invitations";
const form = new FormData();
function setup(profile: { id: string; role: string } | null) {
  const invite = vi.fn().mockResolvedValue({ data: { user: { id: "invited" } }, error: null });
  const insert = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
  const profileLookup = vi.fn().mockResolvedValue({ data: profile, error: null });
  const existingInviteLookup = vi.fn().mockResolvedValue({ data: null, error: null });
  const resendLookup = vi.fn().mockResolvedValue({ data: {
    id: "invite", email: "tenant@example.com", full_name: "Alex", role: "tenant", status: "pending",
    property_id: "home", ownership_account_id: null, invited_profile_id: null
  }, error: null });
  const invitationChain = {
    eq: vi.fn(), in: vi.fn(), maybeSingle: existingInviteLookup, single: resendLookup
  };
  invitationChain.eq.mockReturnValue(invitationChain);
  invitationChain.in.mockReturnValue(invitationChain);
  const from = vi.fn((table: string) => table === "profiles"
    ? { select: () => ({ eq: () => ({ maybeSingle: profileLookup }) }) }
    : { select: () => invitationChain, insert, update });
  mocks.admin.mockReturnValue({ from, auth: { admin: { inviteUserByEmail: invite } } });
  return { from, invite, profileLookup, insert, resendLookup };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "owner" } });
  mocks.rate.mockReturnValue({ allowed: true });
  mocks.access.mockResolvedValue(true);
  mocks.parse.mockReturnValue({ success: true, data: {
    email: "tenant@example.com", fullName: "Alex", propertyId: "home", unitId: "unit",
    phone: "", monthlyRentDollars: null, leaseStartDate: "", leaseEndDate: ""
  } });
  mocks.context.mockResolvedValue({ property: { name: "Home" }, unit: { unit_number: "1" }, inviterName: "Owner" });
  mocks.generate.mockResolvedValue({ error: null, data: {
    user: { id: "generated" }, properties: { action_link: "https://example.com/invite" }
  } });
  mocks.fallback.mockResolvedValue({ error: null, data: { user: { id: "fallback" } } });
  mocks.send.mockResolvedValue(true);
  mocks.audit.mockResolvedValue(undefined);
  mocks.notify.mockResolvedValue(undefined);
});
describe("tenant invitation delivery", () => {
  it("links an existing tenant without email", async () => {
    const calls = setup({ id: "tenant", role: "tenant" });
    expect(await inviteTenant(null, form)).toMatchObject({ success: true, delivery: "linked" });
    expect(calls.invite).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("reports the Domus email when delivery succeeds", async () => {
    setup(null);
    expect(await inviteTenant(null, form)).toMatchObject({ success: true, delivery: "email_branded" });
  });
  it("reports basic email when Domus delivery fails", async () => {
    setup(null);
    mocks.send.mockResolvedValue(false);
    expect(await inviteTenant(null, form)).toMatchObject({ success: true, delivery: "email_basic" });
    expect(mocks.fallback).toHaveBeenCalled();
  });
  it("reports basic email when link generation fails", async () => {
    setup(null);
    mocks.generate.mockResolvedValue({ error: { message: "unavailable" }, data: {} });
    expect(await inviteTenant(null, form)).toMatchObject({ success: true, delivery: "email_basic" });
  });
  it("rejects a non-admin before profile lookup or email", async () => {
    const calls = setup(null);
    mocks.access.mockResolvedValue(false);
    expect(await inviteTenant(null, form)).toMatchObject({ success: false });
    expect(calls.profileLookup).not.toHaveBeenCalled();
    expect(calls.invite).not.toHaveBeenCalled();
  });
  it("rejects a rate-limited caller before profile lookup or email", async () => {
    const calls = setup(null);
    mocks.rate.mockReturnValue({ allowed: false });
    expect(await inviteTenant(null, form)).toMatchObject({ success: false });
    expect(calls.profileLookup).not.toHaveBeenCalled();
    expect(calls.invite).not.toHaveBeenCalled();
  });
  it("redirects the direct resend fallback to Domus", async () => {
    const calls = setup(null);
    mocks.parse.mockReturnValue({ success: true, data: { invitationId: "invite" } });
    expect(await resendInvite(null, form)).toMatchObject({ success: true });
    expect(calls.invite).toHaveBeenCalledWith("tenant@example.com", expect.objectContaining({
      redirectTo: expect.stringMatching(/\/auth\/callback$/)
    }));
  });
  it("redirects non-tenant resends to Domus", async () => {
    const calls = setup(null);
    mocks.parse.mockReturnValue({ success: true, data: { invitationId: "invite" } });
    const inviteRow = { id: "invite", email: "tenant@example.com", full_name: "Alex", role: "manager",
      status: "pending", property_id: "home", ownership_account_id: null, invited_profile_id: null };
    calls.resendLookup.mockResolvedValue({ data: inviteRow, error: null });
    expect(await resendInvite(null, form)).toMatchObject({ success: true });
    expect(calls.invite).toHaveBeenCalledWith("tenant@example.com", expect.objectContaining({
      redirectTo: expect.stringMatching(/\/auth\/callback$/)
    }));
  });
});
