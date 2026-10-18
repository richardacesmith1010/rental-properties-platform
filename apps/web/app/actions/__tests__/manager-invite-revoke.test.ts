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
import { markManagerInvitationsAccepted } from "@/lib/invitations";
import { resetRateLimitState } from "@/lib/rate-limit";

let world: ReturnType<typeof createFakeWorld>;
let auth: ReturnType<typeof createFakeGoTrue>;
let owner: string;
let account: string;
let homes: string[];
let ticks: number;
const email = "alex@example.com";
const name = "Alex Manager";
const form = (id: string) => { const data = new FormData(); data.set("invitationId", id); return data; };
const sendForm = (ids: string[] = homes) => { const data = new FormData();
  data.set("email", email); data.set("fullName", name); data.set("propertyIds", JSON.stringify(ids)); return data; };
const send = (ids: string[] = homes) => {
  vi.setSystemTime(new Date(Date.UTC(2026, 9, 18, 4, ticks++))); return inviteManager(null, sendForm(ids));
};
const rows = () => world.read("invitations");
const grant = (home: string) => world.read("property_managers").find((row) => row.property_id === home)!;
const revoke = (id = rows()[0].id) => revokeInvite(null, form(id));
const resend = (id = rows()[0].id) => resendInvite(null, form(id));
const token = () => auth.emails.at(-1)!.token;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-18T04:00:00Z")); ticks = 0;
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
  vi.stubEnv("DOMUS_NOTIFICATIONS_ALLOWLIST", ""); vi.stubEnv("DOMUS_NOTIFICATIONS_ENABLED", "");
  vi.stubEnv("RESEND_API_KEY", "test-key"); vi.stubEnv("RESEND_FROM_EMAIL", "sender@example.com");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  resetRateLimitState(); vi.clearAllMocks();
  world = createFakeWorld(); auth = createFakeGoTrue(world);
  owner = crypto.randomUUID(); account = crypto.randomUUID(); homes = [crypto.randomUUID(), crypto.randomUUID()];
  world.seed("profiles", { id: owner, email: "owner@example.com", role: "owner", full_name: "Ace" });
  world.seed("ownership_accounts", { id: account, managed_client: false, claim_state: "claimed" });
  world.seed("ownership_account_members", { account_id: account, profile_id: owner, member_role: "owner", active: true });
  homes.forEach((id, index) => world.seed("properties", { id, owner_account_id: account,
    name: `Home ${index + 1}`, active: true }));
  mocks.admin.mockImplementation(() => world.admin);
  mocks.auth.mockImplementation(async () => ({ user: { id: owner, role: "owner" } }));
  mocks.audit.mockResolvedValue(undefined); mocks.headers.mockResolvedValue({ get: () => null });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("manager invite revoke", () => {
  it("B1 do, undo, and do again keeps the Auth user", async () => {
    expect(await send([homes[0]])).toMatchObject({ success: true });
    const id = rows()[0].id; const first = rows()[0].created_at; const old = token();
    expect(await revoke()).toEqual({ success: true, message: "Invitation revoked." });
    expect(rows()[0].status).toBe("expired"); expect(grant(homes[0]).active).toBe(false);
    expect(auth.clickLink(old)).toBe(false); expect(world.ops).not.toContain("auth.deleteUser");
    const priorEmails = auth.emails.length;
    expect(await send([homes[0]])).toMatchObject({ success: true });
    expect(rows()[0]).toMatchObject({ id, status: "pending", invited_profile_id: auth.users[0].id });
    expect(rows()[0].created_at).not.toBe(first); expect(grant(homes[0]).active).toBe(true);
    expect(auth.emails).toHaveLength(priorEmails + 1);
    expect(auth.clickLink(token())).toBe(true);
    await markManagerInvitationsAccepted(auth.users[0].id);
    expect(rows()[0].status).toBe("accepted");
  });

  it("B2 keeps a two-home link until the final revoke", async () => {
    await send(); const first = token(); const firstRow = rows().find((row) => row.property_id === homes[0])!;
    const secondRow = rows().find((row) => row.property_id === homes[1])!;
    world.ops.length = 0; expect(await revoke(firstRow.id)).toMatchObject({ success: true });
    expect(grant(homes[0]).active).toBe(false); expect(grant(homes[1]).active).toBe(true);
    expect(rows().find((row) => row.id === firstRow.id)?.status).toBe("expired");
    expect(rows().find((row) => row.id === secondRow.id)?.status).toBe("pending");
    expect(world.ops).not.toContain("auth.rotate");
    expect(await revoke(secondRow.id)).toMatchObject({ success: true });
    expect(world.ops).toContain("auth.rotate"); expect(auth.clickLink(first)).toBe(false);
  });

  it("B4 legacy direct grant survives revoke", async () => {
    const user = await auth.selfSignUp(email, { role: "manager", full_name: name });
    const link = await auth.generateLink({ type: "invite", email }); auth.clickLink(link.data.properties.hashed_token);
    const id = crypto.randomUUID(); world.seed("invitations", { id, email, full_name: name,
      role: "manager", property_id: homes[0], invited_by: owner, status: "pending", invited_profile_id: null });
    world.seed("property_managers", { property_id: homes[0], manager_profile_id: user!.id, active: true });
    expect(await revoke(id)).toEqual({ success: true,
      message: "Invitation revoked. They still manage this home." });
    expect(grant(homes[0])).toMatchObject({ active: true, assigned_directly: true });
    expect(rows()[0].status).toBe("expired"); expect(auth.emails).toHaveLength(0);
  });

  it("B5 another inviter's pending row retains the grant", async () => {
    await send([homes[0]]); const firstToken = token(); const second = crypto.randomUUID();
    world.seed("profiles", { id: second, email: "second@example.com", role: "owner" });
    world.seed("ownership_account_members", { account_id: account, profile_id: second, member_role: "owner", active: true });
    mocks.auth.mockResolvedValueOnce({ user: { id: second, role: "owner" } });
    await send([homes[0]]); const first = rows().find((row) => row.invited_by === owner)!;
    expect(rows()).toHaveLength(2);
    expect(rows().every((row) => row.status === "pending")).toBe(true);
    expect(world.read("property_managers")).toHaveLength(1);
    expect(grant(homes[0])).toMatchObject({ active: true, assigned_directly: false });
    world.ops.length = 0;
    expect(await revoke(first.id)).toEqual({ success: true,
      message: "Invitation revoked. Another invite still gives them this home." });
    expect(grant(homes[0]).active).toBe(true); expect(rows().find((row) => row.id === first.id)?.status).toBe("expired");
    expect(world.ops).not.toContain("auth.rotate"); expect(world.ops).not.toContain("auth.generateLink");
    expect(auth.clickLink(token())).toBe(true);
    expect(firstToken).not.toBe(token());
    await markManagerInvitationsAccepted(auth.users[0].id);
    expect(rows().find((row) => row.invited_by === second)?.status).toBe("accepted");
    expect(rows().find((row) => row.id === first.id)?.status).toBe("expired");
    expect(grant(homes[0]).active).toBe(true);
    mocks.auth.mockResolvedValueOnce({ user: { id: second, role: "owner" } });
    expect(await revoke(rows().find((row) => row.invited_by === second)!.id)).toEqual({
      success: false, error: "They already signed in. This invite can't be revoked."
    });
    expect(grant(homes[0]).active).toBe(true);
  });

  it("B3 re-adds a revoked home after a second inviter's link is used", async () => {
    await send([homes[0]]); const firstId = rows()[0].id; await revoke(firstId);
    const second = crypto.randomUUID();
    world.seed("profiles", { id: second, email: "second@example.com", role: "owner" });
    world.seed("ownership_account_members", { account_id: account, profile_id: second, member_role: "owner", active: true });
    mocks.auth.mockResolvedValueOnce({ user: { id: second, role: "owner" } });
    await send([homes[1]]); auth.clickLink(token());
    expect(await send([homes[0]])).toMatchObject({ success: true });
    expect(rows().find((item) => item.id === firstId)).toMatchObject({ status: "accepted" });
    expect(grant(homes[0]).active).toBe(true);
  });

  it("B6 revokes a pending row after the link was used", async () => {
    await send([homes[0]]); expect(auth.clickLink(token())).toBe(true);
    expect(await revoke()).toEqual({ success: true, message: "Invitation revoked." });
    expect(rows()[0].status).toBe("expired"); expect(grant(homes[0]).active).toBe(false);
  });

  it("B6 keeps access when another inviter's row is live", async () => {
    await send([homes[0]]); const first = rows()[0];
    const second = crypto.randomUUID();
    world.seed("profiles", { id: second, email: "second@example.com", role: "owner" });
    world.seed("ownership_account_members", { account_id: account, profile_id: second, member_role: "owner", active: true });
    mocks.auth.mockResolvedValueOnce({ user: { id: second, role: "owner" } });
    await send([homes[0]]);
    expect(auth.clickLink(token())).toBe(true);
    expect(await revoke(first.id)).toEqual({ success: true,
      message: "Invitation revoked. Another invite still gives them this home." });
    expect(rows().find((item) => item.id === first.id)?.status).toBe("expired");
    expect(rows().find((item) => item.invited_by === second)?.status).toBe("pending");
    expect(grant(homes[0]).active).toBe(true);
  });

  it("B7 sign-in before the revoke RPC wins", async () => {
    await send([homes[0]]);
    world.beforeOp("rpc:manager_invite_revoke", async () => {
      auth.clickLink(token()); await markManagerInvitationsAccepted(auth.users[0].id);
    });
    expect(await revoke()).toEqual({ success: false,
      error: "They already signed in. This invite can't be revoked." });
    expect(rows()[0].status).toBe("accepted"); expect(grant(homes[0]).active).toBe(true);
  });

  it("B7 revoke before sign-in wins", async () => {
    await send([homes[0]]); const old = token();
    world.afterOp("rpc:manager_invite_revoke", async () => {
      auth.clickLink(old); await markManagerInvitationsAccepted(auth.users[0].id);
    });
    expect(await revoke()).toEqual({ success: true, message: "Invitation revoked." });
    expect(rows()[0].status).toBe("expired"); expect(grant(homes[0]).active).toBe(false);
  });

  it("B8 revoke during Resend prevents the email", async () => {
    await send([homes[0]]); const before = auth.emails.length;
    world.beforeOp("rpc:manager_invite_grant", async () => { await revoke(); });
    expect(await resend()).toEqual({ success: false, error: "This invite was revoked. Send a new invite." });
    expect(rows()[0].status).toBe("expired"); expect(grant(homes[0]).active).toBe(false);
    expect(auth.emails).toHaveLength(before);
  });

  it("B8 revoke after Resend grant leaves no access", async () => {
    await send([homes[0]]); const before = auth.emails.length;
    world.afterOp("rpc:manager_invite_grant", async () => { await revoke(); });
    expect(await resend()).toEqual({ success: true, message: "Invitation resent." });
    expect(rows()[0].status).toBe("expired"); expect(grant(homes[0]).active).toBe(false);
    expect(auth.emails).toHaveLength(before + 1);
    auth.clickLink(token()); await markManagerInvitationsAccepted(auth.users[0].id);
    expect(rows()[0].status).toBe("expired"); expect(grant(homes[0]).active).toBe(false);
  });

  it("B8 revoke during Send blocks its first email", async () => {
    world.beforeOp("rpc:manager_invite_grant", async () => { await revoke(); });
    expect(await send([homes[0]])).toEqual({ success: false,
      error: "This invite was revoked. Send a new invite." });
    expect(rows()[0].status).toBe("expired");
    expect(grant(homes[0])?.active).not.toBe(true);
    expect(auth.emails).toHaveLength(0); expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("B8 revoke after Send grant wins even if the email goes out", async () => {
    world.afterOp("rpc:manager_invite_grant", async () => { await revoke(); });
    expect(await send([homes[0]])).toMatchObject({ success: true });
    expect(rows()[0].status).toBe("expired"); expect(grant(homes[0]).active).toBe(false);
    expect(auth.emails).toHaveLength(1);
    auth.clickLink(token()); await markManagerInvitationsAccepted(auth.users[0].id);
    expect(rows()[0].status).toBe("expired"); expect(grant(homes[0]).active).toBe(false);
  });

  it("B8 Resend before Revoke mails once, then Revoke wins", async () => {
    await send([homes[0]]); const before = auth.emails.length;
    world.beforeOp("rpc:manager_invite_revoke", async () => { await resend(); });
    expect(await revoke()).toEqual({ success: true, message: "Invitation revoked." });
    expect(auth.emails).toHaveLength(before + 1);
    expect(rows()[0].status).toBe("expired"); expect(grant(homes[0]).active).toBe(false);
    expect(auth.clickLink(token())).toBe(false);
  });

  it("B8 Resend after Revoke is refused", async () => {
    await send([homes[0]]); const before = auth.emails.length;
    let resendResult: Awaited<ReturnType<typeof resendInvite>> | undefined;
    world.afterOp("rpc:manager_invite_revoke", async () => {
      resendResult = await resend();
    });
    expect(await revoke()).toMatchObject({ success: true });
    expect(resendResult).toEqual({ success: false, error: "This invite was revoked. Send a new invite." });
    expect(rows()[0].status).toBe("expired");
    expect(auth.emails).toHaveLength(before); expect(grant(homes[0]).active).toBe(false);
  });

  it("B9 missing login can still lose its grant", async () => {
    await send([homes[0]]); auth.dropAuthUser(auth.users[0].id); world.ops.length = 0;
    expect(await revoke()).toEqual({ success: true, message: "Invitation revoked." });
    expect(rows()[0].status).toBe("expired");
    expect(grant(homes[0]).active).toBe(false);
    expect(world.ops).not.toContain("auth.generateLink"); expect(world.ops).not.toContain("auth.insert");
  });

  it("B9 changed Auth email skips link reset", async () => {
    await send([homes[0]]); auth.setAuthEmail(auth.users[0].id, "other@example.com"); world.ops.length = 0;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await revoke()).toEqual({ success: true, message: "Invitation revoked." });
    expect(rows()[0].status).toBe("expired");
    expect(world.ops).not.toContain("auth.generateLink"); expect(world.ops).not.toContain("auth.insert");
    log.mockRestore();
  });

  it("B10 former manager inviter can still revoke", async () => {
    const inviter = crypto.randomUUID();
    world.seed("profiles", { id: inviter, email: "co@example.com", role: "manager" });
    world.seed("property_managers", { property_id: homes[0], manager_profile_id: inviter, active: true });
    mocks.auth.mockImplementation(async () => ({ user: { id: inviter, role: "manager" } }));
    await send([homes[0]]);
    world.patch("property_managers", (item) => item.manager_profile_id === inviter, { active: false });
    expect(await revoke()).toEqual({ success: true, message: "Invitation revoked." });
    expect(world.read("property_managers").find((item) => item.manager_profile_id === auth.users[0].id)?.active)
      .toBe(false);
  });

  it("B23 direct add survives revoke", async () => {
    await send([homes[0]]); auth.clickLink(token());
    const second = crypto.randomUUID();
    world.seed("profiles", { id: second, email: "second@example.com", role: "owner" });
    world.seed("ownership_account_members", { account_id: account, profile_id: second, member_role: "owner", active: true });
    mocks.auth.mockResolvedValueOnce({ user: { id: second, role: "owner" } });
    expect(await send([homes[0]])).toEqual({ success: true, delivery: "already",
      message: `${name} already has access to this home. No email was sent.`, email, name });
    expect(world.ops).toContain("rpc:manager_grant_homes");
    expect(await revoke()).toEqual({ success: true,
      message: "Invitation revoked. They still manage this home." });
    expect(grant(homes[0])).toMatchObject({ active: true, assigned_directly: true });
    expect(rows().find((item) => item.invited_by === owner)?.status).toBe("expired");
  });

  it("B24 pre-existing direct grant survives its invitation", async () => {
    await send([homes[1]]); const profileId = auth.users[0].id;
    world.seed("property_managers", { property_id: homes[0], manager_profile_id: profileId, active: true });
    await send([homes[0]]); const row = rows().find((item) => item.property_id === homes[0])!;
    expect(await revoke(row.id)).toEqual({ success: true,
      message: "Invitation revoked. They still manage this home." });
    expect(grant(homes[0])).toMatchObject({ active: true, assigned_directly: true });
    expect(rows().find((item) => item.id === row.id)?.status).toBe("expired");
  });

  it("T13-F1 rejects malformed revoke results without resetting the link", async () => {
    await send([homes[0]]);
    const rpc = world.admin.rpc;
    world.admin.rpc = ((functionName: string, args: Record<string, string>) => functionName === "manager_invite_revoke"
      ? Promise.resolve({ data: [{ outcome: "revoked", released: false, other_live: false, kept_direct: null }], error: null })
      : rpc(functionName, args)) as typeof rpc;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    world.ops.length = 0;
    expect(await revoke()).toEqual({ success: false, error: "Failed to revoke invitation." });
    expect(log.mock.calls.some((call) => call[0] === "[manager-invite] revoke_failed")).toBe(true);
    expect(world.ops).not.toContain("auth.generateLink");
    expect(world.ops).not.toContain("auth.rotate");
    expect(rows()[0].status).toBe("pending");
    log.mockRestore();
  });

  it("T13-F2 refuses an accepted row before any reads or writes", async () => {
    await send([homes[0]]);
    expect(auth.clickLink(token())).toBe(true);
    await markManagerInvitationsAccepted(auth.users[0].id);
    world.ops.length = 0;
    expect(await revoke()).toEqual({ success: false,
      error: "They already signed in. This invite can't be revoked." });
    expectNoWrites(world);
    expect(world.ops).not.toContain("rpc:manager_invite_revoke");
    expect(world.ops).toEqual(["db:invitations:select"]);
  });
});
