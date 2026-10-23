import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  assertAccount: vi.fn(),
  assertProperty: vi.fn(),
  managerFee: vi.fn(),
  getStripeSecretKey: vi.fn(() => "sk_test_split"),
  getStripeAccountHealth: vi.fn()
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/client-accounts", () => ({
  assertStripeEligibleAccount: mocks.assertAccount,
  assertStripeEligibleProperty: mocks.assertProperty
}));
vi.mock("@/lib/payment-fees", () => ({ getManagerFeeForProperty: mocks.managerFee }));
vi.mock("@/lib/stripe", () => ({
  getStripeSecretKey: mocks.getStripeSecretKey,
  getStripeAccountHealth: mocks.getStripeAccountHealth
}));
vi.mock("@/lib/logger", () => ({ sideEffectError: () => vi.fn() }));

import {
  createAccountLink, createLoginLink, getAccount, getManagerStripeAccountForProperty,
  hasRentCollectionAuthorityForAccount
} from "@/lib/stripe-connect";

type Row = Record<string, unknown>;
type Table = "property_managers" | "profiles" | "ownership_account_members" | "ownership_accounts";
type Query = { table: Table; select: string; filters: Array<[string, string, unknown]> };

function fakeAdmin(rows: Partial<Record<Table, Row[]>>, errorTable?: Table) {
  const queries: Query[] = [];
  const from = vi.fn((table: Table) => ({
    select(select: string) {
      const query: Query = { table, select, filters: [] };
      const run = () => {
        queries.push({ ...query, filters: [...query.filters] });
        if (table === errorTable) return { data: null, error: { message: "query failed" } };
        const data = (rows[table] ?? []).filter((row) => query.filters.every(([kind, column, value]) =>
          kind === "eq" ? row[column] === value : kind === "in" ? (value as unknown[]).includes(row[column]) : true));
        return { data, error: null };
      };
      const builder = {
        eq(column: string, value: unknown) { query.filters.push(["eq", column, value]); return builder; },
        in(column: string, value: unknown[]) { query.filters.push(["in", column, value]); return builder; },
        order(column: string, value: unknown) { query.filters.push(["order", column, value]); return builder; },
        limit(value: number) { query.filters.push(["limit", "", value]); return builder; },
        async maybeSingle() { const result = run(); return { ...result, data: result.data?.[0] ?? null }; },
        then(onfulfilled: (value: ReturnType<typeof run>) => unknown) { return Promise.resolve(run()).then(onfulfilled); }
      };
      return builder;
    }
  }));
  mocks.createAdminClient.mockReturnValue({ from });
  return queries;
}

const managerLookup: Query = {
  table: "property_managers", select: "manager_profile_id",
  filters: [["eq", "property_id", "home-1"], ["eq", "active", true],
    ["order", "created_at", { ascending: true }], ["limit", "", 1]]
};
const profileLookup: Query = {
  table: "profiles", select: "id, stripe_account_id, stripe_onboarding_complete",
  filters: [["in", "id", ["manager-1"]]]
};

describe("stripe-connect manager routing characterization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertProperty.mockResolvedValue(undefined);
  });

  it("returns the connected manager from the fee record", async () => {
    const queries = fakeAdmin({ profiles: [{ id: "manager-1", stripe_account_id: "acct_manager", stripe_onboarding_complete: true }] });
    mocks.managerFee.mockResolvedValue({ feeCents: 125, managerProfileId: "manager-1" });
    expect(await getManagerStripeAccountForProperty("home-1", 10000)).toEqual({
      accountId: "acct_manager", feeCents: 125, managerProfileId: "manager-1"
    });
    expect(queries).toEqual([profileLookup]);
    expect(mocks.assertProperty.mock.calls).toEqual([["home-1"]]);
    expect(mocks.managerFee.mock.calls).toEqual([["home-1", 10000]]);
  });

  it("returns the connected manager from the first active assignment", async () => {
    const queries = fakeAdmin({
      property_managers: [{ manager_profile_id: "manager-1", property_id: "home-1", active: true }],
      profiles: [{ id: "manager-1", stripe_account_id: "acct_manager", stripe_onboarding_complete: true }]
    });
    mocks.managerFee.mockResolvedValue({ feeCents: 125, managerProfileId: null });
    expect(await getManagerStripeAccountForProperty("home-1")).toEqual({
      accountId: "acct_manager", feeCents: 125, managerProfileId: "manager-1"
    });
    expect(queries).toEqual([managerLookup, profileLookup]);
    expect(mocks.managerFee.mock.calls).toEqual([["home-1", 0]]);
  });

  it.each([
    { name: "zero fee", fee: 0, manager: "manager-1", rows: {}, expected: [] },
    { name: "no assignment", fee: 125, manager: null, rows: {}, expected: [managerLookup] },
    { name: "missing profile", fee: 125, manager: "manager-1", rows: {}, expected: [profileLookup] },
    { name: "missing account", fee: 125, manager: "manager-1",
      rows: { profiles: [{ id: "manager-1", stripe_account_id: null, stripe_onboarding_complete: true }] },
      expected: [profileLookup] },
    { name: "incomplete onboarding", fee: 125, manager: "manager-1",
      rows: { profiles: [{ id: "manager-1", stripe_account_id: "acct_manager", stripe_onboarding_complete: false }] },
      expected: [profileLookup] }
  ])("returns null for $name", async ({ fee, manager, rows, expected }) => {
    const queries = fakeAdmin(rows);
    mocks.managerFee.mockResolvedValue({ feeCents: fee, managerProfileId: manager });
    expect(await getManagerStripeAccountForProperty("home-1", 10000)).toEqual(null);
    expect(queries).toEqual(expected);
  });
});

