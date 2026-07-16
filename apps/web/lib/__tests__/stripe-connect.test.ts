import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createAdminClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock
}));

import {
  buildExpressAccountParams,
  buildExpressAccountRequestBody,
  createExpressAccount,
  getDefaultExpressAccountBusinessProfileUrl,
  getRentCollectionConnectStatus
} from "@/lib/stripe-connect";

type MockTable = "profiles" | "ownership_account_members" | "ownership_accounts" | "properties";

interface MockAdminState {
  rows: Partial<Record<MockTable, Array<Record<string, unknown>>>>;
  errors?: Partial<Record<MockTable, { code?: string; message: string }>>;
}

function createQueryBuilder(table: MockTable, state: MockAdminState) {
  const filters: Array<(row: Record<string, unknown>) => boolean> = [];
  const execute = () => {
    const error = state.errors?.[table] ?? null;
    if (error) {
      return { data: null, error };
    }
    const filteredRows = (state.rows[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
    return { data: filteredRows, error: null };
  };

  const builder = {
    eq(column: string, value: unknown) {
      filters.push((row) => row[column] === value);
      return builder;
    },
    in(column: string, values: unknown[]) {
      filters.push((row) => values.includes(row[column]));
      return builder;
    },
    is(column: string, value: unknown) {
      filters.push((row) => row[column] === value);
      return builder;
    },
    async maybeSingle() {
      const result = execute();
      return {
        data: Array.isArray(result.data) ? (result.data[0] ?? null) : null,
        error: result.error
      };
    },
    then<TResult1 = { data: Array<Record<string, unknown>> | null; error: { code?: string; message: string } | null }, TResult2 = never>(
      onfulfilled?: ((value: { data: Array<Record<string, unknown>> | null; error: { code?: string; message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) {
      return Promise.resolve(execute()).then(onfulfilled, onrejected);
    }
  };

  return builder;
}

function createStatusAdminClient(state: MockAdminState) {
  const update = vi.fn();
  const insert = vi.fn();
  const remove = vi.fn();
  const from = vi.fn((table: MockTable) => ({
    select: vi.fn(() => createQueryBuilder(table, state)),
    update,
    insert,
    delete: remove
  }));

  return {
    client: { from },
    spies: { update, insert, delete: remove }
  };
}

describe("stripe-connect express account params", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      STRIPE_SECRET_KEY: "sk_test_123"
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("returns a fresh params object on every call", () => {
    const url = getDefaultExpressAccountBusinessProfileUrl();
    const first = buildExpressAccountParams(url);
    const second = buildExpressAccountParams(url);

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.capabilities).not.toBe(second.capabilities);
    expect(first.business_profile).not.toBe(second.business_profile);

    first.business_profile.url = "https://mutated.example.com";

    expect(second.business_profile.url).toBe(url);
  });

  it("serializes the shared params consistently for onboarding and probe callers", () => {
    const url = getDefaultExpressAccountBusinessProfileUrl();
    const onboardingParams = buildExpressAccountParams(url);
    const probeParams = buildExpressAccountParams(url);

    expect(onboardingParams).toEqual(probeParams);
    expect(buildExpressAccountRequestBody(onboardingParams).toString()).toBe(
      "type=express&country=US&capabilities%5Bcard_payments%5D%5Brequested%5D=true&capabilities%5Btransfers%5D%5Brequested%5D=true&business_profile%5Bmcc%5D=6513&business_profile%5Burl%5D=https%3A%2F%2Fdomusbase.com"
    );
  });

  it("creates an Express account with the shared params and email", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "acct_test_123"
      })
    } as Response);

    const account = await createExpressAccount("owner@example.com");

    expect(account).toEqual({ id: "acct_test_123" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("https://api.stripe.com/v1/accounts", {
      method: "POST",
      headers: {
        Authorization: "Bearer sk_test_123",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: "type=express&email=owner%40example.com&country=US&capabilities%5Bcard_payments%5D%5Brequested%5D=true&capabilities%5Btransfers%5D%5Brequested%5D=true&business_profile%5Bmcc%5D=6513&business_profile%5Burl%5D=https%3A%2F%2Fdomusbase.com",
      cache: "no-store"
    });
  });
});

describe("getRentCollectionConnectStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("marks all targets connected when every authority account is ready", async () => {
    const admin = createStatusAdminClient({
      rows: {
        profiles: [
          { id: "owner-1", role: "owner", stripe_account_id: null, stripe_onboarding_complete: false }
        ],
        ownership_account_members: [
          { account_id: "account-2", profile_id: "owner-1", member_role: "owner", active: true }
        ],
        ownership_accounts: [
          {
            id: "account-1",
            display_name: "Alpha",
            stripe_account_id: "acct_alpha",
            stripe_onboarding_complete: true,
            created_at: "2026-01-01T00:00:00.000Z",
            created_by_profile_id: "owner-1"
          },
          {
            id: "account-2",
            display_name: "Beta",
            stripe_account_id: "acct_beta",
            stripe_onboarding_complete: true,
            created_at: "2026-01-02T00:00:00.000Z",
            created_by_profile_id: "other-owner"
          }
        ],
        properties: [
          { id: "property-1", name: "Domus One", owner_account_id: "account-1", owner_profile_id: null, active: true },
          { id: "property-2", name: "Domus Two", owner_account_id: "account-2", owner_profile_id: null, active: null }
        ]
      }
    });
    createAdminClientMock.mockReturnValue(admin.client);

    const status = await getRentCollectionConnectStatus("owner-1");

    expect(status.ok).toBe(true);
    expect(status.connected).toBe(true);
    expect(status.targets).toEqual([]);
    expect(status.accounts.map((account) => account.accountId)).toEqual(["account-1", "account-2"]);
    expect(admin.spies.update).not.toHaveBeenCalled();
    expect(admin.spies.insert).not.toHaveBeenCalled();
    expect(admin.spies.delete).not.toHaveBeenCalled();
  });

  it("returns an unconnected property-owning account target when onboarding is incomplete", async () => {
    createAdminClientMock.mockReturnValue(
      createStatusAdminClient({
        rows: {
          profiles: [
            { id: "owner-1", role: "owner", stripe_account_id: null, stripe_onboarding_complete: false }
          ],
          ownership_accounts: [
            {
              id: "account-1",
              display_name: "Alpha",
              stripe_account_id: "acct_alpha",
              stripe_onboarding_complete: false,
              created_at: "2026-01-01T00:00:00.000Z",
              created_by_profile_id: "owner-1"
            }
          ],
          ownership_account_members: [],
          properties: [
            { id: "property-1", name: "Domus One", owner_account_id: "account-1", owner_profile_id: null, active: true }
          ]
        }
      }).client
    );

    const status = await getRentCollectionConnectStatus("owner-1");

    expect(status.connected).toBe(false);
    expect(status.accounts[0]).toMatchObject({
      accountId: "account-1",
      isConnected: false,
      activePropertyCount: 1,
      propertyNames: ["Domus One"]
    });
    expect(status.targets).toEqual([{ kind: "account", accountId: "account-1" }]);
  });

  it("falls back to the legacy profile target when active personal properties still need setup", async () => {
    createAdminClientMock.mockReturnValue(
      createStatusAdminClient({
        rows: {
          profiles: [
            { id: "owner-1", role: "owner", stripe_account_id: null, stripe_onboarding_complete: false }
          ],
          ownership_account_members: [],
          ownership_accounts: [],
          properties: [
            { id: "property-1", name: "Legacy Home", owner_account_id: null, owner_profile_id: "owner-1", active: true }
          ]
        }
      }).client
    );

    const status = await getRentCollectionConnectStatus("owner-1");

    expect(status.legacyProfileTarget).toBe(true);
    expect(status.profileConnected).toBe(false);
    expect(status.targets).toEqual([{ kind: "profile" }]);
    expect(status.connected).toBe(false);
  });

  it("builds hybrid targets in deterministic account-then-profile order", async () => {
    createAdminClientMock.mockReturnValue(
      createStatusAdminClient({
        rows: {
          profiles: [
            { id: "owner-1", role: "owner", stripe_account_id: null, stripe_onboarding_complete: false }
          ],
          ownership_account_members: [
            { account_id: "account-b", profile_id: "owner-1", member_role: "owner", active: true }
          ],
          ownership_accounts: [
            {
              id: "account-b",
              display_name: "Beta",
              stripe_account_id: null,
              stripe_onboarding_complete: false,
              created_at: "2026-01-02T00:00:00.000Z",
              created_by_profile_id: "other-owner"
            },
            {
              id: "account-a",
              display_name: "Alpha",
              stripe_account_id: null,
              stripe_onboarding_complete: false,
              created_at: "2026-01-01T00:00:00.000Z",
              created_by_profile_id: "owner-1"
            }
          ],
          properties: [
            { id: "property-1", name: "Villa A", owner_account_id: "account-a", owner_profile_id: null, active: true },
            { id: "property-2", name: "Legacy Home", owner_account_id: null, owner_profile_id: "owner-1", active: true }
          ]
        }
      }).client
    );

    const status = await getRentCollectionConnectStatus("owner-1");

    expect(status.accounts.map((account) => account.accountId)).toEqual(["account-a", "account-b"]);
    expect(status.targets).toEqual([
      { kind: "account", accountId: "account-a" },
      { kind: "account", accountId: "account-b" },
      { kind: "profile" }
    ]);
    expect(status.primaryTarget).toEqual({ kind: "account", accountId: "account-a" });
  });

  it("treats an owner with no accounts and no legacy properties as profile-connected only", async () => {
    createAdminClientMock.mockReturnValue(
      createStatusAdminClient({
        rows: {
          profiles: [
            { id: "owner-1", role: "owner", stripe_account_id: null, stripe_onboarding_complete: false }
          ],
          ownership_account_members: [],
          ownership_accounts: [],
          properties: []
        }
      }).client
    );

    const status = await getRentCollectionConnectStatus("owner-1");

    expect(status.accounts).toEqual([]);
    expect(status.targets).toEqual([]);
    expect(status.connected).toBe(false);
    expect(status.profileConnected).toBe(false);
  });

  it("fails closed with ok false when a schema query fails", async () => {
    createAdminClientMock.mockReturnValue(
      createStatusAdminClient({
        rows: {
          profiles: [
            { id: "owner-1", role: "owner", stripe_account_id: null, stripe_onboarding_complete: false }
          ],
          ownership_account_members: [],
          ownership_accounts: [],
          properties: []
        },
        errors: {
          ownership_accounts: { code: "42P01", message: "relation \"ownership_accounts\" does not exist" }
        }
      }).client
    );

    const status = await getRentCollectionConnectStatus("owner-1");

    expect(status).toEqual({
      ok: false,
      connected: false,
      accounts: [],
      legacyProfileTarget: false,
      profileConnected: false,
      targets: [],
      primaryTarget: null
    });
  });
});
