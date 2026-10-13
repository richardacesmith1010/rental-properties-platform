import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ calls: [] as string[], result: { data: [] as unknown[], error: null as unknown } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({
  from: (table: string) => {
    mocks.calls.push(`from:${table}`);
    const query = {
      select: () => query,
      eq: (column: string) => { mocks.calls.push(`eq:${column}`); return query; },
      is: (column: string) => { mocks.calls.push(`is:${column}`); return query; },
      then: (resolve: (result: typeof mocks.result) => unknown) => resolve(mocks.result)
    };
    return query;
  }
}) }));

import { getActiveLlcMembershipsForUser } from "@/lib/ownership";

describe("getActiveLlcMembershipsForUser membership query", () => {
  it("issues one membership query without deleted_at", async () => {
    mocks.calls.length = 0;
    mocks.result = { data: [], error: null };
    expect(await getActiveLlcMembershipsForUser("owner-1")).toEqual([]);
    expect(mocks.calls).toEqual(["from:ownership_account_members", "eq:profile_id", "eq:active"]);
  });

  it("throws the membership query error", async () => {
    mocks.calls.length = 0;
    const error = { code: "42501", message: "permission denied" };
    mocks.result = { data: [], error };
    await expect(getActiveLlcMembershipsForUser("owner-1")).rejects.toBe(error);
    expect(mocks.calls.filter((call) => call === "from:ownership_account_members")).toHaveLength(1);
  });
});
