import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDepositReturnSchema, deleteDepositReturnSchema, updateManualBalanceSchema } from "@/lib/validations";
import { depositHeldCents } from "@/lib/deposits";
import { eligibleBankAccount, loadCashOnHand } from "@/lib/cash-on-hand";

const state = vi.hoisted(() => ({ rows: {} as Record<string, unknown[]>, fail: "" }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({
  from: (table: string) => {
    const query = { select: () => query, eq: () => query, in: () => query,
      then: (resolve: (result: unknown) => void) => resolve({
        data: state.rows[table] ?? [], error: table === state.fail ? { code: "42501" } : null
      }) };
    return query;
  }
}) }));

const bank = (overrides: Record<string, unknown> = {}) => ({ id: "b1", owner_account_id: "a1",
  nickname: "Checking", institution: "Navy Federal", source: "upload", connection_id: null,
  account_type: null, account_subtype: null, iso_currency_code: null, balance_cents: 2188500,
  balance_as_of: "2026-10-10T00:00:00Z", ...overrides });

beforeEach(() => {
  state.fail = "";
  state.rows = { ownership_account_members: [{ account_id: "a1" }],
    ownership_accounts: [{ id: "a1", display_name: "Home account" }],
    bank_accounts: [bank()], bank_connections: [],
    properties: [{ id: "p1", owner_account_id: "a1" }],
    units: [{ id: "u1", property_id: "p1" }],
    leases: [{ id: "l1", unit_id: "u1", deposit_cents: 375000 }], lease_deposit_returns: [] };
});

describe("depositHeldCents", () => {
  it("holds active and ended leases until a return row exists, including a zero return", () => {
    expect(depositHeldCents({ deposit_cents: 375000 }, null)).toBe(375000);
    expect(depositHeldCents({ deposit_cents: 375000 }, { returned_cents: 375000, returned_on: "2026-01-01" })).toBe(0);
    expect(depositHeldCents({ deposit_cents: 375000 }, { returned_cents: 200000, returned_on: "2026-01-01" })).toBe(0);
    expect(depositHeldCents({ deposit_cents: 375000 }, { returned_cents: 0, returned_on: "2026-01-01" })).toBe(0);
  });
});

describe("loadCashOnHand", () => {
  it("sums cash and held deposits and uses the oldest balance age", async () => {
    state.rows.bank_accounts = [bank(), bank({ id: "b2", nickname: "Savings", balance_cents: -10000,
      balance_as_of: "2026-10-09T00:00:00Z" })];
    const [cash] = await loadCashOnHand("user", new Date("2026-10-13T01:00:00Z"));
    expect(cash).toMatchObject({ bankCents: 2178500, depositsHeldCents: 375000,
      yoursCents: 1803500, checkedAt: "2026-10-09T00:00:00Z", stale: true, complete: true });
  });
  it("lists missing balances and marks incomplete", async () => {
    state.rows.bank_accounts = [bank(), bank({ id: "b2", nickname: "Savings", balance_cents: null,
      balance_as_of: null })];
    expect((await loadCashOnHand("user"))[0]).toMatchObject({ hasBalance: true,
      complete: false, missingNames: ["Savings"] });
    state.rows.bank_accounts = [bank({ balance_cents: null, balance_as_of: null })];
    expect((await loadCashOnHand("user"))[0].hasBalance).toBe(false);
  });
  it("counts an unknown Plaid account as missing but excludes credit, foreign and revoked accounts", async () => {
    state.rows.bank_connections = [{ id: "c1", status: "ok" }, { id: "c2", status: "revoked" }];
    state.rows.bank_accounts = [
      bank({ source: "plaid", connection_id: "c1", account_type: "depository",
        account_subtype: "checking", iso_currency_code: "USD" }),
      bank({ id: "b2", nickname: "Unknown", source: "plaid", connection_id: "c1",
        balance_cents: null, balance_as_of: null }),
      bank({ id: "b3", source: "plaid", connection_id: "c1", account_type: "credit" }),
      bank({ id: "b4", source: "plaid", connection_id: "c1", iso_currency_code: "CAD" }),
      bank({ id: "b5", source: "plaid", connection_id: "c2" })
    ];
    expect((await loadCashOnHand("user"))[0]).toMatchObject({ bankCents: 2188500,
      complete: false, missingNames: ["Unknown"] });
  });
  it("excludes nonmember accounts and fails closed on a query error", async () => {
    state.rows.bank_accounts = [bank(), bank({ id: "b2", owner_account_id: "a2", balance_cents: 900000 })];
    expect((await loadCashOnHand("user"))[0].bankCents).toBe(2188500);
    state.fail = "bank_accounts";
    await expect(loadCashOnHand("user")).rejects.toMatchObject({ code: "42501" });
  });
  it("treats unknown Plaid metadata as eligible but excludes known credit, non-USD and revoked", () => {
    const plaid = bank({ source: "plaid", connection_id: "c1" });
    expect(eligibleBankAccount(plaid, "ok")).toBe(true);
    expect(eligibleBankAccount({ ...plaid, account_type: "credit" }, "ok")).toBe(false);
    expect(eligibleBankAccount({ ...plaid, iso_currency_code: "CAD" }, "ok")).toBe(false);
    expect(eligibleBankAccount(plaid, "revoked")).toBe(false);
  });
});

describe("deposit and balance schemas", () => {
  it("requires valid integer cents, dates and IDs", () => {
    const id = "33333333-3333-4333-8333-333333333333";
    expect(createDepositReturnSchema.safeParse({ leaseId: id, returnedCents: -1,
      returnedOn: "2026-10-01" }).success).toBe(false);
    expect(createDepositReturnSchema.safeParse({ leaseId: id, returnedCents: 0,
      returnedOn: "2026-10-01" }).success).toBe(true);
    expect(deleteDepositReturnSchema.safeParse({ leaseId: "bad" }).success).toBe(false);
    expect(updateManualBalanceSchema.safeParse({ bankAccountId: id, balanceCents: -100 }).success).toBe(true);
    expect(updateManualBalanceSchema.safeParse({ bankAccountId: id, balanceCents: 1.5 }).success).toBe(false);
  });
});
