import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), role: vi.fn(), limit: vi.fn(), active: vi.fn(),
  tables: {} as Record<string, Array<Record<string, unknown>>> }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getCheckedAuthUser: mocks.user, getCurrentUserRole: mocks.role }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.limit }));
vi.mock("@/lib/client-accounts", () => ({ isActiveClientManager: mocks.active }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (table: string) => {
  let rows = mocks.tables[table] ?? [];
  const q = { select: () => q, eq: (key: string, value: unknown) => {
    rows = rows.filter((row) => row[key] === value); return q;
  }, in: () => q, gte: () => q, lt: () => q, order: () => q,
  range: async () => ({ data: rows, error: null }), maybeSingle: async () => ({ data: rows[0] ?? null, error: null }) };
  return q;
} }) }));
import { loadStatementDownload } from "../owner-statement";
const id = "00000000-0000-4000-8000-000000000001";
const url = (accountId = id, month = "2026-10") =>
  new Request(`https://example.test/api/pdf/owner-statement?accountId=${accountId}&month=${month}`);
beforeEach(() => {
  mocks.user.mockReset().mockResolvedValue({ id: "m" });
  mocks.role.mockReset().mockResolvedValue("manager");
  mocks.limit.mockReset().mockReturnValue({ allowed: true });
  mocks.active.mockReset().mockResolvedValue(true);
  mocks.tables = { ownership_accounts: [{ id, display_name: "Client", account_type: "llc", managed_client: true }],
    profiles: [{ id: "m", full_name: "Manager", email: "m@example.test" }], properties: [] };
});
describe("statement download access", () => {
  const status = async (request: Request) => {
    const result = await loadStatementDownload(request);
    return result.ok ? 200 : result.response.status;
  };
  it("returns 401 signed out and 403 for owner and tenant", async () => {
    mocks.user.mockResolvedValue(null);
    expect(await status(url())).toBe(401);
    mocks.user.mockResolvedValue({ id: "m" });
    for (const role of ["owner", "tenant"]) {
      mocks.role.mockResolvedValue(role);
      expect(await status(url())).toBe(403);
    }
  });
  it("returns 400 for bad UUID, month, or future month", async () => {
    expect(await status(url("bad"))).toBe(400);
    expect(await status(url(id, "2026-13"))).toBe(400);
    expect(await status(url(id, "2099-01"))).toBe(400);
  });
  it("returns 429 at the limit", async () => {
    mocks.limit.mockReturnValue({ allowed: false });
    expect(await status(url())).toBe(429);
  });
  it("returns 404 for an inactive manager before account data", async () => {
    mocks.active.mockResolvedValue(false);
    expect(await status(url())).toBe(404);
    expect(mocks.active).toHaveBeenCalledWith("m", id);
  });
  it("returns 500 for a data error and 200 for a valid client", async () => {
    mocks.active.mockRejectedValueOnce(new Error("query failed"));
    expect(await status(url())).toBe(500);
    expect(await status(url())).toBe(200);
  });
});
