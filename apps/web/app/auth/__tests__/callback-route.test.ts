// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ createClient: vi.fn(), manager: vi.fn(), tenant: vi.fn(),
  notify: vi.fn(), state: vi.fn(), route: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/invitations", () => ({ markManagerInvitationsAccepted: mocks.manager,
  markTenantInvitationAccepted: mocks.tenant }));
vi.mock("@/lib/notifications", () => ({ notifyOwnerMembersOfAcceptedTenantInvite: mocks.notify }));
vi.mock("@/lib/auth", () => ({ getAuthState: mocks.state }));
vi.mock("@/lib/route-resolver", () => ({ resolveAuthRoute: mocks.route }));
import { GET } from "@/app/auth/callback/route";
const userId = crypto.randomUUID();
let exchange: ReturnType<typeof vi.fn>;
let verify: ReturnType<typeof vi.fn>;
let session: ReturnType<typeof vi.fn>;
let user: { id: string; invited_at?: string | null; user_metadata?: Record<string, unknown> };
const url = (query: string) => new Request(`https://app.example.com/auth/callback?${query}`);
beforeEach(() => {
  vi.clearAllMocks();
  user = { id: userId, invited_at: null, user_metadata: { role: "manager" } };
  exchange = vi.fn().mockResolvedValue({ error: null });
  verify = vi.fn().mockResolvedValue({ error: null });
  session = vi.fn().mockResolvedValue({ error: null });
  mocks.createClient.mockReturnValue({ auth: { exchangeCodeForSession: exchange, verifyOtp: verify,
    setSession: session, getUser: vi.fn().mockImplementation(async () => ({ data: { user } })) } });
  mocks.manager.mockResolvedValue(undefined); mocks.tenant.mockResolvedValue(undefined);
  mocks.notify.mockResolvedValue(undefined); mocks.state.mockResolvedValue({ role: "manager" });
  mocks.route.mockReturnValue("/manager");
});

describe("A29 manager acceptance on callback sessions", () => {
  it("runs once on the code branch", async () => {
    const response = await GET(url("code=abc"));
    expect(response.headers.get("location")).toBe("https://app.example.com/manager");
    expect(exchange).toHaveBeenCalledWith("abc");
    expect(mocks.manager).toHaveBeenCalledOnce(); expect(mocks.manager).toHaveBeenCalledWith(userId);
    expect(mocks.tenant).not.toHaveBeenCalled();
  });
  it.each(["invite", "magiclink"])("runs once for token_hash %s", async (type) => {
    const response = await GET(url(`token_hash=tok&type=${type}`));
    expect(response.headers.get("location")).toBe("https://app.example.com/manager");
    expect(verify).toHaveBeenCalledWith({ token_hash: "tok", type });
    expect(mocks.manager).toHaveBeenCalledOnce();
    expect(mocks.tenant).toHaveBeenCalledTimes(type === "invite" ? 1 : 0);
  });
  it("runs on the setSession branch", async () => {
    await GET(url("access_token=a&refresh_token=b"));
    expect(session).toHaveBeenCalledOnce(); expect(mocks.manager).toHaveBeenCalledWith(userId);
    expect(mocks.tenant).not.toHaveBeenCalled();
  });
  it("tenant acceptance still uses hasInvitedSession", async () => {
    user.invited_at = "2026-10-18T00:00:00.000Z";
    await GET(url("code=abc"));
    expect(mocks.tenant).toHaveBeenCalledWith(userId);
  });
  it("a manager acceptance rejection preserves route resolution", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.manager.mockRejectedValueOnce(new Error("test failure"));
    const response = await GET(url("code=abc"));
    expect(response.headers.get("location")).toBe("https://app.example.com/manager");
    expect(mocks.route).toHaveBeenCalledOnce(); expect(spy).toHaveBeenCalled(); spy.mockRestore();
  });
  it("PKCE miss has no session and never calls acceptance", async () => {
    exchange.mockResolvedValueOnce({ error: { message: "code verifier missing" } });
    const response = await GET(url("code=abc"));
    expect(response.headers.get("location")).toContain("/login?confirmed=true");
    expect(mocks.manager).not.toHaveBeenCalled();
  });
});
