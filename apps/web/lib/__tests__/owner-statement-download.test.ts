import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), role: vi.fn(), limit: vi.fn(), active: vi.fn(), managed: vi.fn(),
  from: vi.fn(), tables: {} as Record<string, Array<Record<string, unknown>>> }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getCheckedAuthUser: mocks.user, getCurrentUserRole: mocks.role }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.limit }));
vi.mock("@/lib/client-accounts", () => ({ isActiveClientManager: mocks.active, getManagedHomeIds: mocks.managed }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from.mockImplementation((table: string) => {
  let rows = mocks.tables[table] ?? [];
  const q = { select: () => q, eq: (key: string, value: unknown) => {
    rows = rows.filter((row) => row[key] === value); return q;
  }, in: () => q, gte: () => q, lt: () => q, order: () => q,
  range: async () => ({ data: rows, error: null }), maybeSingle: async () => ({ data: rows[0] ?? null, error: null }) };
  return q;
}) }) }));
import { loadStatementDownload } from "../owner-statement";
import { ownerStatementRequestSchema } from "../validations";
const id = "00000000-0000-4000-8000-000000000001";
const url = (accountId = id, month = "2026-10") =>
  new Request(`https://example.test/api/pdf/owner-statement?accountId=${accountId}&month=${month}`);
beforeEach(() => {
  mocks.user.mockReset().mockResolvedValue({ id: "m" });
  mocks.role.mockReset().mockResolvedValue("manager");
  mocks.limit.mockReset().mockReturnValue({ allowed: true });
  mocks.active.mockReset().mockResolvedValue(true); mocks.managed.mockReset().mockResolvedValue(["h1"]);
  mocks.from.mockReset();
  mocks.tables = { ownership_accounts: [{ id, display_name: "Client", account_type: "llc", managed_client: true }],
    profiles: [{ id: "m", full_name: "Manager", email: "m@example.test" }], properties: [] };
});
describe("statement download access", () => {
  it("limits requested homes to 100", () => {
    const input = { accountId: id, month: "2026-10", propertyIds: Array(101).fill(id) };
    expect(ownerStatementRequestSchema.safeParse(input).success).toBe(false);
    expect(ownerStatementRequestSchema.safeParse({ ...input, propertyIds: input.propertyIds.slice(0, 100) }).success)
      .toBe(true);
  });
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
    expect(mocks.active.mock.invocationCallOrder[0]).toBeLessThan(mocks.from.mock.invocationCallOrder[0]);
  });
  it("reads only the account before refusing an unlinked manager", async () => {
    mocks.active.mockResolvedValue(false);
    const result = await loadStatementDownload(url());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(404);
      expect(await result.response.json()).toEqual({ ok: false, error: "Statement unavailable." });
    }
    expect(mocks.from.mock.calls.map(([table]) => table)).toEqual(["ownership_accounts"]);
  });
  it("gives the same not-found result for an unrelated Domus owner and unknown account", async () => {
    mocks.tables.ownership_accounts[0].managed_client = false;
    mocks.managed.mockResolvedValue(["elsewhere"]);
    mocks.tables.properties = [{ id: "elsewhere", owner_account_id: "other", name: "Elsewhere", active: true }];
    const unrelated = await loadStatementDownload(url());
    mocks.tables.ownership_accounts = [];
    const unknown = await loadStatementDownload(url());
    expect(unrelated.ok).toBe(false);
    expect(unknown.ok).toBe(false);
    if (!unrelated.ok && !unknown.ok) {
      expect(unrelated.response.status).toBe(unknown.response.status);
      expect(await unrelated.response.json()).toEqual(await unknown.response.json());
    }
  });
  it("checks client membership before any statement data read", async () => {
    expect(await status(url())).toBe(200);
    expect(mocks.active.mock.invocationCallOrder[0]).toBeLessThan(mocks.from.mock.invocationCallOrder[0]);
  });
  it("returns 500 for a data error and 200 for a valid client", async () => {
    mocks.active.mockRejectedValueOnce(new Error("query failed"));
    expect(await status(url())).toBe(500);
    expect(await status(url())).toBe(200);
  });
  it("rejects a PDF or CSV request that includes an unmanaged home", async () => {
    mocks.tables.ownership_accounts[0].managed_client = false;
    const managedHome = "00000000-0000-4000-8000-000000000002";
    const otherHome = "00000000-0000-4000-8000-000000000003";
    mocks.managed.mockResolvedValue([managedHome]);
    mocks.tables.properties = [{ id: managedHome, owner_account_id: id, name: "Managed", active: true }];
    const request = new Request(`${url().url}&propertyId=${managedHome}&propertyId=${otherHome}`);
    const result = await loadStatementDownload(request);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      expect(await result.response.json()).toMatchObject({ error: "You do not manage this home." });
    }
  });
});
