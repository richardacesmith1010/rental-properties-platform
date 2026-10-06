import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: queryMock }) }));

import { GET } from "@/app/api/health/cron/route";

function setQueryResults(results: Array<{ data: unknown; error: unknown }>) {
  let index = 0;
  queryMock.mockImplementation(() => {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      maybeSingle: vi.fn(() => Promise.resolve(results[index++]))
    };
    return chain;
  });
}

function success(job_name: string, hoursAgo: number) {
  return {
    data: {
      job_name,
      status: "success",
      completed_at: new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString(),
      operations: [{ error: "private operation" }],
      error: "private error"
    },
    error: null
  };
}

describe("/api/health/cron", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 when both jobs have fresh successes without exposing run details", async () => {
    setQueryResults([success("generate-charges", 1), success("verify-stripe-accounts", 1)]);
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.ok).toBe(true);
    expect(body.jobs).toHaveLength(2);
    expect(JSON.stringify(body)).not.toMatch(/operations|private operation|private error|"error"/);
  });

  it("returns 503 when one job has no successful run", async () => {
    setQueryResults([success("generate-charges", 1), { data: null, error: null }]);
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.jobs[1]).toMatchObject({ job: "verify-stripe-accounts", lastSuccessAt: null, stale: true });
  });

  it("returns a fixed 503 message on a database error", async () => {
    setQueryResults([success("generate-charges", 1), { data: null, error: { message: "private DB error" } }]);
    const response = await GET();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ ok: false, error: "Cron health check unavailable." });
  });
});
