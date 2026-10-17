import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestAccountDeletion } from "@/app/actions/account-deletion-request";
import { resetRateLimitState } from "@/lib/rate-limit";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(), createAdminClient: vi.fn(), logAudit: vi.fn(), cookies: vi.fn(), redirect: vi.fn()
}));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

const id = "11111111-1111-4111-8111-111111111111";
const email = "person@example.test";
const requestId = "22222222-2222-4222-8222-222222222222";
const duplicateOpen = { code: "23505", hint: null,
  message: 'duplicate key value violates unique constraint "account_deletion_requests_one_open"',
  details: `Key (profile_id)=(${id}) already exists.` };
const duplicatePkey = { code: "23505", hint: null,
  message: 'duplicate key value violates unique constraint "account_deletion_requests_pkey"',
  details: `Key (id)=(${requestId}) already exists.` };
const otherError = { code: "42P01", hint: null, details: null,
  message: 'relation "public.account_deletion_requests" does not exist' };
const cookieNames = ["sb-vawqdqkaguhdgfhdebqw-auth-token", "sb-vawqdqkaguhdgfhdebqw-auth-token.0",
  "sb-vawqdqkaguhdgfhdebqw-auth-token.1", "x-session-expired"];

let requestResult: { data: { id: string } | null; error: typeof duplicateOpen | typeof otherError | null };
let feedbackResult: { error: null | { code: string; message: string } };
let feedbackThrow: Error | null;
let signOut: ReturnType<typeof vi.fn>;
let sessionFrom: ReturnType<typeof vi.fn>;
let from: ReturnType<typeof vi.fn>;
let insert: ReturnType<typeof vi.fn>;
let select: ReturnType<typeof vi.fn>;
let single: ReturnType<typeof vi.fn>;
let update: ReturnType<typeof vi.fn>;
let remove: ReturnType<typeof vi.fn>;
let upsert: ReturnType<typeof vi.fn>;
let cookieDelete: ReturnType<typeof vi.fn>;
let errorLog: ReturnType<typeof vi.spyOn>;

function form(confirmation = "DELETE") {
  const data = new FormData();
  data.set("confirmation", confirmation);
  return data;
}
function session(role: "owner" | "manager" | "tenant" = "tenant", userId = id) {
  mocks.requireAuth.mockResolvedValue({ user: { id: userId, email }, role,
    supabase: { auth: { signOut }, from: sessionFrom } });
}
async function run(data = form()) {
  return requestAccountDeletion(null, data);
}
async function redirected(data = form()) {
  await expect(run(data)).rejects.toThrow("REDIRECT:/login?deleted=requested");
}
function writesAreScoped() {
  expect(from.mock.calls.every(([table]) => ["account_deletion_requests", "feedback"].includes(table))).toBe(true);
  expect(update).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
  expect(upsert).not.toHaveBeenCalled();
  expect(sessionFrom).not.toHaveBeenCalled();
  expect(globalThis.fetch).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimitState();
  requestResult = { data: { id: requestId }, error: null };
  feedbackResult = { error: null };
  feedbackThrow = null;
  single = vi.fn(async () => requestResult);
  select = vi.fn(() => ({ single }));
  insert = vi.fn((_payload: unknown) => {
    const table = from.mock.calls.at(-1)?.[0];
    if (table === "account_deletion_requests") return { select };
    if (feedbackThrow) throw feedbackThrow;
    return Promise.resolve(feedbackResult);
  });
  update = vi.fn(); remove = vi.fn(); upsert = vi.fn();
  from = vi.fn(() => ({ insert, update, delete: remove, upsert }));
  mocks.createAdminClient.mockReturnValue({ from });
  signOut = vi.fn(async () => ({ error: null }));
  sessionFrom = vi.fn();
  session();
  cookieDelete = vi.fn();
  mocks.cookies.mockResolvedValue({ getAll: () => cookieNames.map((name) => ({ name })), delete: cookieDelete });
  mocks.logAudit.mockResolvedValue(undefined);
  mocks.redirect.mockImplementation((url: string) => { throw new Error(`REDIRECT:${url}`); });
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn());
});