const authorityQueries: Query[] = [
  { table: "profiles", select: "role", filters: [["eq", "id", "owner-1"]] },
  { table: "ownership_account_members", select: "account_id", filters: [
    ["eq", "profile_id", "owner-1"], ["eq", "member_role", "owner"], ["eq", "active", true]] },
  { table: "ownership_accounts", select: "id", filters: [["eq", "created_by_profile_id", "owner-1"]] }
];

describe("stripe-connect rent authority characterization", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    { account: "account-1", expected: true },
    { account: "account-2", expected: false }
  ])("returns $expected for $account", async ({ account, expected }) => {
    const queries = fakeAdmin({
      profiles: [{ id: "owner-1", role: "owner" }],
      ownership_account_members: [{ account_id: "account-1", profile_id: "owner-1", member_role: "owner", active: true }],
      ownership_accounts: []
    });
    expect(await hasRentCollectionAuthorityForAccount("owner-1", account)).toEqual(expected);
    expect(queries).toEqual(authorityQueries);
  });

  it("returns false when the authority loader fails", async () => {
    const queries = fakeAdmin({ profiles: [{ id: "owner-1", role: "owner" }] }, "ownership_accounts");
    expect(await hasRentCollectionAuthorityForAccount("owner-1", "account-1")).toEqual(false);
    expect(queries).toEqual(authorityQueries);
  });
});

describe("stripe-connect API characterization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertAccount.mockResolvedValue(undefined);
  });

  it("creates an onboarding link with the exact form request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true, json: async () => ({ url: "https://stripe.test/onboard" })
    } as Response);
    expect(await createAccountLink("acct_1", "https://app.test/refresh", "https://app.test/return",
      { kind: "account", accountId: "owner-account" })).toEqual({ url: "https://stripe.test/onboard" });
    expect(mocks.assertAccount.mock.calls).toEqual([["owner-account"]]);
    expect(fetchMock.mock.calls).toEqual([["https://api.stripe.com/v1/account_links", {
      method: "POST", headers: { Authorization: "Bearer sk_test_split", "Content-Type": "application/x-www-form-urlencoded" },
      body: "account=acct_1&refresh_url=https%3A%2F%2Fapp.test%2Frefresh&" +
        "return_url=https%3A%2F%2Fapp.test%2Freturn&type=account_onboarding", cache: "no-store"
    }]]);
    fetchMock.mockRestore();
  });

  it("creates a login link with an empty form body", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true, json: async () => ({ url: "https://stripe.test/login" })
    } as Response);
    expect(await createLoginLink("acct_1", { kind: "account", accountId: "owner-account" })).toEqual({
      url: "https://stripe.test/login"
    });
    expect(mocks.assertAccount.mock.calls).toEqual([["owner-account"]]);
    expect(fetchMock.mock.calls).toEqual([["https://api.stripe.com/v1/accounts/acct_1/login_links", {
      method: "POST", headers: { Authorization: "Bearer sk_test_split", "Content-Type": "application/x-www-form-urlencoded" },
      body: "", cache: "no-store"
    }]]);
    fetchMock.mockRestore();
  });

  it("gets an account with the exact GET request and returned fields", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true, json: async () => ({ id: "acct_1", charges_enabled: true, payouts_enabled: false,
        details_submitted: true, ignored: "not returned" })
    } as Response);
    expect(await getAccount("acct_1")).toEqual({ id: "acct_1", charges_enabled: true,
      payouts_enabled: false, details_submitted: true });
    expect(fetchMock.mock.calls).toEqual([["https://api.stripe.com/v1/accounts/acct_1", {
      method: "GET", headers: { Authorization: "Bearer sk_test_split" }, body: undefined, cache: "no-store"
    }]]);
    fetchMock.mockRestore();
  });

  it.each(["account link", "login link"]) ("checks account context before requesting a $name", async (name) => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
    mocks.assertAccount.mockRejectedValue(new Error("ineligible"));
    const request = name === "account link"
      ? createAccountLink("acct_1", "refresh", "return", { kind: "account", accountId: "owner-account" })
      : createLoginLink("acct_1", { kind: "account", accountId: "owner-account" });
    await expect(request).rejects.toThrow("ineligible");
    expect(mocks.assertAccount.mock.calls).toEqual([["owner-account"]]);
    expect(fetchMock.mock.calls).toEqual([]);
    fetchMock.mockRestore();
  });
});

