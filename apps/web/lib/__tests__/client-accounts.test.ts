import { beforeEach, describe, expect, it, vi } from "vitest";

const admin = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: admin }));
import {
  assertStripeEligibleAccount, assertStripeEligibleProperty, getClientState,
  getClientStateForProperty, getPropertyIdForLease, isActiveClientManager, isUnclaimedClientAccount,
  isUnclaimedClientProperty, listClientAccountsForManager, getManagedHomeIds, StripeNotEligibleError
} from "@/lib/client-accounts";

function query(result: { data?: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "order"]) builder[method] = vi.fn(() => builder);
  builder.range = vi.fn().mockResolvedValue(result);
  builder.maybeSingle = vi.fn().mockResolvedValue(result);
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return builder;
}

beforeEach(() => vi.clearAllMocks());

describe("client account helpers", () => {
  it("pages active manager homes beyond the Supabase row limit", async () => {
    const rows = Array.from({ length: 1001 }, (_, index) => ({ property_id: `h${index}` }));
    const ranges: Array<[number, number]> = [];
    const builder = query({ data: [] });
    builder.range = vi.fn(async (from: number, to: number) => {
      ranges.push([from, to]);
      return { data: rows.slice(from, to + 1), error: null };
    });
    admin.mockReturnValue({ from: () => builder });
    expect(await getManagedHomeIds("manager")).toHaveLength(1001);
    expect(ranges).toEqual([[0, 999], [1000, 1999]]);
  });
  it("reads only active manager assignments", async () => {
    const builder = query({ data: [{ property_id: "h1" }, { property_id: "h2" }] });
    builder.eq = vi.fn((key: string, value: unknown) => key === "active" && value === true
      ? query({ data: [{ property_id: "h1" }] }) : builder);
    admin.mockReturnValue({ from: () => builder });
    expect(await getManagedHomeIds("manager")).toEqual(["h1"]);
    expect(builder.eq).toHaveBeenCalledWith("active", true);
  });
  it("throws on every state and manager lookup error", async () => {
    admin.mockReturnValue({ from: () => query({ error: { code: "PGRST205" } }) });
    await expect(getClientState("account")).rejects.toEqual({ code: "PGRST205" });
    await expect(getClientStateForProperty("property")).rejects.toEqual({ code: "PGRST205" });
    await expect(isActiveClientManager("manager", "account")).rejects.toEqual({ code: "PGRST205" });
    await expect(isUnclaimedClientAccount("account")).rejects.toEqual({ code: "PGRST205" });
    await expect(isUnclaimedClientProperty("property")).rejects.toEqual({ code: "PGRST205" });
    await expect(getPropertyIdForLease("lease")).rejects.toEqual({ code: "PGRST205" });
  });

  it("blocks Stripe on an unclaimed client and lookup failures", async () => {
    admin.mockReturnValue({ from: (table: string) => table === "properties"
      ? query({ data: { owner_account_id: "account" }, error: null })
      : query({ data: { managed_client: true, claim_state: "unclaimed" }, error: null }) });
    await expect(assertStripeEligibleAccount("account")).rejects.toBeInstanceOf(StripeNotEligibleError);
    await expect(assertStripeEligibleProperty("property")).rejects.toBeInstanceOf(StripeNotEligibleError);
    admin.mockReturnValue({ from: () => query({ error: { code: "PGRST205" } }) });
    await expect(assertStripeEligibleAccount("account")).rejects.toBeInstanceOf(StripeNotEligibleError);
    await expect(assertStripeEligibleProperty("property")).rejects.toBeInstanceOf(StripeNotEligibleError);
  });

  it("keeps legacy homes with no account eligible", async () => {
    const from = vi.fn(() => query({ data: { id: "legacy", owner_account_id: null }, error: null }));
    admin.mockReturnValue({ from });
    await expect(assertStripeEligibleProperty("legacy")).resolves.toBeUndefined();
    expect(from).toHaveBeenCalledTimes(2);
  });

  it("lists only active links and counts homes in one query", async () => {
    const from = vi.fn((table: string) => {
      if (table === "ownership_account_managers") return query({ data: [{ account_id: "Y" }] });
      if (table === "property_managers") return query({ data: [] });
      if (table === "ownership_accounts") return query({ data: [
        { id: "Y", display_name: "Client Y", account_type: "llc", claim_state: "unclaimed", managed_client: true }
      ] });
      return query({ data: [{ id: "home", owner_account_id: "Y" }] });
    });
    admin.mockReturnValue({ from });
    expect(await listClientAccountsForManager("manager")).toEqual([{
      id: "Y", kind: "client", name: "Client Y", accountType: "llc", claimState: "unclaimed", homeCount: 1
    }]);
    expect(from.mock.calls.filter(([table]) => table === "properties")).toHaveLength(1);
  });

  it("keeps managers' client lists isolated", async () => {
    const from = vi.fn((table: string) => {
      if (table === "property_managers") return query({ data: [] });
      if (table === "ownership_account_managers") {
        const builder = query({ data: [] });
        builder.eq = vi.fn((column: string, value: string) => column === "manager_profile_id"
          ? query({ data: [{ account_id: value === "A" ? "client-A" : "client-B" }] }) : builder);
        return builder;
      }
      if (table === "ownership_accounts") return query({ data: [
        { id: "client-A", display_name: "A", account_type: "individual", claim_state: "unclaimed", managed_client: true },
        { id: "client-B", display_name: "B", account_type: "llc", claim_state: "unclaimed", managed_client: true }
      ] });
      return query({ data: [] });
    });
    admin.mockReturnValue({ from });
    expect((await listClientAccountsForManager("A")).map((row) => row.id)).toEqual(["client-A"]);
    expect((await listClientAccountsForManager("B")).map((row) => row.id)).toEqual(["client-B"]);
  });
  it("lists a Domus owner with only actively assigned homes", async () => {
    const from = vi.fn((table: string) => {
      if (table === "ownership_account_managers") return query({ data: [] });
      if (table === "property_managers") return query({ data: [{ property_id: "h1" }] });
      if (table === "properties") return query({ data: [{ id: "h1", owner_account_id: "owner", active: true }] });
      if (table === "ownership_accounts") return query({ data: [{ id: "owner", display_name: "Domus Owner",
        account_type: "individual", claim_state: "claimed", managed_client: false }] });
      return query({ data: [] });
    });
    admin.mockReturnValue({ from });
    expect(await listClientAccountsForManager("manager")).toEqual([{
      id: "owner", kind: "domusOwner", name: "Domus Owner", accountType: "individual",
      claimState: "claimed", homeCount: 1
    }]);
  });
  it("does not list a managed client reached only through a home assignment", async () => {
    const from = vi.fn((table: string) => {
      if (table === "ownership_account_managers") return query({ data: [] });
      if (table === "property_managers") return query({ data: [{ property_id: "h1" }] });
      if (table === "properties") return query({ data: [{ id: "h1", owner_account_id: "client", active: true }] });
      if (table === "ownership_accounts") return query({ data: [{ id: "client", display_name: "Client",
        account_type: "individual", claim_state: "claimed", managed_client: true }] });
      return query({ data: [] });
    });
    admin.mockReturnValue({ from });
    expect(await listClientAccountsForManager("manager")).toEqual([]);
  });
  it("chunks managed home IDs before loading linked owner accounts", async () => {
    const rows = Array.from({ length: 201 }, (_, index) => ({ property_id: `h${index}` }));
    const propertyLists: number[] = [];
    const from = vi.fn((table: string) => {
      if (table === "property_managers") return query({ data: rows });
      if (table === "ownership_account_managers") return query({ data: [] });
      if (table === "properties") {
        const builder = query({ data: [] });
        builder.in = vi.fn((_key: string, ids: string[]) => {
          propertyLists.push(ids.length);
          return builder;
        });
        return builder;
      }
      return query({ data: [] });
    });
    admin.mockReturnValue({ from });
    expect(await listClientAccountsForManager("manager")).toEqual([]);
    expect(propertyLists).toEqual([200, 1]);
  });

  it("throws when list queries fail", async () => {
    admin.mockReturnValue({ from: () => query({ error: { code: "PGRST205" } }) });
    await expect(listClientAccountsForManager("manager")).rejects.toEqual({ code: "PGRST205" });
    for (const failingTable of ["ownership_accounts", "properties"]) {
      admin.mockReturnValue({ from: (table: string) => table === "ownership_account_managers"
        ? query({ data: [{ account_id: "client" }] })
        : table === failingTable ? query({ error: { code: "PGRST205" } }) : query({ data: [] }) });
      await expect(listClientAccountsForManager("manager")).rejects.toEqual({ code: "PGRST205" });
    }
  });
});