describe("requestAccountDeletion", () => {
  it("requires an allowed signed-in role before any work", async () => {
    mocks.requireAuth.mockRejectedValue(new Error("REDIRECT:/login"));
    await expect(run()).rejects.toThrow("REDIRECT:/login");
    expect(mocks.requireAuth).toHaveBeenCalledWith("owner", "manager", "tenant");
    expect(from).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it.each(["owner", "manager", "tenant"] as const)("uses the %s session for the request", async (role) => {
    session(role);
    await redirected();
    expect(insert.mock.calls[0][0]).toEqual({ profile_id: id, email_at_request: email, role_at_request: role });
    expect(select).toHaveBeenCalledWith("id");
    expect(single).toHaveBeenCalledOnce();
    writesAreScoped();
  });

  it.each(["", "delete", "Delete", " DELETE", "DELETE "])("rejects nonexact confirmation %j", async (value) => {
    expect(await run(form(value))).toEqual({ success: false, error: "Type DELETE to confirm." });
    expect(from).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("limits the same user after three tries and allows another user", async () => {
    for (const value of ["", "delete", "Delete"]) await run(form(value));
    expect(await run()).toEqual({ success: false, error: "Too many tries. Please wait 10 minutes." });
    expect(from).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
    session("tenant", "33333333-3333-4333-8333-333333333333");
    await redirected();
  });

  it("writes exact feedback and audit once, then signs out before redirect", async () => {
    await redirected();
    expect(from.mock.calls.map(([table]) => table)).toEqual(["account_deletion_requests", "feedback"]);
    expect(insert.mock.calls[1][0]).toEqual({ type: "other", message: "Account deletion requested (tenant).",
      email, profile_id: id, page_url: "/settings", user_role: "tenant", status: "new" });
    expect(mocks.logAudit).toHaveBeenCalledExactlyOnceWith({ userId: id,
      action: "request_account_deletion", entityType: "account_deletion_request", entityId: requestId,
      metadata: { role: "tenant" } });
    expect(signOut).toHaveBeenCalledExactlyOnceWith({ scope: "global" });
    expect(signOut.mock.invocationCallOrder[0]).toBeLessThan(mocks.redirect.mock.invocationCallOrder[0]);
    writesAreScoped();
  });

  it("treats only the open-request index as an idempotent success", async () => {
    requestResult = { data: null, error: duplicateOpen };
    await redirected();
    expect(from).toHaveBeenCalledExactlyOnceWith("account_deletion_requests");
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledWith({ scope: "global" });
  });

  it.each([duplicatePkey, otherError])("rejects a non-open insert error", async (failure) => {
    requestResult = { data: null, error: failure };
    expect(await run()).toEqual({ success: false, error: "We could not send your request. Please try again." });
    expect(errorLog).toHaveBeenCalledWith("[account-deletion] insert failed",
      { code: failure.code, message: failure.message });
    expect(from).toHaveBeenCalledExactlyOnceWith("account_deletion_requests");
    expect(signOut).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it("does not sign out when the insert returns no request id", async () => {
    requestResult = { data: null, error: null };
    expect(await run()).toEqual({ success: false, error: "We could not send your request. Please try again." });
    expect(signOut).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("continues when feedback returns an error", async () => {
    feedbackResult = { error: { code: "42P01", message: "feedback unavailable" } };
    await redirected();
    expect(errorLog).toHaveBeenCalledWith("[account-deletion] feedback failed",
      { code: "42P01", message: "feedback unavailable" });
    expect(mocks.logAudit).toHaveBeenCalledOnce();
  });

  it("continues when feedback throws", async () => {
    feedbackThrow = new Error("feedback unavailable");
    await redirected();
    expect(errorLog).toHaveBeenCalledWith("[account-deletion] feedback failed",
      { code: null, message: "feedback unavailable" });
    expect(mocks.logAudit).toHaveBeenCalledOnce();
  });

  it("continues when audit throws", async () => {
    mocks.logAudit.mockRejectedValue(new Error("audit unavailable"));
    await redirected();
    expect(errorLog).toHaveBeenCalledWith("[account-deletion] audit failed",
      { code: null, message: "audit unavailable" });
  });

  it("does not use local sign-out or cookie deletion after global success", async () => {
    await redirected();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(mocks.cookies).not.toHaveBeenCalled();
  });

  it("uses local sign-out after a global error", async () => {
    signOut.mockResolvedValueOnce({ error: { code: "500", message: "global failed" } })
      .mockResolvedValueOnce({ error: null });
    await redirected();
    expect(signOut.mock.calls.map(([options]) => options)).toEqual([{ scope: "global" }, { scope: "local" }]);
    expect(mocks.cookies).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith("[account-deletion] global sign-out failed",
      { code: "500", message: "global failed" });
  });

  it.each(["returns errors", "throws"])("clears only auth cookies when sign-out %s", async (mode) => {
    if (mode === "throws") signOut.mockRejectedValue(new Error("auth unavailable"));
    else signOut.mockResolvedValue({ error: { code: "500", message: "auth unavailable" } });
    await redirected();
    expect(signOut.mock.calls.map(([options]) => options)).toEqual([{ scope: "global" }, { scope: "local" }]);
    expect(cookieDelete.mock.calls.map(([name]) => name)).toEqual(cookieNames.slice(0, 3));
    for (const scope of ["global", "local"]) {
      expect(errorLog).toHaveBeenCalledWith(`[account-deletion] ${scope} sign-out failed`,
        { code: mode === "throws" ? null : "500", message: "auth unavailable" });
    }
  });

  it("logs cookie clearing failure and still redirects", async () => {
    signOut.mockRejectedValue(new Error("auth unavailable"));
    mocks.cookies.mockRejectedValue(new Error("cookies unavailable"));
    await redirected();
    expect(errorLog).toHaveBeenCalledWith("[account-deletion] cookie clear failed",
      { code: null, message: "cookies unavailable" });
  });

  it("ignores forged identity fields", async () => {
    const data = form();
    for (const [key, value] of Object.entries({ profile_id: "forged", email: "forged@example.test",
      email_at_request: "forged@example.test", role: "owner", role_at_request: "owner" })) data.set(key, value);
    await redirected(data);
    expect(insert.mock.calls[0][0]).toEqual({ profile_id: id, email_at_request: email, role_at_request: "tenant" });
    expect(insert.mock.calls[1][0]).toMatchObject({ email, profile_id: id, user_role: "tenant" });
    expect(mocks.logAudit.mock.calls[0][0]).toMatchObject({ userId: id, metadata: { role: "tenant" } });
  });

  it("does not log the session email or use unrelated writes", async () => {
    requestResult = { data: null, error: otherError };
    await run();
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(email);
    writesAreScoped();
  });
});
