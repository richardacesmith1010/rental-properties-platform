import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(), rate: vi.fn(), access: vi.fn(), admin: vi.fn(), parse: vi.fn(), audit: vi.fn(),
  clientAccount: vi.fn(), ownershipAccess: vi.fn()
}));
vi.mock("@/lib/ownership", () => ({ canUserAdministerOwnershipAccount: mocks.ownershipAccess }));
vi.mock("@/app/actions/shared", () => ({ ensureCapabilityEnabled: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/client-accounts", () => ({ getClientState: mocks.clientAccount }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.rate }));
vi.mock("@/lib/property-access", () => ({ getAdministeredPropertyIds: mocks.access }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.audit }));
vi.mock("@/lib/validations", () => ({ inviteManagerSchema: {}, inviteOwnerSchema: {}, parseFormData: mocks.parse }));
import { inviteManager, inviteOwner } from "@/app/actions/invitations";
const userId = crypto.randomUUID();
const homeId = crypto.randomUUID();
const accountId = crypto.randomUUID();
const form = new FormData();
function ownerData() { mocks.parse.mockReturnValue({ success: true, data: {
  email: "owner@example.com", fullName: "Ace Owner", ownershipAccountId: accountId
} }); }
function managerData() { mocks.parse.mockReturnValue({ success: true, data: {
  email: "manager@example.com", fullName: "Alex Manager", propertyIds: [homeId]
} }); }
function setupOwner(options: { profile?: { id: string; role: string } | null;
  existingInvite?: { id: string; status: string } | null; insertError?: boolean } = {}) {
  const invite = vi.fn().mockResolvedValue({ data: { user: { id: crypto.randomUUID() } }, error: null });
  const insert = vi.fn().mockResolvedValue({ error: options.insertError ? { code: "XX000" } : null });
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const profiles = { select: () => ({ eq: () => ({ maybeSingle: async () =>
    ({ data: options.profile ?? null, error: null }) }) }) };
  const invitations = { select: () => { const q = { eq: () => q,
    maybeSingle: async () => ({ data: options.existingInvite ?? null, error: null }) }; return q; }, insert };
  const from = vi.fn((table: string) => table === "profiles" ? profiles
    : table === "invitations" ? invitations : { upsert });
  mocks.admin.mockReturnValue({ from, auth: { admin: { inviteUserByEmail: invite } } });
  return { invite, insert, upsert, from };
}
function setupManager(managed = false) {
  const createUser = vi.fn(); const inviteUserByEmail = vi.fn();
  const from = vi.fn((table: string) => {
    if (table === "properties") return { select: () => ({ in: async () => ({ data: [
      { id: homeId, name: "Oak Home", owner_account_id: accountId }], error: null }) }) };
    if (table === "ownership_accounts") return { select: () => ({ in: async () => ({ data: [
      { id: accountId, managed_client: managed }], error: null }) }) };
    return {};
  });
  mocks.admin.mockReturnValue({ from, auth: { admin: { createUser, inviteUserByEmail } } });
  return { from, createUser, inviteUserByEmail };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: userId, role: "owner" } });
  mocks.rate.mockReturnValue({ allowed: true });
  mocks.access.mockResolvedValue([homeId]);
  mocks.clientAccount.mockResolvedValue(null);
  mocks.ownershipAccess.mockResolvedValue(true);
  mocks.audit.mockResolvedValue(undefined);
});

describe("A27 inviteOwner unchanged", () => {
  it("refuses unclaimed clients before membership or email", async () => {
    ownerData(); const calls = setupOwner();
    mocks.clientAccount.mockResolvedValue({ managedClient: true, claimState: "unclaimed" });
    expect(await inviteOwner(null, form)).toEqual({ success: false, error: "This client can't have owners yet." });
    expect(mocks.ownershipAccess).not.toHaveBeenCalled(); expect(calls.invite).not.toHaveBeenCalled();
    expect(calls.upsert).not.toHaveBeenCalled();
  });
  it("refuses claimed client membership through the generic invite", async () => {
    ownerData(); const calls = setupOwner();
    mocks.clientAccount.mockResolvedValue({ managedClient: true, claimState: "claimed" });
    expect(await inviteOwner(null, form)).toEqual({ success: false,
      error: "This client's owners are set by its client account." });
    expect(calls.invite).not.toHaveBeenCalled(); expect(calls.upsert).not.toHaveBeenCalled();
  });
  it("sends before inserting the owner row and only logs insert errors", async () => {
    ownerData(); const calls = setupOwner({ insertError: true });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await inviteOwner(null, form)).toEqual({ success: true });
    expect(calls.invite).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({
      data: { role: "owner", full_name: "Ace Owner", ownership_account_id: accountId }
    }));
    expect(calls.invite.mock.invocationCallOrder[0]).toBeLessThan(calls.insert.mock.invocationCallOrder[0]);
    expect(spy).toHaveBeenCalled(); spy.mockRestore();
  });
  it("adds an existing owner through membership upsert", async () => {
    ownerData(); const calls = setupOwner({ profile: { id: crypto.randomUUID(), role: "owner" } });
    expect(await inviteOwner(null, form)).toEqual({ success: true });
    expect(calls.upsert).toHaveBeenCalledOnce(); expect(calls.invite).not.toHaveBeenCalled();
  });
  it("refuses a duplicate pending owner invitation", async () => {
    ownerData(); const calls = setupOwner({ existingInvite: { id: crypto.randomUUID(), status: "pending" } });
    expect(await inviteOwner(null, form)).toEqual({ success: false,
      error: "An owner invitation is already pending for this account." });
    expect(calls.invite).not.toHaveBeenCalled();
  });
  it("requires owner or manager authentication", async () => {
    ownerData(); setupOwner(); await inviteOwner(null, form);
    expect(mocks.auth).toHaveBeenCalledWith("owner", "manager");
  });
});

describe("A28 inviteManager guards", () => {
  it("rate-limited calls stop before any Supabase or Auth call", async () => {
    managerData(); const calls = setupManager(); mocks.rate.mockReturnValue({ allowed: false });
    expect(await inviteManager(null, form)).toEqual({ success: false,
      error: "Too many invitations sent. Please try again later." });
    expect(calls.from).not.toHaveBeenCalled(); expect(calls.createUser).not.toHaveBeenCalled();
  });
  it("authentication rejection stops before rate limit", async () => {
    managerData(); const calls = setupManager(); mocks.auth.mockRejectedValue(new Error("Unauthorized"));
    await expect(inviteManager(null, form)).rejects.toThrow("Unauthorized");
    expect(mocks.rate).not.toHaveBeenCalled(); expect(calls.from).not.toHaveBeenCalled();
  });
  it("refuses client homes before writes or Auth", async () => {
    managerData(); const calls = setupManager(true);
    expect(await inviteManager(null, form)).toEqual({ success: false,
      error: "This home's managers are set by its client account." });
    expect(calls.createUser).not.toHaveBeenCalled();
    expect(calls.from.mock.calls.map((call) => call[0])).toEqual([
      "properties", "ownership_accounts"
    ]);
  });
});
