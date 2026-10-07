import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const mocks = vi.hoisted(() => ({
  rows: {} as Record<string, Row[]>,
  rpc: vi.fn()
}));
function query(table: string) {
  const filters: Array<[string, string, unknown]> = [];
  const result = () => ({
    data: (mocks.rows[table] ?? []).filter((row) => filters.every(([kind, key, value]) =>
      kind === "eq" ? row[key] === value : (value as unknown[]).includes(row[key]))),
    error: null
  });
  const builder = {
    select() { return builder; },
    eq(key: string, value: unknown) { filters.push(["eq", key, value]); return builder; },
    in(key: string, value: unknown[]) { filters.push(["in", key, value]); return builder; },
    async maybeSingle() { const value = result(); return { data: value.data[0] ?? null, error: null }; },
    then(resolve: (value: ReturnType<typeof result>) => unknown) { return Promise.resolve(result()).then(resolve); }
  };
  return builder;
}
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: query, rpc: mocks.rpc })
}));
import {
  getAdministeredPropertyIdsForAccount,
  getAdministeredPropertyIdsForAccountLegacy
} from "@/lib/property-access";

function arrange(userId: string, role: string | null, manager = false) {
  mocks.rows = {
    ownership_account_members: role ? [{
      account_id: "account-1", profile_id: userId, member_role: role, active: true
    }] : [],
    property_managers: manager ? [{ property_id: "home-1", manager_profile_id: userId, active: true }] : [],
    properties: [{ id: "home-1", owner_account_id: "account-1", active: true }]
  };
  mocks.rpc.mockResolvedValue({
    data: { property_ids: role === "owner" || (role && manager) ? ["home-1"] : [] },
    error: null
  });
}

describe("administered IDs RPC parity", () => {
  beforeEach(() => vi.clearAllMocks());
  it("matches owner membership", async () => {
    arrange("owner-1", "owner");
    expect(await getAdministeredPropertyIdsForAccount("owner-1", "account-1"))
      .toEqual(await getAdministeredPropertyIdsForAccountLegacy("owner-1", "account-1"));
  });
  it("matches manager assignment behind active membership", async () => {
    arrange("manager-1", "member", true);
    expect(await getAdministeredPropertyIdsForAccount("manager-1", "account-1"))
      .toEqual(await getAdministeredPropertyIdsForAccountLegacy("manager-1", "account-1"));
  });
  it("matches a non-member", async () => {
    arrange("outsider-1", null, true);
    expect(await getAdministeredPropertyIdsForAccount("outsider-1", "account-1"))
      .toEqual(await getAdministeredPropertyIdsForAccountLegacy("outsider-1", "account-1"));
  });
  it("falls back on a missing RPC with a sanitized code", async () => {
    arrange("owner-1", "owner");
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(await getAdministeredPropertyIdsForAccount("owner-1", "account-1")).toEqual(["home-1"]);
      expect(log).toHaveBeenCalledWith(
        "owner_rpc_fallback_missing", "owner_administered_property_ids", "PGRST202"
      );
    } finally { log.mockRestore(); }
  });
  it("falls back on a failed RPC with a sanitized code", async () => {
    arrange("owner-1", "owner");
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST999" } });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(await getAdministeredPropertyIdsForAccount("owner-1", "account-1")).toEqual(["home-1"]);
      expect(log).toHaveBeenCalledWith(
        "owner_rpc_fallback_error", "owner_administered_property_ids", "PGRST999"
      );
    } finally { log.mockRestore(); }
  });
});
