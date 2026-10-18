import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeWorld, expectNoWrites } from "./fake-invite-db";
import { createFakeGoTrue } from "./fake-gotrue";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), audit: vi.fn(), headers: vi.fn() }));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("next/headers", () => ({ headers: mocks.headers, cookies: vi.fn() }));
vi.mock("server-only", () => ({}));

import { inviteManager } from "@/app/actions/invitations";
import { resendInvite, revokeInvite } from "@/app/actions/tenant-invitations";
import { resendFromJoinLink } from "@/app/actions/join-invite";
import { resendInvitationEmail } from "@/lib/invite-resend";
import { INACTIVE_INVITE_MESSAGE } from "@/lib/join-invite";
import { markManagerInvitationsAccepted } from "@/lib/invitations";
import { resetRateLimitState } from "@/lib/rate-limit";

let world: ReturnType<typeof createFakeWorld>;
let auth: ReturnType<typeof createFakeGoTrue>;
let owner: string;
let account: string;
let home: string;
const email = "alex@example.com";
const form = (key: string, value: string) => { const data = new FormData(); data.set(key, value); return data; };
const send = (homes = [home]) => { const data = new FormData(); data.set("email", email);
  data.set("fullName", "Alex Manager"); data.set("propertyIds", JSON.stringify(homes));
  return inviteManager(null, data); };
