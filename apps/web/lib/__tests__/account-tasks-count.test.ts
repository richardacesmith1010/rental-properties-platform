import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), partners: [] as Array<{ id: string; account_id: string }>,
  count: 0, filters: [] as Array<[string, unknown]> }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ from: mocks.from }) }));
import { countMyDueTasks } from "@/lib/account-tasks";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.filters.length = 0; mocks.count = 0; mocks.partners = [];
  mocks.from.mockImplementation((table: string) => {
    const q = { select: () => q, eq: (key: string, value: unknown) => {
      mocks.filters.push([key, value]); return q;
    }, in: (key: string, value: unknown) => { mocks.filters.push([key, value]); return q; },
    lte: (key: string, value: unknown) => { mocks.filters.push([key, value]); return q; },
    then: (resolve: (value: unknown) => void) => Promise.resolve(table === "account_partners"
      ? { data: mocks.partners, error: null } : { count: mocks.count, error: null }).then(resolve) };
    return q;
  });
});
describe("countMyDueTasks", () => {
  it("counts only active assigned partner tasks due within seven days", async () => {
    mocks.partners = [{ id: "my-partner", account_id: "llc-1" }, { id: "my-other", account_id: "llc-2" }];
    mocks.count = 3;
    expect(await countMyDueTasks("me", new Date("2026-10-13T12:00:00Z"))).toBe(3);
    expect(mocks.from).toHaveBeenCalledTimes(2);
    expect(mocks.filters).toContainEqual(["profile_id", "me"]);
    expect(mocks.filters).toContainEqual(["owner_partner_id", ["my-partner", "my-other"]]);
    expect(mocks.filters).toContainEqual(["active", true]);
    expect(mocks.filters).toContainEqual(["next_due_on", "2026-10-20"]);
  });
  it("skips the task query when the user has no active partner rows", async () => {
    expect(await countMyDueTasks("me", new Date("2026-10-13T12:00:00Z"))).toBe(0);
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });
});
