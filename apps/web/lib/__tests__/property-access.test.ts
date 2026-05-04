import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { canUserAdministerProperty, getAdministeredProperties, getAdministeredPropertyIds } from "@/lib/property-access";

const createAdminClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: createAdminClientMock }));

interface PropertyAccessConfig {
  memberAccounts?: string[];
  memberError?: { code?: string; message?: string } | null;
  managerPropertyIds?: string[];
  ownerProperties?: Array<{ id: string; owner_account_id: string; active?: boolean }>;
  managerProperties?: Array<{ id: string; owner_account_id: string; active?: boolean }>;
  ownerError?: { code?: string; message?: string } | null;
  managerError?: { code?: string; message?: string } | null;
  legacyOwnedRows?: Array<{ id: string; owner_profile_id: string; active?: boolean }>;
}

function createAccessClient(config: PropertyAccessConfig): SupabaseClient {
  return {
    from: vi.fn((table: string) => {
      if (table === "ownership_account_members") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({
                  data: (config.memberAccounts ?? []).map((accountId) => ({ account_id: accountId })),
                  error: config.memberError ?? null
                })
              }))
            }))
          }))
        };
      }

      if (table === "property_managers") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({
                data: (config.managerPropertyIds ?? []).map((propertyId) => ({ property_id: propertyId })),
                error: null
              })
            }))
          }))
        };
      }

      if (table === "properties") {
        return {
          select: vi.fn(() => ({
            in: vi.fn((column: string, _values: string[]) => {
              if (column === "owner_account_id") {
                return Promise.resolve({ data: config.ownerProperties ?? [], error: config.ownerError ?? null });
              }
              if (column === "id") {
                return Promise.resolve({ data: config.managerProperties ?? [], error: config.managerError ?? null });
              }
              return Promise.resolve({ data: [], error: null });
            }),
            eq: vi.fn(() => Promise.resolve({ data: config.legacyOwnedRows ?? [], error: null }))
          }))
        };
      }

      return {
        select: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }))
      };
    })
  } as unknown as SupabaseClient;
}

describe("property-access utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns owned properties for owner memberships", async () => {
    const client = createAccessClient({
      memberAccounts: ["account-1"],
      ownerProperties: [{ id: "property-1", owner_account_id: "account-1", active: true }]
    });

    const result = await getAdministeredProperties("user-1", client);

    expect(result).toEqual([{ id: "property-1", ownerAccountId: "account-1" }]);
  });

  it("returns manager-assigned properties", async () => {
    const client = createAccessClient({
      managerPropertyIds: ["property-2"],
      managerProperties: [{ id: "property-2", owner_account_id: "account-2", active: true }]
    });

    const result = await getAdministeredProperties("user-1", client);

    expect(result).toEqual([{ id: "property-2", ownerAccountId: "account-2" }]);
  });

  it("deduplicates properties when a user is both owner and manager", async () => {
    const client = createAccessClient({
      memberAccounts: ["account-1"],
      managerPropertyIds: ["property-1"],
      ownerProperties: [{ id: "property-1", owner_account_id: "account-1", active: true }],
      managerProperties: []
    });

    const result = await getAdministeredProperties("user-1", client);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("property-1");
  });

  it("filters out inactive properties from the administered list", async () => {
    const client = createAccessClient({
      memberAccounts: ["account-1"],
      ownerProperties: [
        { id: "property-1", owner_account_id: "account-1", active: true },
        { id: "property-2", owner_account_id: "account-1", active: false }
      ]
    });

    const result = await getAdministeredPropertyIds("user-1", client);

    expect(result).toEqual(["property-1"]);
  });

  it("falls back to legacy property access when ownership schema is missing", async () => {
    const client = createAccessClient({
      memberError: { code: "42703", message: "column does not exist" },
      legacyOwnedRows: [{ id: "property-legacy", owner_profile_id: "owner-1", active: true }]
    });

    const result = await getAdministeredProperties("owner-1", client);

    expect(result).toEqual([{ id: "property-legacy", ownerAccountId: "legacy:owner-1" }]);
  });

  it("returns only property IDs from getAdministeredPropertyIds", async () => {
    const client = createAccessClient({
      memberAccounts: ["account-1"],
      ownerProperties: [{ id: "property-1", owner_account_id: "account-1", active: true }]
    });

    const result = await getAdministeredPropertyIds("user-1", client);

    expect(result).toEqual(["property-1"]);
  });

  it("returns true from canUserAdministerProperty when the property is administered", async () => {
    createAdminClientMock.mockReturnValue(
      createAccessClient({
        memberAccounts: ["account-1"],
        ownerProperties: [{ id: "property-1", owner_account_id: "account-1", active: true }]
      })
    );

    const result = await canUserAdministerProperty("user-1", "property-1");

    expect(result).toBe(true);
  });

  it("returns false from canUserAdministerProperty when the property is unrelated", async () => {
    createAdminClientMock.mockReturnValue(
      createAccessClient({
        memberAccounts: ["account-1"],
        ownerProperties: [{ id: "property-1", owner_account_id: "account-1", active: true }]
      })
    );

    const result = await canUserAdministerProperty("user-1", "property-2");

    expect(result).toBe(false);
  });
});
