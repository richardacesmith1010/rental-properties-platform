import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const createAdminClientMock = vi.hoisted(() => vi.fn());
const getStripeAccountHealthMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock
}));

vi.mock("@/lib/stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stripe")>();
  return {
    ...actual,
    getStripeAccountHealth: getStripeAccountHealthMock
  };
});

import { GET } from "@/app/api/cron/verify-stripe-accounts/route";

type StripeAccountTable = "ownership_accounts" | "profiles";

interface TableRow {
  id: string;
  stripe_account_id: string | null;
  stripe_status?: string | null;
  stripe_last_verified_at?: string | null;
}

function createRequest(token?: string) {
  return new NextRequest("http://localhost/api/cron/verify-stripe-accounts", {
    headers: token ? { authorization: `Bearer ${token}` } : undefined
  });
}

function createAdminClientState(seed: Record<StripeAccountTable, TableRow[]>) {
  const tables: Record<StripeAccountTable, TableRow[]> = {
    ownership_accounts: seed.ownership_accounts.map((row) => ({ ...row })),
    profiles: seed.profiles.map((row) => ({ ...row }))
  };
  const updates: Array<{
    table: StripeAccountTable;
    id: string;
    values: Pick<TableRow, "stripe_status" | "stripe_last_verified_at">;
  }> = [];

  const client = {
    from(table: StripeAccountTable) {
      return {
        select() {
          return {
            not() {
              return Promise.resolve({
                data: tables[table]
                  .filter((row) => row.stripe_account_id !== null)
                  .map((row) => ({
                    id: row.id,
                    stripe_account_id: row.stripe_account_id
                  })),
                error: null
              });
            }
          };
        },
        update(values: Pick<TableRow, "stripe_status" | "stripe_last_verified_at">) {
          return {
            eq(_column: string, id: string) {
              const row = tables[table].find((entry) => entry.id === id) ?? null;
              if (row) {
                row.stripe_status = values.stripe_status;
                row.stripe_last_verified_at = values.stripe_last_verified_at;
              }
              updates.push({ table, id, values });
              return Promise.resolve({ error: null });
            }
          };
        }
      };
    }
  };

  return { client, tables, updates };
}

describe("verify-stripe-accounts cron route", () => {
  const originalEnv = { ...process.env };
  const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, CRON_SECRET: "cron-secret" };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns 401 without an auth header", async () => {
    const response = await GET(createRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it("returns 401 with the wrong bearer token", async () => {
    const response = await GET(createRequest("wrong-secret"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it("summarizes active and missing accounts and updates both tables", async () => {
    const adminState = createAdminClientState({
      ownership_accounts: [{ id: "oa-1", stripe_account_id: "acct_active" }],
      profiles: [{ id: "profile-1", stripe_account_id: "acct_missing" }]
    });
    createAdminClientMock.mockReturnValue(adminState.client);
    getStripeAccountHealthMock.mockImplementation(async (accountId: string) =>
      accountId === "acct_active"
        ? {
            status: "active",
            chargesEnabled: true,
            payoutsEnabled: true,
            disabledReason: null
          }
        : {
            status: "missing",
            chargesEnabled: false,
            payoutsEnabled: false,
            disabledReason: "account_not_found"
          }
    );

    const response = await GET(createRequest("cron-secret"));
    const payload = (await response.json()) as {
      ok: boolean;
      summary: {
        checked: number;
        active: number;
        restricted: number;
        missing: number;
        errored: number;
      };
    };

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      summary: {
        checked: 2,
        active: 1,
        restricted: 0,
        missing: 1,
        errored: 0
      }
    });
    expect(adminState.updates).toHaveLength(2);
    expect(adminState.tables.ownership_accounts[0]?.stripe_status).toBe("active");
    expect(adminState.tables.profiles[0]?.stripe_status).toBe("missing");
    expect(adminState.tables.ownership_accounts[0]?.stripe_last_verified_at).toEqual(
      expect.any(String)
    );
    expect(adminState.tables.profiles[0]?.stripe_last_verified_at).toEqual(expect.any(String));
  });

  it("keeps processing when one account check throws", async () => {
    const adminState = createAdminClientState({
      ownership_accounts: [
        { id: "oa-1", stripe_account_id: "acct_broken" },
        { id: "oa-2", stripe_account_id: "acct_restricted" }
      ],
      profiles: [{ id: "profile-1", stripe_account_id: "acct_active" }]
    });
    createAdminClientMock.mockReturnValue(adminState.client);
    getStripeAccountHealthMock.mockImplementation(async (accountId: string) => {
      if (accountId === "acct_broken") {
        throw new Error("Stripe unavailable");
      }

      if (accountId === "acct_restricted") {
        return {
          status: "restricted",
          chargesEnabled: false,
          payoutsEnabled: true,
          disabledReason: "requirements.past_due"
        };
      }

      return {
        status: "active",
        chargesEnabled: true,
        payoutsEnabled: true,
        disabledReason: null
      };
    });

    const response = await GET(createRequest("cron-secret"));
    const payload = (await response.json()) as {
      ok: boolean;
      summary: {
        checked: number;
        active: number;
        restricted: number;
        missing: number;
        errored: number;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.summary).toEqual({
      checked: 3,
      active: 1,
      restricted: 1,
      missing: 0,
      errored: 1
    });
    expect(adminState.tables.ownership_accounts[0]?.stripe_status).toBeUndefined();
    expect(adminState.tables.ownership_accounts[1]?.stripe_status).toBe("restricted");
    expect(adminState.tables.profiles[0]?.stripe_status).toBe("active");
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith("[verify-stripe-accounts] summary:", {
      checked: 3,
      active: 1,
      restricted: 1,
      missing: 0,
      errored: 1
    });
  });
});
