import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/webhooks/plaid/route";
import { GET } from "@/app/api/cron/bank-sync/route";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/bank-feed/webhook-verification", () => ({ verifyPlaidWebhook: vi.fn() }));
vi.mock("@/lib/bank-feed/sync", () => ({ syncConnection: vi.fn(async () => true) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
import { verifyPlaidWebhook } from "@/lib/bank-feed/webhook-verification";
import { syncConnection } from "@/lib/bank-feed/sync";
import { createAdminClient } from "@/lib/supabase/admin";

function webhook(body: unknown, jwt = "signature") {
  return new NextRequest("https://domus.example/api/webhooks/plaid", { method: "POST",
    headers: { "Plaid-Verification": jwt }, body: JSON.stringify(body) });
}
function adminWithConnection(status: string | null) {
  const updates: unknown[] = [];
  const filters: Array<[string, string, unknown]> = [];
  const query = { select: () => query, eq: (key: string, value: unknown) => { filters.push(["eq", key, value]); return query; },
    neq: (key: string, value: unknown) => { filters.push(["neq", key, value]); return query; },
    update: (value: unknown) => { updates.push(value); return query; },
    maybeSingle: async () => ({ data: status ? { id: "connection", status } : null, error: null }),
    then: (resolve: (value: unknown) => void) => Promise.resolve({ data: null, error: null }).then(resolve) };
  return { from: vi.fn(() => query), updates, filters };
}

beforeEach(() => vi.clearAllMocks());

describe("Sprint 224 webhook route", () => {
  it("rejects invalid verification before any database work", async () => {
    vi.mocked(verifyPlaidWebhook).mockResolvedValue(false);
    const result = await POST(webhook({ item_id: "item", webhook_type: "TRANSACTIONS",
      webhook_code: "SYNC_UPDATES_AVAILABLE" }));
    expect(result.status).toBe(401);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("syncs a valid update and acknowledges unknown or pending items", async () => {
    vi.mocked(verifyPlaidWebhook).mockResolvedValue(true);
    const event = { item_id: "item", webhook_type: "TRANSACTIONS", webhook_code: "SYNC_UPDATES_AVAILABLE" };
    vi.mocked(createAdminClient).mockReturnValue(adminWithConnection("ok") as never);
    expect((await POST(webhook(event))).status).toBe(200);
    expect(syncConnection).toHaveBeenCalledWith("connection");
    vi.mocked(syncConnection).mockClear();
    vi.mocked(createAdminClient).mockReturnValue(adminWithConnection("pending_account_match") as never);
    expect((await POST(webhook(event))).status).toBe(200);
    expect(syncConnection).not.toHaveBeenCalled();
    vi.mocked(createAdminClient).mockReturnValue(adminWithConnection(null) as never);
    expect((await POST(webhook(event))).status).toBe(200);
  });

  it("sets login and revoked statuses conditionally", async () => {
    vi.mocked(verifyPlaidWebhook).mockResolvedValue(true);
    const admin = adminWithConnection("ok");
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    await POST(webhook({ item_id: "item", webhook_type: "ITEM", webhook_code: "ERROR",
      error: { error_code: "ITEM_LOGIN_REQUIRED" } }));
    await POST(webhook({ item_id: "item", webhook_type: "ITEM", webhook_code: "USER_PERMISSION_REVOKED" }));
    expect(admin.updates).toEqual([{ status: "needs_login" }, { status: "revoked" }]);
  });
  it("7c repeated ITEM errors retain the conditional revoked guard", async () => {
    vi.mocked(verifyPlaidWebhook).mockResolvedValue(true);
    const admin = adminWithConnection("revoked");
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    const event = { item_id: "item", webhook_type: "ITEM", webhook_code: "ERROR",
      error: { error_code: "ITEM_LOGIN_REQUIRED" } };
    await POST(webhook(event)); await POST(webhook(event));
    expect(admin.filters.filter(([kind, key, value]) => kind === "neq" && key === "status" && value === "revoked"))
      .toHaveLength(2);
  });
  it("7c duplicate SYNC_UPDATES_AVAILABLE delivery delegates replay to fenced sync", async () => {
    vi.mocked(verifyPlaidWebhook).mockResolvedValue(true);
    vi.mocked(createAdminClient).mockReturnValue(adminWithConnection("ok") as never);
    vi.mocked(syncConnection).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const event = { item_id: "item", webhook_type: "TRANSACTIONS", webhook_code: "SYNC_UPDATES_AVAILABLE" };
    await POST(webhook(event)); await POST(webhook(event));
    expect(vi.mocked(syncConnection).mock.results.map((result) => result.type)).toEqual(["return", "return"]);
    expect(await Promise.all(vi.mocked(syncConnection).mock.results.map((result) => result.value))).toEqual([true, false]);
  });
});

describe("Sprint 224 cron route", () => {
  it("requires CRON_SECRET and continues after one connection fails", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    const denied = await GET(new NextRequest("https://domus.example/api/cron/bank-sync"));
    expect(denied.status).toBe(401);
    expect(createAdminClient).not.toHaveBeenCalled();
    const query = { select: () => query, in: () => query, or: () => query,
      then: (resolve: (value: unknown) => void) => Promise.resolve({
        data: [{ id: "first" }, { id: "second" }], error: null }).then(resolve) };
    vi.mocked(createAdminClient).mockReturnValue({ from: () => query } as never);
    vi.mocked(syncConnection).mockRejectedValueOnce(new Error("first failed")).mockResolvedValueOnce(true);
    const response = await GET(new NextRequest("https://domus.example/api/cron/bank-sync", {
      headers: { authorization: "Bearer cron-secret" } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ synced: 1, failed: 1 });
    expect(syncConnection).toHaveBeenCalledTimes(2);
  });
  it("5 and 6b0 cron selects stale ok and error connections, excluding pending account match", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    const filters: Array<[string, unknown]> = [];
    const query = { select: () => query,
      in: (key: string, value: unknown) => { filters.push([key, value]); return query; },
      or: (value: string) => { filters.push(["or", value]); return query; },
      then: (resolve: (value: unknown) => void) => Promise.resolve({ data: [], error: null }).then(resolve) };
    vi.mocked(createAdminClient).mockReturnValue({ from: () => query } as never);
    await GET(new NextRequest("https://domus.example/api/cron/bank-sync", {
      headers: { authorization: "Bearer cron-secret" } }));
    expect(filters[0]).toEqual(["status", ["ok", "error"]]);
    expect(filters[1][0]).toBe("or");
    expect(filters[1][1]).toMatch(/^last_synced_at\.is\.null,last_synced_at\.lt\./);
    expect(filters[1][1]).not.toContain("pending_account_match");
  });
});