import { readdirSync } from "node:fs";
import ts from "typescript";

describe("stripe-connect split structure", () => {
  const lib = resolve(__dirname, "..");
  const web = resolve(lib, "..");
  const facade = resolve(lib, "stripe-connect.ts");
  const modules = ["api", "rent-collection", "property-accounts"] as const;
  const baseExports = [
    "StripeExpressAccountParams", "RentCollectionConnectTarget", "RentCollectionConnectStatus",
    "isStripeVerificationStale", "buildExpressAccountParams", "getDefaultExpressAccountBusinessProfileUrl",
    "buildExpressAccountRequestBody", "createExpressAccount", "createAccountLink", "getAccount",
    "createLoginLink", "hasRentCollectionAuthorityForAccount", "getRentCollectionConnectHref",
    "getRentCollectionConnectStatus", "getOwnerStripeAccountForProperty",
    "getManagerStripeAccountForProperty", "arePropertyOwnersConnected"
  ];
  const sourceFile = (file: string) => ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);

  it("keeps directives out of each new module and each file under 500 lines", () => {
    for (const file of [facade, ...modules.map((part) => resolve(lib, "stripe-connect", `${part}.ts`))]) {
      const text = readFileSync(file, "utf8");
      expect(text.split("\n").length - 1).toBeLessThanOrEqual(500);
      if (file !== facade) {
        expect(text).not.toMatch(/["']use server["']|["']use client["']|server-only/);
      }
    }
  });

  it("keeps the facade to named re-exports of the exact baseline export names", () => {
    const ast = sourceFile(facade);
    const names: string[] = [];
    for (const statement of ast.statements) {
      expect(ts.isExportDeclaration(statement)).toEqual(true);
      if (!ts.isExportDeclaration(statement)) continue;
      expect(statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)).toEqual(true);
      expect(statement.exportClause && ts.isNamedExports(statement.exportClause)).toEqual(true);
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        names.push(...statement.exportClause.elements.map((element) => element.name.text));
      }
    }
    expect(names.sort()).toEqual([...baseExports].sort());
    expect(names.length).toEqual(baseExports.length);
  });

  it("allows only rent-collection and property-accounts to import api", () => {
    const allowed = new Set(["rent-collection>api", "property-accounts>api"]);
    for (const part of modules) {
      const file = resolve(lib, "stripe-connect", `${part}.ts`);
      for (const statement of sourceFile(file).statements) {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
        const target = statement.moduleSpecifier.text;
        if (target.startsWith(".")) {
          expect(allowed.has(`${part}>${target.replace(/^\.\//, "")}`)).toEqual(true);
        }
      }
    }
    for (const statement of sourceFile(facade).statements) {
      if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier ||
        !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      expect(modules.some((part) => statement.moduleSpecifier &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        statement.moduleSpecifier.text === `./stripe-connect/${part}`)).toEqual(true);
    }
  });

  it("keeps direct submodule imports inside the folder, facade, and tests", () => {
    const visit = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      if (["node_modules", ".next", ".git", "coverage"].includes(entry.name)) return [];
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? visit(path) : /\.tsx?$/.test(entry.name) ? [path] : [];
    });
    for (const file of visit(web)) {
      if (file === facade || file.startsWith(resolve(lib, "stripe-connect") + "/") || file.includes("/__tests__/")) continue;
      for (const statement of sourceFile(file).statements) {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
        expect(statement.moduleSpecifier.text).not.toMatch(/stripe-connect\//);
      }
    }
  });
});
