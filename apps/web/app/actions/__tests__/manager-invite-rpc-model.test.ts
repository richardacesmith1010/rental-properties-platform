import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeWorld } from "./fake-invite-db";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), audit: vi.fn() }));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("server-only", () => ({}));
import { grantInvitedRows, grantNewHomes, acceptManagerInvites } from "@/lib/manager-invite";
let world: ReturnType<typeof createFakeWorld>;
let profile: string;
let inviter: string;
let home: string;
let invitation: string;
const email = "manager@example.com";
const row = (overrides: Record<string, unknown> = {}) => ({ id: crypto.randomUUID(), email,
  role: "manager", status: "pending", invited_by: inviter, invited_profile_id: profile,
  property_id: home, ...overrides });
const grant = (ids = [invitation], p = profile, by = inviter, accept = false) =>
  grantInvitedRows({ invitationIds: ids, profileId: p, inviterId: by, accept });
const revoke = (id = invitation, by = inviter) => world.admin.rpc("manager_invite_revoke",
  { p_invitation_id: id, p_inviter_id: by });
const current = () => world.read("invitations").find((item) => item.id === invitation);
const access = () => world.read("property_managers").find((item) => item.property_id === home
  && item.manager_profile_id === profile);
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-18T05:00:00.000Z"));
  vi.stubEnv("RESEND_API_KEY", "test-key"); vi.stubEnv("RESEND_FROM_EMAIL", "sender@example.com");
  vi.clearAllMocks(); world = createFakeWorld(); mocks.admin.mockImplementation(() => world.admin);
  profile = crypto.randomUUID(); inviter = crypto.randomUUID(); home = crypto.randomUUID();
  invitation = crypto.randomUUID();
  world.seed("profiles", { id: profile, email, role: "manager" });
  world.seed("profiles", { id: inviter, email: "owner@example.com", role: "owner" });
  world.seed("properties", { id: home, owner_account_id: crypto.randomUUID(), active: true });
  world.seed("invitations", row({ id: invitation }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

const unchangedAfterError = async (call: () => Promise<{ error: unknown }>, code: string) => {
  const before = structuredClone(world.tables);
  expect((await call()).error).toMatchObject({ code });
  expect(world.tables).toEqual(before);
};

describe("A37 manager RPC model contract", () => {
  it("binds an invitation to its manager and inviter before granting", async () => {
    expect((await grant()).rows).toEqual([{ invitation_id: invitation, property_id: home,
      outcome: "granted" }]);
    expect(access()).toMatchObject({ active: true, assigned_directly: false });
    const other = crypto.randomUUID();
    world.seed("profiles", { id: other, email: "other@example.com", role: "manager" });
    await unchangedAfterError(() => grant([invitation], other), "P0002");
    await unchangedAfterError(() => grant([invitation], profile, other), "P0002");
    await unchangedAfterError(() => grant([crypto.randomUUID()]), "P0002");
    await unchangedAfterError(() => grant([], profile), "22023");
    await unchangedAfterError(() => grant([invitation], inviter), "22023");
    expect(current()?.status).toBe("pending");
  });
  it("null profile binding requires the same email", async () => {
    world.patch("invitations", (item) => item.id === invitation, { invited_profile_id: null });
    expect((await grant()).error).toBeNull();
    expect(current()?.invited_profile_id).toBe(profile);
    world.patch("invitations", (item) => item.id === invitation,
      { invited_profile_id: null, email: "other@example.com" });
    await unchangedAfterError(() => grant(), "P0002");
  });
  it("accepts only pending rows and reports accepted or expired rows", async () => {
    expect((await grant([invitation], profile, inviter, true)).rows[0].outcome).toBe("accepted");
    expect(current()?.status).toBe("accepted");
    expect((await grant([invitation], profile, inviter, true)).rows[0].outcome).toBe("already_accepted");
    world.patch("invitations", (item) => item.id === invitation, { status: "expired" });
    expect((await grant()).rows[0].outcome).toBe("not_pending");
    expect(current()?.status).toBe("expired");
  });
  it("revoke returns not_found, already_revoked, and accepted without release", async () => {
    expect((await revoke(crypto.randomUUID())).data[0].outcome).toBe("not_found");
    expect((await revoke(invitation, crypto.randomUUID())).data[0].outcome).toBe("not_found");
    await grant();
    expect((await revoke()).data[0]).toMatchObject({ outcome: "revoked", released: true,
      other_live: false, kept_direct: false });
    expect(access()?.active).toBe(false);
    expect((await revoke()).data[0].outcome).toBe("already_revoked");
    world.patch("invitations", (item) => item.id === invitation, { status: "accepted" });
    expect((await revoke()).data[0].outcome).toBe("accepted");
  });
  it("revoke keeps access while another live invitation exists", async () => {
    await grant();
    const second = row({ id: crypto.randomUUID(), invited_by: crypto.randomUUID() });
    world.seed("invitations", second);
    expect((await revoke()).data[0]).toMatchObject({ outcome: "revoked", released: false,
      other_live: true });
    expect(access()?.active).toBe(true);
  });
  it("accept has no_access without grant and accepts with a grant", async () => {
    expect((await acceptManagerInvites(profile)).rows).toEqual([{ invitation_id: invitation,
      property_id: home, outcome: "no_access" }]);
    expect(current()?.status).toBe("pending");
    await grant();
    expect((await acceptManagerInvites(profile)).rows[0].outcome).toBe("accepted");
    expect(current()?.status).toBe("accepted");
  });
  it("direct grants report added only when access was inactive", async () => {
    expect((await grantNewHomes(profile, [home])).rows[0].added).toBe(true);
    expect((await grantNewHomes(profile, [home])).rows[0].added).toBe(false);
    expect(access()?.assigned_directly).toBe(true);
  });
  it("guard failure rolls back every row in one grant call", async () => {
    const clientHome = crypto.randomUUID(); const clientAccount = crypto.randomUUID();
    world.seed("ownership_accounts", { id: clientAccount, managed_client: true, claim_state: "claimed" });
    world.seed("properties", { id: clientHome, owner_account_id: clientAccount, active: true });
    const second = row({ id: crypto.randomUUID(), property_id: clientHome });
    world.seed("invitations", second);
    await unchangedAfterError(() => grant([invitation, second.id]), "42501");
    expect(world.read("property_managers")).toHaveLength(0);
    expect(world.read("invitations").every((item) => item.status === "pending")).toBe(true);
  });
  it("source flag stays direct on active grants and preserves direct access at revoke", async () => {
    world.seed("property_managers", { property_id: home, manager_profile_id: profile,
      active: true, assigned_directly: true });
    await grant();
    expect(access()?.assigned_directly).toBe(true);
    expect((await revoke()).data[0]).toMatchObject({ kept_direct: true, released: false });
    expect(access()?.active).toBe(true);
  });
  it("inactive direct grant becomes invitation-made until a direct add", async () => {
    world.seed("property_managers", { property_id: home, manager_profile_id: profile,
      active: false, assigned_directly: true });
    await grant();
    expect(access()?.assigned_directly).toBe(false);
    await grantNewHomes(profile, [home]);
    expect(access()?.assigned_directly).toBe(true);
    expect((await revoke()).data[0].kept_direct).toBe(true);
  });
  it("K1 seed defaults direct access and revoke keeps it", async () => {
    world.seed("property_managers", { property_id: home, manager_profile_id: profile, active: true });
    expect(access()?.assigned_directly).toBe(true);
    await grant();
    expect((await revoke()).data[0]).toMatchObject({ kept_direct: true, released: false });
  });
  it("K2 grant homes rejects a null profile and returns sorted distinct non-null homes", async () => {
    await unchangedAfterError(() => grantNewHomes(null as unknown as string, [home]), "22023");
    const earlier = "00000000-0000-4000-8000-000000000001";
    expect((await grantNewHomes(profile, [home, null as unknown as string, earlier, home])).rows)
      .toEqual([{ property_id: earlier, added: true }, { property_id: home, added: true }]
        .sort((a, b) => a.property_id.localeCompare(b.property_id)));
    world.patch("property_managers", (item) => item.property_id === home, { active: false });
    expect((await grantNewHomes(profile, [home])).rows).toEqual([{ property_id: home, added: true }]);
  });
  it("K3 accept skips null homes and returns invitation ids in order", async () => {
    const earlier = "00000000-0000-4000-8000-000000000001";
    world.seed("invitations", row({ id: earlier, property_id: home }));
    world.seed("invitations", row({ property_id: null }));
    const result = await acceptManagerInvites(profile);
    expect(result.rows.map((item) => item.invitation_id)).toEqual([earlier, invitation].sort());
  });
  it("K4 revoke with null home or profile reports no other live row", async () => {
    world.patch("invitations", (item) => item.id === invitation, { property_id: null,
      invited_profile_id: null, email: "unknown@example.com" });
    world.seed("invitations", row({ id: crypto.randomUUID(), property_id: null,
      email: "unknown@example.com" }));
    expect((await revoke()).data[0]).toMatchObject({ other_live: false, released: false });
  });
  it("K5 grant ignores null ids and returns sorted invitation ids", async () => {
    const earlier = "00000000-0000-4000-8000-000000000001";
    world.seed("invitations", row({ id: earlier }));
    expect((await grant([invitation, null as unknown as string, earlier, invitation])).rows
      .map((item) => item.invitation_id)).toEqual([earlier, invitation].sort());
    await unchangedAfterError(() => grant([null as unknown as string]), "22023");
  });
  it("K7 upsert preserves a conflicting invitation's id", async () => {
    const replacement = crypto.randomUUID();
    await world.admin.from("invitations").upsert({ ...row({ id: replacement }), status: "pending" },
      { onConflict: "email,role,invited_by,property_id" });
    expect(current()?.id).toBe(invitation);
    expect(world.read("invitations")).toHaveLength(1);
  });
  it("F3 rejects malformed grant homes and accept results", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const rpc = vi.spyOn(world.admin, "rpc");
    rpc.mockResolvedValueOnce({ data: [{ property_id: home, added: "yes" }], error: null });
    expect((await grantNewHomes(profile, [home])).error).not.toBeNull();
    rpc.mockResolvedValueOnce({ data: [{ invitation_id: invitation, property_id: home,
      outcome: "weird" }], error: null });
    expect((await acceptManagerInvites(profile)).error).not.toBeNull();
    expect(log).toHaveBeenCalledWith("[manager-invite] grant_failed", expect.anything());
    expect(log).toHaveBeenCalledWith("[manager-invite] accept_failed", expect.anything());
    log.mockRestore();
  });
});
