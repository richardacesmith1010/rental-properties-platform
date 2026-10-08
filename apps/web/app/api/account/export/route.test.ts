import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(), role: vi.fn(), limit: vi.fn(), build: vi.fn()
}));
vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: mocks.user, getCurrentUserRole: mocks.role }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.limit }));
vi.mock("@/lib/account-export", () => ({ buildAccountExport: mocks.build }));
import { GET } from "./route";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ id: "me" });
  mocks.role.mockResolvedValue("tenant");
  mocks.limit.mockReturnValue({ allowed: true });
  mocks.build.mockResolvedValue({ exportVersion: 1, generatedAt: "2026-10-07T00:00:00Z", accountRole: "tenant" });
});

describe("GET account export", () => {
  it("returns the attachment with private no-store headers", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toMatch(/^attachment; filename="domus-my-data-\d{4}-\d{2}-\d{2}\.json"$/);
    const generatedAt = mocks.build.mock.calls[0][2] as string;
    expect(response.headers.get("Content-Disposition"))
      .toBe(`attachment; filename="domus-my-data-${generatedAt.slice(0, 10)}.json"`);
    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(mocks.limit).toHaveBeenCalledWith("export:me", 5, 3_600_000);
    expect(mocks.build).toHaveBeenCalledWith("me", "tenant", expect.any(String));
    expect(await response.json()).toMatchObject({ exportVersion: 1, accountRole: "tenant" });
  });

  it("rejects owners before querying", async () => {
    mocks.role.mockResolvedValue("owner");
    const response = await GET();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Not available for owners yet." });
    expect(mocks.build).not.toHaveBeenCalled();
  });

  it("returns 429 when the user reaches the limit", async () => {
    mocks.limit.mockReturnValue({ allowed: false });
    const response = await GET();
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "Too many downloads. Try again later." });
  });

  it("fails closed if the limiter throws", async () => {
    mocks.limit.mockImplementation(() => { throw new Error("limit down"); });
    const response = await GET();
    expect(response.status).toBe(503);
    expect(mocks.build).not.toHaveBeenCalled();
  });

  it("never returns partial data on a query error", async () => {
    mocks.build.mockRejectedValue(new Error("secret row"));
    const response = await GET();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Download is unavailable. Please try again." });
  });

  it("returns JSON 401 for the auth helper's redirect", async () => {
    mocks.user.mockRejectedValue({ digest: "NEXT_REDIRECT;replace;/login" });
    const response = await GET();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Please sign in." });
  });
});
