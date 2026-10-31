import { createHmac } from "node:crypto";
import { inspect } from "node:util";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
const m = vi.hoisted(() => ({ client: vi.fn(), admin: vi.fn(), auth: vi.fn(), state: vi.fn(), email: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: m.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: m.admin }));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: m.auth, requireAuthForExit: m.auth }));
vi.mock("@/lib/auth", () => ({ getAuthState: m.state, getRoleHomePath: (role: string) => `/${role}` }));
vi.mock("@/lib/native-app-server", () => ({ isNativeAppServer: async () => false }));
vi.mock("@/lib/llc-invitation-email", () => ({ sendLLCInvitationEmail: m.email }));
vi.mock("@/app/actions/shared", () => ({ ensureCapabilityEnabled: async () => null }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/actions", async () => ({ ...await import("../llc-invitations"), signOut: vi.fn() }));
import JoinLlcPage from "@/app/join-llc/page";
import { acceptLLCInvitation, signInToJoinLLC, createAccountToJoinLLC,
  sendLLCInvitations, resendLLCInvitation, cancelLLCInvitation } from "../llc-invitations";
import { agreeToTerms } from "../legal-acceptance";
import { resetRateLimitState } from "@/lib/rate-limit";
import { LEGAL_DOCUMENTS } from "@/lib/legal-versions";

const id = "11111111-1111-4111-8111-111111111111";
const token = "abcdefab-2222-4222-8222-abcdefabcdef";
const accountId = "33333333-3333-4333-8333-333333333333";
const joinPath = `/join-llc?token=${token}`;
const agreeUrl = `/agree?next=${encodeURIComponent(joinPath)}`;
const email = "invite@example.com";
const joined = `/owner?account=${accountId}`;
const user = { id: "person", email, created_at: "2026-10-30T12:00:00Z", user_metadata: {} } as User;
type Row = Record<string, unknown>;
let session: User | null;
let identity: User;
let invitation: Row;
let agreements: Row[];
let profiles: Row[];
let memberships: Row[];
let failRecord: boolean;
let failRead: boolean;
let manageable: boolean;
let race: "cancel" | null;
const writes = vi.fn();
const rpc = vi.fn();
const createUser = vi.fn();
const updateUserById = vi.fn();
const deleteUser = vi.fn();
const signIn = vi.fn();
let logs: ReturnType<typeof vi.spyOn>[];

function form(overrides: Record<string, string> = {}) {
  const f = new FormData();
  for (const [key, value] of Object.entries({ token, email, firstName: "First", lastName: "Last",
    password: "Password123", confirmPassword: "Password123", agree: "yes", termsVersion: "2026-10-30",
    privacyVersion: "2026-10-30", next: joinPath, accountId, invitationId: id, emails: "new@example.com", ...overrides })) {
    f.set(key, value);
  }
  return f;
}
function expectNoWrites(options: { signIn?: boolean; createEmail?: string; expire?: boolean } = {}) {
  if (!options.signIn) expect(signIn.mock.calls).toEqual([]);
  expect(writes.mock.calls).toEqual(options.expire ? [["llc_invitations", "update", { status: "expired" }]] : []);
  expect(rpc.mock.calls).toEqual([]);
  expect(createUser.mock.calls).toEqual(options.createEmail ? [[{
    email: options.createEmail, password: "Password123", email_confirm: true,
    user_metadata: { role: "owner", full_name: "First Last", nickname: "First" }
  }]] : []);
  for (const fn of [updateUserById, deleteUser]) expect(fn.mock.calls).toEqual([]);
}
function rpcArguments(fullName = "First Last") {
  return { p_invitation_id: id, p_invitation_token: token, p_profile_id: user.id,
    p_full_name: fullName, p_nickname: "First", p_terms_version: LEGAL_DOCUMENTS.terms.current,
    p_privacy_version: LEGAL_DOCUMENTS.privacy.current };
}
function expectFailedRegistration() {
  expect(writes.mock.calls).toEqual([["legal_acceptances", "upsert", {
    profile_id: user.id, terms_version: LEGAL_DOCUMENTS.terms.current,
    terms_sha256: LEGAL_DOCUMENTS.terms.versions[LEGAL_DOCUMENTS.terms.current],
    privacy_version: LEGAL_DOCUMENTS.privacy.current,
    privacy_sha256: LEGAL_DOCUMENTS.privacy.versions[LEGAL_DOCUMENTS.privacy.current], source: "llc_invite",
    role_at_acceptance: "owner", client: "web",
    email_hmac: createHmac("sha256", "test-key").update(email).digest("hex"), email_hmac_key_version: 1, app_commit: null
  }]]);
  expect(rpc.mock.calls).toEqual([["accept_llc_invitation", rpcArguments()]]);
  expect(signIn.mock.calls).toEqual([[{ email, password: "Password123" }]]);
  expect(createUser.mock.calls).toEqual([[{ email, password: "Password123", email_confirm: true,
    user_metadata: { role: "owner", full_name: "First Last", nickname: "First" } }]]);
  expect(updateUserById.mock.calls).toEqual([]); expect(deleteUser.mock.calls).toEqual([]);
  expect(agreements).toEqual([]); expect(memberships).toEqual([]); expect(invitation.status).toEqual("pending");
}
function redirectTo(work: Promise<unknown>, destination: string) {
  return expect(work).rejects.toMatchObject({ digest: `NEXT_REDIRECT;replace;${destination};307;` });
}
function errorPath(message: string, mode = "signin") {
  return `${joinPath}&mode=${mode}&error=${encodeURIComponent(message)}`;
}
function sessionId() { return session?.id; }
function page() { return JoinLlcPage({ searchParams: Promise.resolve({ token }) }); }
function clearWrites() {
  writes.mockClear(); rpc.mockClear(); createUser.mockClear(); updateUserById.mockClear(); deleteUser.mockClear(); signIn.mockClear();
}
function db() {
  return { rpc, auth: { getUser: async () => ({ data: { user: session }, error: null }), signInWithPassword: signIn,
    admin: { createUser, updateUserById, deleteUser } }, from: (table: string) => {
    let method = "select";
    let payload: Row = {};
    const filters = new Map<string, unknown>();
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters.set(key, value); return query; },
      in: () => query, order: () => query,
      insert: (value: Row) => { method = "insert"; payload = value; writes(table, method, value); return query; },
      update: (value: Row) => { method = "update"; payload = value; writes(table, method, value); return query; },
      upsert: (value: Row) => { method = "upsert"; payload = value; writes(table, method, value); return query; },
      delete: () => { method = "delete"; writes(table, method); return query; },
      maybeSingle: async () => { const result = await run(); return { ...result, data: result.data?.[0] ?? null }; },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(run()).then(resolve)
    };
    async function run(): Promise<{ data: Row[] | null; error: { code: string } | null }> {
      if (table === "legal_acceptances") {
        if (method === "upsert") {
          if (failRecord) return { data: null, error: { code: "failed" } };
          agreements.push(payload);
        }
        return { data: agreements, error: failRead ? { code: "failed" } : null };
      }
      let rows: Row[] = table === "llc_invitations" ? [invitation] : table === "profiles" ? profiles :
        table === "ownership_accounts" ? [{ id: accountId, display_name: "LLC", created_by_profile_id: manageable ? "person" : "other" }] :
        table === "ownership_account_members" ? memberships : [];
      if (table === "ownership_account_members" && method === "select" && manageable) {
        rows = [...rows, { member_role: "owner", active: true }];
      }
      if (table === "profiles" || table === "llc_invitations") {
        rows = rows.filter(row => [...filters].every(([key, value]) => key === "token"
          ? String(row[key]).toLowerCase() === String(value).toLowerCase() : row[key] === value));
      }
      if (["profiles", "ownership_account_members"].includes(table) && ["insert", "upsert"].includes(method)) {
        const storage = table === "profiles" ? profiles : memberships;
        const values = Array.isArray(payload) ? payload : [payload];
        for (const value of values) {
          const existing = storage.find(row => table === "profiles" ? row.id === value.id :
            row.account_id === value.account_id && row.profile_id === value.profile_id);
          if (method === "upsert" && existing) Object.assign(existing, value);
          else storage.push(value);
        }
      }
      if (method === "update") rows.forEach(row => Object.assign(row, payload));
      if (method === "delete") rows.splice(0);
      return { data: rows, error: null };
    }
    return query;
  } };
}
beforeEach(() => {
  vi.clearAllMocks(); resetRateLimitState();
  vi.stubEnv("LEGAL_RECORD_HMAC_KEY", "test-key");
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
  session = { ...user }; identity = { ...user };
  invitation = { id, token, email, status: "pending", ownership_account_id: accountId, invited_by: "owner",
    created_at: new Date().toISOString(), accepted_at: null, ownership_accounts: { display_name: "LLC" } };
  agreements = []; memberships = []; profiles = [{ id: user.id, email, role: "tenant", full_name: "First Last" }];
  failRecord = false; failRead = false; manageable = true; race = null;
  m.client.mockImplementation(db); m.admin.mockImplementation(db);
  m.auth.mockImplementation(async () => ({ user: session }));
  m.state.mockResolvedValue({ hasProfile: true, role: "tenant", onboardingComplete: false, needsPasswordSet: false });
  m.email.mockResolvedValue(true);
  signIn.mockImplementation(async () => { session = identity; return { data: { user: identity }, error: null }; });
  createUser.mockImplementation(async (input) => {
    profiles.push({ id: user.id, email: input.email, role: "owner" });
    return { data: { user: identity }, error: null };
  });
  rpc.mockImplementation(async (_name, args) => {
    if (race === "cancel") invitation.status = "cancelled";
    if (!agreements.length && identity.created_at >= "2026-10-30") return { data: "agreement_required", error: null };
    if (invitation.status !== "pending" || args.p_invitation_token !== invitation.token) return { data: "not_active", error: null };
    invitation.status = "accepted";
    memberships.push({ account_id: invitation.ownership_account_id, profile_id: args.p_profile_id });
    return { data: "accepted", error: null };
  });
  logs = ["error", "warn", "log", "info", "debug"].map(key =>
    vi.spyOn(console, key as "error").mockImplementation(() => {}));
});
afterEach(() => {
  try {
    for (const log of logs) {
      const text = log.mock.calls.flatMap((args: unknown[]) => args.map(arg => inspect(arg, { depth: 5 }))).join("\n");
      for (const sensitive of [token, token.toUpperCase(), "canary-", joinPath, agreeUrl]) expect(text).not.toContain(sensitive);
    }
  } finally {
    for (const log of logs) log.mockRestore();
    vi.unstubAllEnvs();
  }
});
describe("LLC joins through real actions, agreement checks and RPC boundary", () => {
  it.each(["owner", "tenant"])("T15,T18 %s without agreement returns to the same link before joining", async (role) => {
    profiles[0].role = role;
    m.state.mockResolvedValue({ hasProfile: true, role, onboardingComplete: false, needsPasswordSet: false });
    await redirectTo(page(), agreeUrl); expectNoWrites();
    await redirectTo(agreeToTerms(null, form()), joinPath);
    expect(memberships).toEqual([]);
    expect(agreements.map(row => [row.profile_id, row.source])).toEqual([[user.id, "agree_page"]]);
    clearWrites();
    await redirectTo(page(), joined);
    expect(memberships).toEqual([{ account_id: accountId, profile_id: user.id }]);
    expect(sessionId()).toEqual(user.id);
    expect(agreements).toHaveLength(1);
  });
  it.each(["accepted", "exempt"])("T15,T18 %s joins on first render", async (state) => {
    if (state === "exempt") { session = { ...user, created_at: "2026-10-29" }; identity = session; }
    else agreements.push({ profile_id: user.id, terms_version: "2026-10-30", privacy_version: "2026-10-30" });
    await redirectTo(page(), joined);
    expect(memberships).toEqual([{ account_id: accountId, profile_id: user.id }]);
    expect(agreements.filter(row => row.source === "agree_page")).toEqual([]);
  });
  it("T18 wrong signed-in email shows the status before agreement", async () => {
    session = { ...user, email: "other@example.com" };
    expect(renderToStaticMarkup(await page())).toContain("Wrong account open"); expectNoWrites();
  });
  it.each(["accepted", "expired", "cancelled"])("T18 inactive %s shows status without agreeing or writing", async (status) => {
    invitation.status = status;
    const markup = renderToStaticMarkup(await page());
    expect(markup).toContain(status === "expired" ? "Invitation expired" : "Invitation already used");
    expectNoWrites();
  });
  it("T15,T16 failed agreement reads refuse page, accept and sign-in without writes", async () => {
    failRead = true;
    for (const [invoke, allowSignIn] of [[page, false], [() => acceptLLCInvitation(token), false],
      [() => signInToJoinLLC(form()), true]] as const) {
      await expect(invoke()).rejects.toThrow("Unable to read agreement records."); expectNoWrites({ signIn: allowSignIn });
    }
    expect(signIn).toHaveBeenCalledTimes(1);
  });
  it("T16 direct accept refuses required agreement; sign-in only changes session", async () => {
    expect(await acceptLLCInvitation(token)).toEqual({ success: false, error: "Please agree to the Terms first." });
    expectNoWrites(); session = null;
    await redirectTo(signInToJoinLLC(form()), agreeUrl); expectNoWrites({ signIn: true });
    expect(signIn.mock.calls).toEqual([[{ email, password: "Password123" }]]);
    expect(sessionId()).toEqual(user.id);
  });
  it("T5,T16,T18 failed registration record recovers and retries without a second user", async () => {
    session = null; profiles = []; failRecord = true;
    await redirectTo(createAccountToJoinLLC(form()), agreeUrl);
    expectFailedRegistration();
    expect(sessionId()).toEqual(user.id);
    clearWrites();
    await redirectTo(createAccountToJoinLLC(form()), errorPath(
      "An account already exists for this email. Sign in to continue."));
    expectNoWrites(); expect(profiles).toHaveLength(1); expect(memberships).toEqual([]);
    failRecord = false;
    await redirectTo(agreeToTerms(null, form()), joinPath);
    await redirectTo(page(), joined);
    expect(agreements.map(row => row.source)).toEqual(["agree_page"]);
    expect(memberships).toEqual([{ account_id: accountId, profile_id: user.id }]);
    expect(profiles).toHaveLength(1); expect(invitation.status).toEqual("accepted");
  });
  it("T5 registration records llc_invite and joins with trusted created identity", async () => {
    session = null; profiles = [];
    await redirectTo(createAccountToJoinLLC(form({ email: "attacker@example.com" })), joined);
    expect(createUser.mock.calls[0][0].email).toEqual(email);
    expect(agreements.map(row => [row.profile_id, row.source])).toEqual([[user.id, "llc_invite"]]);
    expect(memberships).toEqual([{ account_id: accountId, profile_id: user.id }]);
  });
  it("T16 failed recovery sign-in keeps the created account and existing sign-in copy", async () => {
    session = null; profiles = []; failRecord = true;
    signIn.mockResolvedValue({ data: { user: null }, error: { code: "failed" } });
    await redirectTo(createAccountToJoinLLC(form()), errorPath("Account created. Sign in to continue."));
    expectFailedRegistration(); expect(profiles).toHaveLength(1);
  });
  it.each(["accepted", "cancelled", "expired"])("T8-T10 all join actions refuse %s before writes", async (status) => {
    invitation.status = status;
    const message = status === "expired" ? "This invitation has expired." : "This invitation is no longer active.";
    expect(await acceptLLCInvitation(token)).toEqual({ success: false, error: message });
    await redirectTo(signInToJoinLLC(form()), errorPath(message));
    await redirectTo(createAccountToJoinLLC(form()), errorPath(message, "signup"));
    expectNoWrites(); expect(signIn).not.toHaveBeenCalled();
  });
  it.each(["accept", "signin", "create", "page"])(
    "T8 %s expires an eight-day-old pending invitation with exactly one allowed write", async kind => {
      invitation.created_at = new Date(Date.now() - 8 * 86400000).toISOString();
      if (kind === "accept") {
        expect(await acceptLLCInvitation(token)).toEqual({ success: false, error: "This invitation has expired." });
      } else if (kind === "page") {
        const markup = renderToStaticMarkup(await page());
        const document = new DOMParser().parseFromString(markup, "text/html");
        expect(document.querySelector("h1")?.textContent).toEqual("Invitation expired");
        expect(document.querySelector("p")?.textContent).toEqual(
          "This invitation expired after 7 days. Ask the LLC owner to resend it from the Members page.");
      } else {
        const invoke = kind === "signin" ? signInToJoinLLC : createAccountToJoinLLC;
        await redirectTo(invoke(form()), errorPath("This invitation has expired.", kind === "signin" ? "signin" : "signup"));
      }
      expectNoWrites({ expire: true }); expect(memberships).toEqual([]); expect(invitation.status).toEqual("expired");
    }
  );
  it("T7 server session and sign-in result defeat email substitution", async () => {
    session = { ...user, email: "other@example.com" }; identity = session;
    expect(await acceptLLCInvitation(token)).toEqual({ success: false, error: "This invitation was sent to a different email address." });
    await redirectTo(signInToJoinLLC(form()), errorPath("This invitation was sent to a different email address."));
    expectNoWrites({ signIn: true });
  });
  it("T7 created user with a different email never reaches the membership RPC", async () => {
    session = null; profiles = []; identity = { ...user, email: "other@example.com" };
    await redirectTo(createAccountToJoinLLC(form()), errorPath("This invitation was sent to a different email address.", "signup"));
    expectNoWrites({ createEmail: email });
    expect(agreements).toEqual([]); expect(memberships).toEqual([]); expect(invitation.status).toEqual("pending");
  });
  it("T12 existing email refuses registration before any write", async () => {
    await redirectTo(createAccountToJoinLLC(form()), errorPath("An account already exists for this email. Sign in to continue."));
    expectNoWrites(); expect(profiles).toHaveLength(1); expect(invitation.status).toEqual("pending");
  });
  it("T11 simultaneous accepts map one winner and one loser", async () => {
    session = { ...user, created_at: "2026-10-29" }; identity = session;
    const results = await Promise.all([acceptLLCInvitation(token), acceptLLCInvitation(token)]);
    expect(results).toEqual([{ success: true, accountId }, { success: false, error: "This invitation is no longer active." }]);
    expect(memberships).toEqual([{ account_id: accountId, profile_id: user.id }]); expect(invitation.status).toEqual("accepted");
    expect(writes.mock.calls).toEqual([]);
  });
  it("T11 losing to cancel maps not_active without table writes", async () => {
    session = { ...user, created_at: "2026-10-29" }; identity = session; race = "cancel";
    expect(await acceptLLCInvitation(token)).toEqual({ success: false, error: "This invitation is no longer active." });
    expect(writes.mock.calls).toEqual([]); expect(memberships).toEqual([]); expect(invitation.status).toEqual("cancelled");
  });
  it("T11 cancel and resend after acceptance refuse without writes", async () => {
    invitation.status = "accepted";
    expect(await cancelLLCInvitation(null, form())).toEqual({ success: false, error: "Only pending invitations can be cancelled." });
    expect(await resendLLCInvitation(null, form())).toEqual({ success: false, error: "Only pending invitations can be resent." });
    expectNoWrites(); expect(m.email).not.toHaveBeenCalled();
  });
  it("T14 other LLC management refuses send, resend and cancel without writes", async () => {
    manageable = false;
    expect(await sendLLCInvitations(null, form())).toEqual({ success: false, error: "You do not have permission to invite LLC members." });
    for (const invoke of [resendLLCInvitation, cancelLLCInvitation]) {
      expect(await invoke(null, form())).toEqual({ success: false, error: "You do not have permission to manage that invitation." });
    }
    expectNoWrites(); expect(m.email).not.toHaveBeenCalled();
  });
  it("T19 uppercase URL token reaches RPC as the lowercase lookup token with server identity", async () => {
    session = { ...user, email: " INVITE@EXAMPLE.COM ", created_at: "2026-10-29" }; identity = session;
    expect(await acceptLLCInvitation(token.toUpperCase())).toEqual({ success: true, accountId });
    expect(rpc.mock.calls).toEqual([["accept_llc_invitation", rpcArguments()]]);
    expect(writes.mock.calls).toEqual([]);
  });
  it("T19 distinct mocked Terms and Privacy versions reach their exact RPC fields", async () => {
    vi.resetModules();
    vi.doMock("@/lib/legal-versions", async original => ({
      ...await original<typeof import("@/lib/legal-versions")>(),
      LEGAL_DOCUMENTS: { terms: { current: "2099-01-01" }, privacy: { current: "2099-02-02" } }
    }));
    try {
      session = { ...user, created_at: "2026-10-29" }; identity = session;
      const actions = await import("../llc-invitations");
      expect(await actions.acceptLLCInvitation(token)).toEqual({ success: true, accountId });
      expect(rpc.mock.calls).toEqual([["accept_llc_invitation", {
        ...rpcArguments(), p_terms_version: "2099-01-01", p_privacy_version: "2099-02-02"
      }]]);
      expect(writes.mock.calls).toEqual([]);
    } finally {
      vi.doUnmock("@/lib/legal-versions"); vi.resetModules();
    }
  });
  it.each(["accepted", "exempt"])("T5 signed-in action joins an %s identity once", async state => {
    if (state === "exempt") identity = { ...user, created_at: "2026-10-29" };
    else agreements.push({ profile_id: user.id, terms_version: "2026-10-30", privacy_version: "2026-10-30" });
    session = null;
    await redirectTo(signInToJoinLLC(form({ email: " INVITE@EXAMPLE.COM " })), joined);
    expect(memberships).toEqual([{ account_id: accountId, profile_id: user.id }]);
    clearWrites();
    await redirectTo(signInToJoinLLC(form()), errorPath("This invitation is no longer active."));
    expectNoWrites(); expect(invitation.status).toEqual("accepted"); expect(memberships).toHaveLength(1);
  });
  it.each(["42P01", "failed"])("T6,T13 RPC %s errors map safe copy without table writes", async code => {
    session = { ...user, created_at: "2026-10-29" }; identity = session;
    rpc.mockResolvedValue({ data: null, error: { code, message: `token=${token}`, details: joinPath } });
    expect(await acceptLLCInvitation(token)).toEqual({ success: false, error: code === "42P01" ?
      "This feature requires a database update before invites can be accepted." : "Unable to attach this member to the LLC." });
    expect(writes.mock.calls).toEqual([]); expect(memberships).toEqual([]); expect(invitation.status).toEqual("pending");
  });

  it.each([
    ["agree", "", "Check the box to agree first."],
    ["termsVersion", "old", "We just updated the Terms. Reload the page to read them."]
  ])("T5 create path rejects %s before any write", async (key, value, message) => {
    profiles = []; session = null;
    await redirectTo(createAccountToJoinLLC(form({ [key]: value })), errorPath(message, "signup"));
    expectNoWrites(); expect(profiles).toEqual([]); expect(memberships).toEqual([]); expect(invitation.status).toEqual("pending");
  });

});
