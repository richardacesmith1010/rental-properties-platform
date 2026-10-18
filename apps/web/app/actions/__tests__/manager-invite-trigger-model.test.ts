import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createFakeWorld } from "./fake-invite-db";
import { createFakeGoTrue, HANDLE_NEW_USER_SQL, runHandleNewUser } from "./fake-gotrue";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), audit: vi.fn() }));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("server-only", () => ({}));

import { inviteManager } from "@/app/actions/invitations";
import { markManagerInvitationsAccepted } from "@/lib/invitations";
import { resetRateLimitState } from "@/lib/rate-limit";

const t0 = new Date("2026-10-18T03:00:00.000Z");
let world: ReturnType<typeof createFakeWorld>;
let gotrue: ReturnType<typeof createFakeGoTrue>;
let owner: string;
let homes: string[];
let fetchMock: ReturnType<typeof vi.fn>;
const email = "alex@example.com";
const fullName = "Alex Manager";
function form(ids = homes, address = email) {
  const data = new FormData();
  data.set("email", address); data.set("fullName", fullName);
  data.set("propertyIds", JSON.stringify(ids));
  return data;
}
function rows() { return world.read("invitations"); }
function grants() { return world.read("property_managers").filter((row) => row.manager_profile_id !== owner); }
async function send(ids = homes) { return inviteManager(null, form(ids)); }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(t0);
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
  vi.stubEnv("DOMUS_NOTIFICATIONS_ALLOWLIST", ""); vi.stubEnv("DOMUS_NOTIFICATIONS_ENABLED", "");
  vi.stubEnv("RESEND_API_KEY", "test-key"); vi.stubEnv("RESEND_FROM_EMAIL", "sender@example.com");
  fetchMock = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal("fetch", fetchMock);
  resetRateLimitState(); vi.clearAllMocks();
  world = createFakeWorld(); gotrue = createFakeGoTrue(world);
  owner = crypto.randomUUID(); const account = crypto.randomUUID();
  homes = [crypto.randomUUID(), crypto.randomUUID()];
  world.seed("profiles", { id: owner, email: "owner@example.com", role: "owner", full_name: "Ace" });
  world.seed("ownership_accounts", { id: account, managed_client: false, claim_state: "claimed" });
  world.seed("ownership_account_members", { account_id: account, profile_id: owner,
    member_role: "owner", active: true });
  homes.forEach((id, index) => world.seed("properties", { id, owner_account_id: account,
    name: index ? "Pine Home" : "Oak Home", active: true }));
  mocks.admin.mockImplementation(() => world.admin);
  mocks.auth.mockImplementation(async () => ({ user: { id: owner, role: "owner" } }));
  mocks.audit.mockResolvedValue(undefined);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("manager invite trigger and send order", () => {
  it("A1 embedded trigger SQL equals the latest migration", () => {
    const dir = path.resolve(__dirname, "../../../../../supabase/migrations");
    const matches = fs.readdirSync(dir).filter((name) => name.endsWith(".sql"))
      .sort().map((name) => ({ name, sql: fs.readFileSync(path.join(dir, name), "utf8") }))
      .filter(({ sql }) => /create or replace function public\.handle_new_user/i.test(sql));
    expect(matches.at(-1)?.name).toBe("20260228_phase9_llc_and_shared_operator_access.sql");
    const body = matches.at(-1)!.sql.match(/create or replace function public\.handle_new_user\(\)[\s\S]*?\$\$;/i)?.[0];
    expect(body?.replace(/\s+/g, " ").trim()).toBe(HANDLE_NEW_USER_SQL.replace(/\s+/g, " ").trim());
  });
  it("A2 control: rows before Auth insert are auto-accepted", async () => {
    const id = crypto.randomUUID();
    world.seed("invitations", { id, email, full_name: fullName, role: "manager",
      invited_by: owner, property_id: homes[0], status: "pending" });
    await gotrue.generateLink({ type: "invite", email, options: { data: { role: "manager" } } });
    expect(rows()[0].status).toBe("accepted");
    expect(grants()[0].active).toBe(true);
    expect(world.ops).toContain("trigger.converted:1");
  });
  it("A3 new manager on two homes keeps pending rows and sends after grants", async () => {
    const result = await send();
    expect(result).toEqual({ success: true, delivery: "email", email, name: fullName,
      message: "Invite sent to alex@example.com. They'll get an email from Domus." });
    expect(gotrue.users).toHaveLength(1);
    expect(gotrue.users[0].email_confirmed_at).toBeNull();
    expect(gotrue.users[0].app_metadata.domus_manager_invite).toBe(true);
    expect(rows()).toHaveLength(2);
    expect(rows().every((row) => row.status === "pending"
      && row.invited_profile_id === gotrue.users[0].id && row.created_at === t0.toISOString())).toBe(true);
    expect(grants()).toHaveLength(2);
    expect(grants().every((grant) => grant.active && !grant.assigned_directly)).toBe(true);
    expect(world.ops).toContain("trigger.converted:0");
    expect(world.ops.indexOf("auth.insert")).toBeLessThan(world.ops.indexOf("db:invitations:update"));
    expect(world.ops.indexOf("db:invitations:upsert")).toBeLessThan(world.ops.indexOf("rpc:manager_invite_grant"));
    expect(world.ops.indexOf("rpc:manager_invite_grant")).toBeLessThan(world.ops.indexOf("auth.email"));
  });
  it.each(["off", "test", "on"])("A4 generic Supabase invite in %s mode", async (mode) => {
    vi.stubEnv("DOMUS_NOTIFICATIONS_ENABLED", mode === "on" ? "true" : "");
    vi.stubEnv("DOMUS_NOTIFICATIONS_ALLOWLIST", mode === "test" ? "other@example.com" : "");
    await send([homes[0]]);
    expect(world.ops.filter((op) => op === "auth.inviteUserByEmail")).toHaveLength(1);
    expect(gotrue.calls.filter((call) => call.method === "inviteUserByEmail")).toEqual([{
      method: "inviteUserByEmail", email,
      options: { redirectTo: "https://app.example.com/auth/callback",
        data: { role: "manager", full_name: fullName } }
    }]);
    expect(gotrue.emails).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("A5 allowlisted address gets one branded token link and escaped names", async () => {
    vi.stubEnv("DOMUS_NOTIFICATIONS_ALLOWLIST", email);
    world.patch("properties", (row) => row.id === homes[0], { name: "Oak <script>" });
    const result = await inviteManager(null, form([homes[0]], " ALEX@EXAMPLE.COM "));
    expect(result).toMatchObject({ success: true, delivery: "email" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    const payload = JSON.parse(init.body);
    expect(url).toBe("https://api.resend.com/emails");
    expect(payload.to).toEqual([email]);
    expect(payload.html).toContain(`https://app.example.com/auth/confirm?token_hash=${
      encodeURIComponent(gotrue.users[0].token!)}&amp;type=invite`);
    expect(payload.html).toContain("Oak &lt;script&gt;");
    expect(payload.html).not.toContain("fake-link:");
    expect(gotrue.emails).toHaveLength(0);
  });
  it("A6 branded failure falls back without a second user", async () => {
    vi.stubEnv("DOMUS_NOTIFICATIONS_ALLOWLIST", email);
    fetchMock.mockResolvedValue({ ok: false });
    expect(await send()).toEqual({ success: true, delivery: "email", email, name: fullName,
      message: "Invite sent to alex@example.com. They'll get an email from Domus." });
    expect(gotrue.users).toHaveLength(1);
    expect(gotrue.emails).toHaveLength(1);
    expect(rows().every((row) => row.status === "pending")).toBe(true);
    expect(world.ops).not.toContain("auth.deleteUser");
  });
  it("A7 both sends fail, then Send again repairs delivery", async () => {
    world.failAuth("inviteUserByEmail");
    expect(await send()).toEqual({ success: false,
      error: "Access added. The email did not send. Press Send again." });
    expect(rows()).toHaveLength(2); expect(grants()).toHaveLength(2);
    expect(rows().every((row) => row.status === "pending")).toBe(true);
    expect(grants().every((row) => row.active)).toBe(true);
    vi.setSystemTime(new Date(t0.getTime() + 60_000));
    expect(await send()).toMatchObject({ success: true, delivery: "email" });
    expect(rows()).toHaveLength(2);
    expect(grants()).toHaveLength(2);
    expect(rows().every((row) => row.created_at === new Date(t0.getTime() + 60_000).toISOString())).toBe(true);
    expect(gotrue.emails).toHaveLength(1);
  });
  it("A8 rows write failure leaves only the Auth user, then retries", async () => {
    world.failNext("invitations", "update");
    expect(await send()).toEqual({ success: false, error: "Could not save the invite. Press Send again." });
    expect(gotrue.users).toHaveLength(1); expect(rows()).toHaveLength(0);
    expect(grants()).toHaveLength(0); expect(gotrue.emails).toHaveLength(0);
    expect(await send()).toMatchObject({ success: true });
    expect(gotrue.users).toHaveLength(1); expect(rows()).toHaveLength(2);
    expect(rows().every((row) => row.status === "pending")).toBe(true);
    expect(gotrue.emails).toHaveLength(1);
  });
  it("A9 grant failure stays pending without access, then Send repairs", async () => {
    world.failNext("rpc", "manager_invite_grant");
    expect(await send([homes[0]])).toEqual({ success: false,
      error: "Could not add access. Press Send again." });
    expect(gotrue.emails).toHaveLength(0);
    await markManagerInvitationsAccepted(gotrue.users[0].id);
    expect(rows()[0].status).toBe("pending"); expect(grants()).toHaveLength(0);
    const retryStart = world.ops.length;
    expect(await send([homes[0]])).toMatchObject({ success: true });
    expect(world.ops.lastIndexOf("rpc:manager_invite_grant")).toBeLessThan(world.ops.indexOf("auth.email"));
    const retryOps = world.ops.slice(retryStart);
    expect(retryOps.indexOf("rpc:manager_invite_grant")).toBeLessThan(retryOps.indexOf("auth.email"));
  });
  it("A9 a sign-in after a failed grant leaves the row pending", async () => {
    world.failNext("rpc", "manager_invite_grant");
    await send([homes[0]]);
    const link = await gotrue.generateLink({ type: "invite", email });
    expect(gotrue.clickLink(link.data.properties.hashed_token)).toBe(true);
    await markManagerInvitationsAccepted(gotrue.users[0].id);
    expect(rows()[0].status).toBe("pending");
    expect(grants()).toHaveLength(0);
  });
  it("A10 Send again reuses row ids and rotates the token", async () => {
    await send();
    expect(gotrue.users).toHaveLength(1);
    const ids = rows().map((row) => row.id); const oldToken = gotrue.users[0].token!;
    vi.setSystemTime(new Date(t0.getTime() + 60_000));
    await send();
    expect(rows().map((row) => row.id)).toEqual(ids);
    expect(gotrue.users).toHaveLength(1);
    expect(rows().every((row) => row.created_at === new Date().toISOString())).toBe(true);
    expect(gotrue.emails).toHaveLength(2);
    expect(gotrue.clickLink(oldToken)).toBe(false);
  });
  it("A11 sign-in accepts P rows from two inviters, not Q rows", async () => {
    await send([homes[0]]); const p = gotrue.users[0].id;
    const secondInviter = crypto.randomUUID();
    world.seed("profiles", { id: secondInviter, email: "second@example.com", role: "owner" });
    world.seed("ownership_account_members", { account_id: world.read("ownership_accounts")[0].id,
      profile_id: secondInviter, member_role: "owner", active: true });
    mocks.auth.mockImplementation(async () => ({ user: { id: secondInviter, role: "owner" } }));
    await send([homes[1]]);
    mocks.auth.mockImplementation(async () => ({ user: { id: owner, role: "owner" } }));
    await inviteManager(null, form([homes[1]], "q@example.com"));
    await markManagerInvitationsAccepted(p);
    expect(rows().filter((row) => row.email === email)).toHaveLength(2);
    expect(rows().filter((row) => row.email === email).every((row) => row.status === "accepted")).toBe(true);
    expect(rows().find((row) => row.email === "q@example.com")?.status).toBe("pending");
  });
  it("A12 accepted row is never downgraded by a mixed re-invite", async () => {
    await send([homes[0]]); const first = rows()[0].id;
    await markManagerInvitationsAccepted(gotrue.users[0].id);
    await world.admin.from("invitations").upsert({ ...rows()[0], id: crypto.randomUUID() },
      { onConflict: "email,role,invited_by,property_id" });
    expect(rows().find((row) => row.property_id === homes[0])?.id).toBe(first);
    await send();
    expect(rows().find((row) => row.id === first)?.status).toBe("accepted");
    expect(rows().find((row) => row.property_id === homes[1])?.status).toBe("pending");
  });
  it("K6 trigger keeps an empty new name and preserves an existing name on conflict", async () => {
    const user = await gotrue.selfSignUp("empty@example.com", { role: "manager", full_name: "" });
    expect(world.read("profiles").find((row) => row.id === user?.id)?.full_name).toBe("");
    world.patch("profiles", (row) => row.id === user?.id, { full_name: "Existing" });
    await runHandleNewUser(world, user!);
    expect(world.read("profiles").find((row) => row.id === user?.id)?.full_name).toBe("Existing");
  });
});
