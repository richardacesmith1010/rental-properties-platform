import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), rate: vi.fn(), access: vi.fn(), admin: vi.fn(), parse: vi.fn(), audit: vi.fn()
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.rate }));
vi.mock("@/lib/property-access", () => ({ canUserAdministerProperty: mocks.access }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.audit }));
vi.mock("@/lib/validations", () => ({
  inviteManagerSchema: {}, inviteOwnerSchema: {}, parseFormData: mocks.parse
}));
import { inviteManager } from "@/app/actions/invitations";

const form = new FormData();
function setup(profile: { id: string; role: string } | null, active: boolean | null = null) {
  const invite = vi.fn().mockResolvedValue({ data: { user: { id: "new-manager" } }, error: null });
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const insert = vi.fn().mockResolvedValue({ error: null });
  const profileLookup = vi.fn().mockResolvedValue({ data: profile, error: null });
  const assignmentLookup = vi.fn().mockResolvedValue({ data: active === null ? null : { active }, error: null });
  const propertyLookup = vi.fn().mockResolvedValue({ data: { id: "home" }, error: null });
  const from = vi.fn((table: string) => {
    if (table === "properties") return { select: () => ({ eq: () => ({ single: propertyLookup }) }) };
    if (table === "profiles") return { select: () => ({ eq: () => ({ single: profileLookup }) }) };
    if (table === "property_managers") return {
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: assignmentLookup }) }) }), upsert
    };
    return { insert };
  });
  mocks.admin.mockReturnValue({ from, auth: { admin: { inviteUserByEmail: invite } } });
  return { invite, upsert, profileLookup, assignmentLookup, from };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "owner" }, supabase: {
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { id: "home" } }) }) }) })
  } });
  mocks.rate.mockReturnValue({ allowed: true });
  mocks.access.mockResolvedValue(true);
  mocks.parse.mockReturnValue({ success: true, data: {
    email: "manager@example.com", fullName: "Alex Manager", propertyId: "home"
  } });
  mocks.audit.mockResolvedValue(undefined);
});

describe("inviteManager", () => {
  it("adds an existing manager without sending email", async () => {
    const calls = setup({ id: "manager", role: "manager" });
    expect(await inviteManager(null, form)).toMatchObject({ success: true, delivery: "added" });
    expect(calls.upsert).toHaveBeenCalledOnce();
    expect(calls.invite).not.toHaveBeenCalled();
  });
  it("reports an already active manager without sending email", async () => {
    const calls = setup({ id: "manager", role: "manager" }, true);
    expect(await inviteManager(null, form)).toMatchObject({ success: true, delivery: "already" });
    expect(calls.invite).not.toHaveBeenCalled();
  });
  it("sends new manager email with callback redirect", async () => {
    const calls = setup(null);
    expect(await inviteManager(null, form)).toMatchObject({ success: true, delivery: "email" });
    expect(calls.invite).toHaveBeenCalledWith("manager@example.com", expect.objectContaining({
      redirectTo: expect.stringMatching(/\/auth\/callback$/)
    }));
  });
  it("stops before lookup and writes when rate limited", async () => {
    const calls = setup(null);
    mocks.rate.mockReturnValue({ allowed: false });
    expect(await inviteManager(null, form)).toMatchObject({ success: false });
    expect(calls.from).not.toHaveBeenCalled();
    expect(calls.invite).not.toHaveBeenCalled();
  });
  it("stops before lookup and writes for a non-admin", async () => {
    const calls = setup(null);
    mocks.access.mockResolvedValue(false);
    expect(await inviteManager(null, form)).toMatchObject({ success: false });
    expect(calls.from).not.toHaveBeenCalled();
    expect(calls.invite).not.toHaveBeenCalled();
  });
  it("stops before rate limit or lookup when authentication rejects", async () => {
    const calls = setup(null);
    mocks.auth.mockRejectedValue(new Error("Unauthorized"));
    await expect(inviteManager(null, form)).rejects.toThrow("Unauthorized");
    expect(mocks.rate).not.toHaveBeenCalled();
    expect(calls.from).not.toHaveBeenCalled();
  });
});
