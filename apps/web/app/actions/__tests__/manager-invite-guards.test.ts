import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeWorld, expectNoWrites } from "./fake-invite-db";
import { createFakeGoTrue } from "./fake-gotrue";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), audit: vi.fn() }));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("server-only", () => ({}));
import { inviteManager } from "@/app/actions/invitations";
import { grantNewHomes } from "@/lib/manager-invite";
import { resetRateLimitState } from "@/lib/rate-limit";
const t0 = new Date("2026-10-18T04:00:00.000Z");
let world: ReturnType<typeof createFakeWorld>;
let auth: ReturnType<typeof createFakeGoTrue>;
let owner: string;
let account: string;
let homes: string[];
const email = "alex@example.com";
const fullName = "Alex Manager";
const form = (ids = homes, address = email) => {
  const data = new FormData(); data.set("email", address); data.set("fullName", fullName);
  data.set("propertyIds", JSON.stringify(ids)); return data;
};
let actionCount = 0;
const submit = (data: FormData) => {
  vi.setSystemTime(new Date(t0.getTime() + actionCount++ * 60_000));
  return inviteManager(null, data);
};
const send = (ids = homes, address = email) => submit(form(ids, address));
const rows = () => world.read("invitations");
const grants = () => world.read("property_managers").filter((row) => row.manager_profile_id !== owner);
async function signedManager() {
  const user = await auth.selfSignUp(email, { role: "manager", full_name: fullName });
  const link = await auth.generateLink({ type: "invite", email });
  auth.clickLink(link.data.properties.hashed_token);
  return user!;
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(t0);
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
  vi.stubEnv("DOMUS_NOTIFICATIONS_ALLOWLIST", ""); vi.stubEnv("DOMUS_NOTIFICATIONS_ENABLED", "");
  vi.stubEnv("RESEND_API_KEY", "test-key"); vi.stubEnv("RESEND_FROM_EMAIL", "sender@example.com");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  resetRateLimitState(); vi.clearAllMocks(); actionCount = 0;
  world = createFakeWorld(); auth = createFakeGoTrue(world);
  owner = crypto.randomUUID(); account = crypto.randomUUID();
  homes = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  world.seed("profiles", { id: owner, email: "owner@example.com", role: "owner", full_name: "Ace" });
  world.seed("ownership_accounts", { id: account, managed_client: false, claim_state: "claimed" });
  world.seed("ownership_account_members", { account_id: account, profile_id: owner,
    member_role: "owner", active: true });
  homes.forEach((id, index) => world.seed("properties", { id, owner_account_id: account,
    name: `Home ${index + 1}`, active: true }));
  mocks.admin.mockImplementation(() => world.admin);
  mocks.auth.mockImplementation(async () => ({ user: { id: owner, role: "owner" } }));
  mocks.audit.mockResolvedValue(undefined);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("manager invite guards and existing managers", () => {
  it("A13 confirmed manager gets missing homes through the direct grant RPC", async () => {
    const manager = await signedManager();
    await grantNewHomes(manager.id, [homes[0]]);
    world.ops.length = 0;
    const rpc = vi.spyOn(world.admin, "rpc");
    expect(await send()).toEqual({ success: true, delivery: "added", email, name: fullName,
      message: "Added Alex Manager to 2 homes. They'll see them next time they sign in." });
    expect(world.ops.filter((op) => op === "rpc:manager_grant_homes")).toHaveLength(1);
    expect(rpc).toHaveBeenCalledWith("manager_grant_homes", {
      p_profile_id: manager.id, p_property_ids: homes
    });
    expect(world.ops).not.toContain("db:property_managers:upsert");
    expect(world.ops).not.toContain("db:invitations:insert");
    expect(world.ops).not.toContain("auth.createUser");
    expect(world.ops).not.toContain("auth.email");
    expect(rows()).toHaveLength(0);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ addedPropertyIds: expect.arrayContaining(homes.slice(1)) })
    }));
  });
  it("A13 copy for one added, one existing, and several existing homes", async () => {
    await signedManager();
    expect(await send([homes[0]])).toMatchObject({
      message: "Added Alex Manager to this home. They'll see it next time they sign in." });
    world.ops.length = 0;
    expect(await send([homes[0]])).toMatchObject({
      message: "Alex Manager already has access to this home. No email was sent." });
    expect(world.ops).not.toContain("db:invitations:insert");
    expect(world.ops).not.toContain("auth.createUser");
    expect(world.ops).not.toContain("auth.email");
    world.ops.length = 0;
    expect(await send([homes[0], homes[1]])).toMatchObject({
      message: "Added Alex Manager to 1 home. They'll see it next time they sign in." });
    world.ops.length = 0;
    expect(await send([homes[0], homes[1]])).toMatchObject({
      message: "Alex Manager already has access to these homes. No email was sent." });
    expect(world.ops).not.toContain("db:invitations:insert");
    expect(world.ops).not.toContain("auth.createUser");
    expect(world.ops).not.toContain("auth.email");
  });
  it("A14 live legacy pending row heals without email", async () => {
    const manager = await signedManager();
    world.seed("invitations", { id: crypto.randomUUID(), email, role: "manager", full_name: fullName,
      property_id: homes[0], invited_by: owner, status: "pending", invited_profile_id: null });
    world.seed("property_managers", { property_id: homes[0], manager_profile_id: manager.id,
      active: true, assigned_directly: true });
    world.ops.length = 0;
    const rpc = vi.spyOn(world.admin, "rpc");
    expect(await send([homes[0]])).toEqual({ success: true, delivery: "already", email, name: fullName,
      message: "Alex Manager already has access to this home. No email was sent." });
    expect(rows()[0].status).toBe("accepted");
    expect(world.ops).toContain("rpc:manager_invite_grant");
    expect(rpc).toHaveBeenCalledWith("manager_invite_grant", expect.objectContaining({ p_accept: true }));
    expect(world.ops).not.toContain("auth.email");
  });
  it("A15 other-role profile is refused before Auth or writes", async () => {
    await auth.selfSignUp(email, { role: "tenant" }); world.ops.length = 0;
    expect(await send()).toEqual({ success: false,
      error: "A user with this email already exists with a different role." });
    expectNoWrites(world);
  });
  it("A16 orphan manager profile is refused", async () => {
    const link = await auth.generateLink({ type: "invite", email, options: { data: { role: "manager" } } });
    auth.dropAuthUser(link.data.user.id); world.ops.length = 0;
    expect(await send()).toEqual({ success: false,
      error: "Could not find this person's account. Try a different email." });
    expectNoWrites(world); expect(rows()).toHaveLength(0);
  });
  it("T11-F1 transient Auth lookup error uses the email check copy", async () => {
    await auth.selfSignUp(email, { role: "manager", full_name: fullName }); world.ops.length = 0;
    world.failAuth("getUserById");
    expect(await send([homes[0]])).toEqual({ success: false, error: "Could not check this email. Try again." });
    expectNoWrites(world);
  });
  it("T11-F3 unknown grant outcome fails before email", async () => {
    const rpc = world.admin.rpc;
    world.admin.rpc = (name, args) => name === "manager_invite_grant"
      ? Promise.resolve({ data: [{ invitation_id: crypto.randomUUID(), property_id: homes[0], outcome: "weird" }],
        error: null }) : rpc(name, args);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await send([homes[0]])).toEqual({ success: false,
      error: "Could not add access. Press Send again." });
    expect(log).toHaveBeenCalledWith("[manager-invite] grant_failed", expect.anything());
    expect(auth.emails).toHaveLength(0);
    log.mockRestore();
  });
  it("A17 self sign-up is refused without server-only marker", async () => {
    await auth.selfSignUp(email, { role: "manager", full_name: fullName }); world.ops.length = 0;
    expect(await send()).toEqual({ success: false,
      error: "We can't invite this email right now. Try a different email." });
    expect(rows()).toHaveLength(0); expect(grants()).toHaveLength(0); expect(auth.emails).toHaveLength(0);
  });
  it("A18 stale pending row blocks the Auth insert", async () => {
    world.seed("invitations", { id: crypto.randomUUID(), email, role: "manager", full_name: fullName,
      property_id: homes[0], invited_by: owner, status: "pending" });
    expect(await send()).toEqual({ success: false,
      error: "We can't invite this email right now. Try a different email." });
    expect(world.ops).not.toContain("auth.createUser");
  });
  it("A19 client home refuses the whole multi-home submit", async () => {
    const client = crypto.randomUUID();
    world.seed("ownership_accounts", { id: client, managed_client: true, claim_state: "claimed" });
    world.patch("properties", (row) => row.id === homes[1], { owner_account_id: client });
    world.seed("ownership_account_members", { account_id: client, profile_id: owner,
      member_role: "owner", active: true });
    expect(await send([homes[0], homes[1]])).toEqual({ success: false,
      error: "This home's managers are set by its client account." });
    expectNoWrites(world);
  });
  it("A20 account scope ignores posted ownershipAccountId and rejects another owner's home", async () => {
    const accountB = crypto.randomUUID(); const outside = crypto.randomUUID();
    world.seed("ownership_accounts", { id: accountB, managed_client: false, claim_state: "claimed" });
    world.seed("ownership_account_members", { account_id: accountB, profile_id: owner,
      member_role: "owner", active: true });
    world.patch("properties", (row) => row.id === homes[1], { owner_account_id: accountB });
    const data = form([homes[1]]); data.set("ownershipAccountId", account);
    expect(await submit(data)).toMatchObject({ success: true });
    world.seed("properties", { id: outside, owner_account_id: crypto.randomUUID(), active: true });
    world.ops.length = 0;
    expect(await send([outside])).toEqual({ success: false, error: "Property not found." });
    expectNoWrites(world);
  });
  it("A21 a manager invites a co-manager on assigned homes", async () => {
    const manager = crypto.randomUUID();
    world.seed("profiles", { id: manager, email: "co@example.com", role: "manager" });
    world.seed("property_managers", { property_id: homes[0], manager_profile_id: manager,
      active: true, assigned_directly: true });
    mocks.auth.mockImplementation(async () => ({ user: { id: manager, role: "manager" } }));
    expect(await send([homes[0]])).toMatchObject({ success: true });
    expect(rows()[0].invited_by).toBe(manager);
  });
  it("A22 rate limit counts one request for three homes", async () => {
    for (let n = 0; n < 10; n++) expect(await send()).toMatchObject({ success: true });
    world.ops.length = 0;
    expect(await send()).toEqual({ success: false,
      error: "Too many invitations sent. Please try again later." });
    expect(world.ops).toHaveLength(0);
  });
  it("A23 createUser commit then error recovers only with marker", async () => {
    auth.commitThenError();
    expect(await send([homes[0]])).toMatchObject({ success: true });
    expect(auth.users).toHaveLength(1); expect(rows()[0].status).toBe("pending");
    expect(grants()[0].active).toBe(true); expect(auth.emails).toHaveLength(1);
  });
  it("A23 committed user without marker is refused", async () => {
    auth.commitThenError({ dropMarker: true });
    expect(await send([homes[0]])).toEqual({ success: false,
      error: "Failed to send invitation. Please try again." });
    expect(rows()).toHaveLength(0); expect(grants()).toHaveLength(0); expect(auth.emails).toHaveLength(0);
  });
  it("A24 tenant invite wins the Auth race, then role check refuses", async () => {
    world.beforeOp("auth.createUser", async () => {
      await auth.inviteUserByEmail(email, { data: { role: "tenant", full_name: fullName } });
    });
    expect(await send([homes[0]])).toEqual({ success: false, error: "Could not check this email. Try again." });
    expect(rows()).toHaveLength(0); expect(grants()).toHaveLength(0); expect(auth.emails).toHaveLength(1);
    expect(await send([homes[0]])).toEqual({ success: false,
      error: "A user with this email already exists with a different role." });
  });
  it("A24 profile lookup failure stops before Auth and retries", async () => {
    world.failNext("profiles", "select");
    expect(await send([homes[0]])).toEqual({ success: false, error: "Could not check this email. Try again." });
    expectNoWrites(world);
    world.ops.length = 0;
    expect(await send([homes[0]])).toMatchObject({ success: true });
    expect(auth.users).toHaveLength(1); expect(rows()).toHaveLength(1);
    expect(rows()[0].status).toBe("pending"); expect(auth.emails).toHaveLength(1);
  });
  it("A24 same-name self sign-up race is blocked twice", async () => {
    world.beforeOp("auth.createUser", async () => { await auth.selfSignUp(email,
      { role: "manager", full_name: fullName }); });
    expect(await send([homes[0]])).toEqual({ success: false, error: "Could not check this email. Try again." });
    expect(rows()).toHaveLength(0); expect(grants()).toHaveLength(0); expect(auth.emails).toHaveLength(0);
    world.ops.length = 0;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await send([homes[0]])).toEqual({ success: false,
      error: "We can't invite this email right now. Try a different email." });
    expect(log).toHaveBeenCalledWith("[manager-invite] self_signup_blocked", expect.anything());
    expect(world.ops).toContain("auth.getUserById");
    expectNoWrites(world);
    expect(rows()).toHaveLength(0); expect(grants()).toHaveLength(0); expect(auth.emails).toHaveLength(0);
    log.mockRestore();
  });
  it("A24 another inviter wins the Auth race, Send again uses marker", async () => {
    world.beforeOp("auth.createUser", async () => { await auth.createUser({ email, email_confirm: false,
      user_metadata: { role: "manager", full_name: fullName },
      app_metadata: { domus_manager_invite: true } }); });
    expect(await send([homes[0]])).toEqual({ success: false, error: "Could not check this email. Try again." });
    expect(rows()).toHaveLength(0);
    expect(await send([homes[0]])).toMatchObject({ success: true });
    expect(auth.users).toHaveLength(1); expect(rows()[0].status).toBe("pending");
    expect(grants()).toHaveLength(1); expect(grants()[0].active).toBe(true);
    expect(auth.emails).toHaveLength(1);
  });
  it("A25 sign-in during generic Send accepts the just-granted row", async () => {
    await send([homes[0]]); const token = auth.users[0].token!;
    const second = crypto.randomUUID();
    world.seed("profiles", { id: second, email: "second@example.com", role: "owner" });
    world.seed("ownership_account_members", { account_id: account, profile_id: second,
      member_role: "owner", active: true });
    mocks.auth.mockImplementation(async () => ({ user: { id: second, role: "owner" } }));
    world.beforeOp("auth.inviteUserByEmail", () => { auth.clickLink(token); });
    expect(await send([homes[1]])).toEqual({ success: true, delivery: "already_joined", email,
      name: fullName, message: "Added Alex Manager. They already signed in." });
    expect(rows().find((row) => row.invited_by === second)?.status).toBe("accepted");
    expect(grants().find((grant) => grant.property_id === homes[1])?.active).toBe(true);
    expect(auth.emails).toHaveLength(1);
  });
  it("A25 sign-in during branded Send returns already joined without fetch", async () => {
    await send([homes[0]]); const token = auth.users[0].token!;
    vi.stubEnv("DOMUS_NOTIFICATIONS_ALLOWLIST", email);
    const second = crypto.randomUUID();
    world.seed("profiles", { id: second, email: "second@example.com", role: "owner" });
    world.seed("ownership_account_members", { account_id: account, profile_id: second,
      member_role: "owner", active: true });
    mocks.auth.mockImplementation(async () => ({ user: { id: second, role: "owner" } }));
    world.beforeOp("auth.generateLink", () => { auth.clickLink(token); });
    expect(await send([homes[1]])).toMatchObject({ success: true, delivery: "already_joined" });
    expect(rows().find((row) => row.invited_by === second)?.status).toBe("accepted");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("A26 Auth email mismatch never rotates a token or sends", async () => {
    await send([homes[0]]);
    auth.setAuthEmail(auth.users[0].id, "other@example.com"); world.ops.length = 0;
    expect(await send([homes[0]])).toEqual({ success: false,
      error: "Access added. The email did not send. Press Send again." });
    expect(world.ops).not.toContain("auth.generateLink");
    expect(world.ops).not.toContain("auth.inviteUserByEmail");
    expect(world.ops).not.toContain("auth.insert");
  });
});