const row = () => world.read("invitations")[0];
const resend = () => resendInvite(null, form("invitationId", row().id));
const revoke = () => revokeInvite(null, form("invitationId", row().id));
const join = (id = row().id) => resendFromJoinLink(null, form("inviteId", id));
const grant = () => world.read("property_managers").find((item) => item.property_id === home)!;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-18T04:00:00Z"));
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
  vi.stubEnv("DOMUS_NOTIFICATIONS_ALLOWLIST", ""); vi.stubEnv("DOMUS_NOTIFICATIONS_ENABLED", "");
  vi.stubEnv("RESEND_API_KEY", "test-key"); vi.stubEnv("RESEND_FROM_EMAIL", "sender@example.com");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  resetRateLimitState(); vi.clearAllMocks(); world = createFakeWorld(); auth = createFakeGoTrue(world);
  owner = crypto.randomUUID(); account = crypto.randomUUID(); home = crypto.randomUUID();
  world.seed("profiles", { id: owner, email: "owner@example.com", role: "owner", full_name: "Ace" });
  world.seed("ownership_accounts", { id: account, managed_client: false, claim_state: "claimed" });
  world.seed("ownership_account_members", { account_id: account, profile_id: owner, member_role: "owner", active: true });
  world.seed("properties", { id: home, owner_account_id: account, name: "Home", active: true });
  mocks.admin.mockImplementation(() => world.admin);
  mocks.auth.mockImplementation(async () => ({ user: { id: owner, role: "owner" } }));
  mocks.audit.mockResolvedValue(undefined); mocks.headers.mockResolvedValue({ get: () => null });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("manager invite resend", () => {
  it("B11 revoked row never re-grants", async () => {
    await send(); await revoke(); world.ops.length = 0;
    expect(await resend()).toEqual({ success: false, error: "This invite was revoked. Send a new invite." });
    expect(grant().active).toBe(false); expect(world.ops).not.toContain("rpc:manager_invite_grant");
  });

  it("B12 join page never grants after a failed Send", async () => {
    world.failNext("rpc", "manager_invite_grant");
    expect(await send()).toEqual({ success: false, error: "Could not add access. Press Send again." });
    world.ops.length = 0;
    expect(await join()).toEqual({ success: false, error: INACTIVE_INVITE_MESSAGE });
    expectNoWrites(world);
    expect(world.ops.filter((op) => op.startsWith("auth.") && op !== "auth.getUserById")).toEqual([]);
    expect(auth.emails).toHaveLength(0);
  });

  it("B12 failed revoke retries, then join page stays inactive", async () => {
    await send(); world.failNext("rpc", "manager_invite_revoke");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await revoke()).toEqual({ success: false, error: "Failed to revoke invitation." });
    expect(row().status).toBe("pending"); expect(grant().active).toBe(true);
    expect(await revoke()).toEqual({ success: true, message: "Invitation revoked." });
    expect(row().status).toBe("expired"); expect(grant().active).toBe(false);
    world.ops.length = 0;
    expect(await join()).toEqual({ success: false, error: INACTIVE_INVITE_MESSAGE });
    expectNoWrites(world);
    expect(world.ops.filter((op) => op.startsWith("auth.") && op !== "auth.getUserById")).toEqual([]);
    log.mockRestore();
  });

  it("B12 active join page resends without a grant write", async () => {
    await send(); world.ops.length = 0; const before = auth.emails.length;
    expect(await join()).toEqual({ success: true, message: "Sent. Check your email in a few minutes." });
    expect(auth.emails).toHaveLength(before + 1);
    expectNoWrites({ ...world, ops: world.ops.filter((op) => ![
      "auth.inviteUserByEmail", "auth.email", "db:invitations:update"
    ].includes(op)) });
  });

  it("B12 allowlisted join resend uses branded mail", async () => {
    vi.stubEnv("DOMUS_NOTIFICATIONS_ALLOWLIST", email);
    await send(); world.ops.length = 0;
    expect(await join()).toEqual({ success: true, message: "Sent. Check your email in a few minutes." });
    expect(world.ops).toContain("auth.generateLink");
    expectNoWrites({ ...world, ops: world.ops.filter((op) => ![
      "auth.generateLink", "db:invitations:update"
    ].includes(op)) });
    expect(vi.mocked(fetch)).toHaveBeenCalled();
  });

  it("B4 legacy confirmed row heals without an email", async () => {
    const user = await auth.selfSignUp(email, { role: "manager", full_name: "Alex Manager" });
    const link = await auth.generateLink({ type: "invite", email }); auth.clickLink(link.data.properties.hashed_token);
    world.seed("invitations", { id: crypto.randomUUID(), email, full_name: "Alex Manager", role: "manager",
      property_id: home, invited_by: owner, status: "pending", invited_profile_id: null,
      created_at: new Date().toISOString() });
    world.seed("property_managers", { property_id: home, manager_profile_id: user!.id, active: true });
    expect(await resend()).toEqual({ success: false, error: "They already signed in. No email was sent." });
    expect(row().status).toBe("accepted"); expect(auth.emails).toHaveLength(0);
  });

  it("B4 legacy confirmed row is used by join-page resend", async () => {
    const user = await auth.selfSignUp(email, { role: "manager", full_name: "Alex Manager" });
    const link = await auth.generateLink({ type: "invite", email }); auth.clickLink(link.data.properties.hashed_token);
    world.seed("invitations", { id: crypto.randomUUID(), email, full_name: "Alex Manager", role: "manager",
      property_id: home, invited_by: owner, status: "pending", invited_profile_id: null,
      created_at: new Date().toISOString() });
    world.seed("property_managers", { property_id: home, manager_profile_id: user!.id, active: true });
    expect(await join()).toEqual({ success: false, error: "This invite was already used. Sign in instead." });
    expect(row().status).toBe("accepted"); expect(auth.emails).toHaveLength(0);
  });

  it("B13 join page heals a signed-in pending invite", async () => {
    await send(); auth.clickLink(auth.emails[0].token); world.ops.length = 0;
    expect(await join()).toEqual({ success: false, error: "This invite was already used. Sign in instead." });
    expect(row().status).toBe("accepted"); expect(world.ops).not.toContain("auth.email");
  });

  it("B14 manager row is guarded from the plain resend", async () => {
    await send(); world.ops.length = 0;
    expect(await resendInvitationEmail(row() as Parameters<typeof resendInvitationEmail>[0], owner))
      .toEqual({ ok: false });
    expect(world.ops.filter((op) => op.startsWith("auth."))).toEqual([]);
  });

  it("B16 Resend repairs a failed grant before mailing", async () => {
    world.failNext("rpc", "manager_invite_grant"); await send(); world.ops.length = 0;
    expect(await resend()).toEqual({ success: true, message: "Invitation resent." });
    expect(grant().active).toBe(true);
    expect(world.ops.indexOf("rpc:manager_invite_grant")).toBeLessThan(world.ops.indexOf("auth.email"));
  });

  it("B16 Resend sends after the first delivery fails", async () => {
    vi.stubEnv("DOMUS_NOTIFICATIONS_ALLOWLIST", email);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    world.failAuth("inviteUserByEmail");
    expect(await send()).toEqual({ success: false,
      error: "Access added. The email did not send. Press Send again." });
    expect(auth.emails).toHaveLength(0);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    expect(await resend()).toEqual({ success: true, message: "Invitation resent." });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it.each(["A7", "A8", "A9", "B12", "B9"])("B15 %s logs no email, link, or token", async (failure) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    if (failure === "A7") {
      vi.stubEnv("DOMUS_NOTIFICATIONS_ALLOWLIST", email);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
      world.failAuth("inviteUserByEmail"); await send();
    } else if (failure === "A8") {
      world.failNext("invitations", "update"); await send();
    } else if (failure === "A9") {
      world.failNext("rpc", "manager_invite_grant"); await send();
    } else {
      await send();
      if (failure === "B12") world.failNext("rpc", "manager_invite_revoke");
      else auth.setAuthEmail(auth.users[0].id, "other@example.com");
      await revoke();
    }
    expect(log.mock.calls.some((call) => String(call[0]).startsWith("[manager-invite]"))).toBe(true);
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain(email);
    expect(logged).not.toContain("fake-link:");
    expect(logged).not.toContain("tok:");
    log.mockRestore();
  });

  it("B9 missing login refuses Resend without Auth writes", async () => {
    await send(); auth.dropAuthUser(auth.users[0].id); world.ops.length = 0;
    expect(await resend()).toEqual({ success: false,
      error: "This person's login is gone. Revoke this invite." });
    expect(world.ops.filter((op) => ["auth.generateLink", "auth.insert", "auth.email"].includes(op))).toEqual([]);
  });

  it("B21 checks owner access before healing a confirmed invite", async () => {
    await send(); auth.clickLink(auth.emails[0].token);
    world.patch("ownership_account_members", (item) => item.profile_id === owner, { active: false });
    world.ops.length = 0;
    expect(await resend()).toEqual({ success: false, error: "You no longer manage this home." });
    expect(row().status).toBe("pending"); expect(world.ops).not.toContain("rpc:manager_invite_grant");
    expect(await join()).toEqual({ success: false, error: INACTIVE_INVITE_MESSAGE });
    expect(world.ops).not.toContain("rpc:manager_invite_accept");
  });

  it("B21 client home blocks confirmed healing", async () => {
    await send(); auth.clickLink(auth.emails[0].token);
    world.patch("ownership_accounts", (item) => item.id === account, { managed_client: true });
    world.ops.length = 0;
    expect(await resend()).toEqual({ success: false,
      error: "This home's managers are set by its client account." });
    expect(world.ops).not.toContain("rpc:manager_invite_grant");
  });

  it("B22 join accepts only when the grant is active", async () => {
    world.failNext("rpc", "manager_invite_grant"); await send();
    const link = await auth.generateLink({ type: "invite", email }); auth.clickLink(link.data.properties.hashed_token);
    world.ops.length = 0;
    expect(await join()).toEqual({ success: false, error: INACTIVE_INVITE_MESSAGE });
    expect(row().status).toBe("pending"); expect(world.ops).toContain("rpc:manager_invite_accept");
    expect(auth.emails).toHaveLength(0);
    expectNoWrites({ ...world, ops: world.ops.filter((op) => ![
      "rpc:manager_invite_accept", "rpc:manager_access_lock"
    ].includes(op)) });
    expect(await resend()).toEqual({ success: false, error: "They already signed in. No email was sent." });
    expect(row().status).toBe("accepted"); expect(grant().active).toBe(true);
  });

  it("B25 join page cannot grant another home after access was revoked", async () => {
    const otherHome = crypto.randomUUID();
    world.seed("properties", { id: otherHome, owner_account_id: account, name: "Other Home", active: true });
    await send();
    world.failNext("rpc", "manager_invite_grant");
    expect(await send([otherHome])).toEqual({ success: false,
      error: "Could not add access. Press Send again." });
    const second = world.read("invitations").find((item) => item.property_id === otherHome)!;
    expect(auth.clickLink(auth.emails[0].token)).toBe(true);
    expect(await revoke()).toEqual({ success: true, message: "Invitation revoked." });
    expect(row().status).toBe("expired"); expect(grant().active).toBe(false);
    expect(second.status).toBe("pending");
    expect(world.read("property_managers").some((item) => item.property_id === otherHome && item.active)).toBe(false);
    world.ops.length = 0;
    expect(await join(second.id)).toEqual({ success: false, error: INACTIVE_INVITE_MESSAGE });
    expect(world.ops).toContain("rpc:manager_invite_accept");
    expectNoWrites({ ...world, ops: world.ops.filter((op) => ![
      "rpc:manager_invite_accept", "rpc:manager_access_lock"
    ].includes(op)) });
    expect(world.read("invitations").find((item) => item.id === second.id)?.status).toBe("pending");
    expect(grant().active).toBe(false);
  });

  it("T13-F3 maps sign-in between Auth lookup and grant to already joined", async () => {
    await send(); const previousEmails = auth.emails.length;
    world.afterOp("auth.getUserById", async () => {
      auth.users[0] = { ...auth.users[0] };
      expect(auth.clickLink(auth.emails[0].token)).toBe(true);
      await markManagerInvitationsAccepted(auth.users[0].id);
    });
    expect(await resend()).toEqual({ success: false, error: "They already signed in. No email was sent." });
    expect(row().status).toBe("accepted");
    expect(auth.emails).toHaveLength(previousEmails);
  });
});
