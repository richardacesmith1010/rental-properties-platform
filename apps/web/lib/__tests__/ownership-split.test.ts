import { describe, expect, it, vi } from "vitest";

const createAdminClient = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));

import { canUserAdministerOwnershipAccount } from "@/lib/ownership";

type QueryResult = { data: { account_id?: string; id?: string } | null; error: { code: string } | null };

function fakeAdmin(memberResult: QueryResult, creatorResult: QueryResult) {
  const filters: Array<{ table: string; column: string; value: string | boolean }> = [];
  createAdminClient.mockReturnValue({
    from(table: string) {
      const query = {
        select() { return query; },
        eq(column: string, value: string | boolean) {
          filters.push({ table, column, value });
          return query;
        },
        maybeSingle() {
          return Promise.resolve(table === "ownership_account_members" ? memberResult : creatorResult);
        }
      };
      return query;
    }
  });
  return filters;
}

describe("canUserAdministerOwnershipAccount", () => {
  const empty = { data: null, error: null };
  const missing = { data: null, error: { code: "42P01" } };
  const otherError = { data: null, error: { code: "XX000" } };

  it.each([
    ["active member", { data: { account_id: "account-1" }, error: null }, empty, true],
    ["creator only", empty, { data: { id: "account-1" }, error: null }, true],
    ["neither", empty, empty, false],
    ["member missing schema", missing, { data: { id: "account-1" }, error: null }, false],
    ["creator missing schema", { data: { account_id: "account-1" }, error: null }, missing, false],
    ["non-missing error without data", otherError, empty, false]
  ] as Array<[string, QueryResult, QueryResult, boolean]>)
    ("returns %s result", async (_caseName, member, creator, expected) => {
      const filters = fakeAdmin(member, creator);
      expect(await canUserAdministerOwnershipAccount("user-1", "account-1")).toBe(expected);
      expect(filters).toEqual([
        { table: "ownership_account_members", column: "account_id", value: "account-1" },
        { table: "ownership_account_members", column: "profile_id", value: "user-1" },
        { table: "ownership_account_members", column: "active", value: true },
        { table: "ownership_accounts", column: "id", value: "account-1" },
        { table: "ownership_accounts", column: "created_by_profile_id", value: "user-1" }
      ]);
    });
});

describe("ownership module structure", () => {
  const files = ["types", "accounts", "members", "governance"] as const;
  const expectedExports = [
    "OwnershipAccountDTO", "OwnershipMemberDTO", "ActiveLlcMembershipDTO",
    "AccountRenameRequestDTO", "AccountDeleteRequestDTO", "generateJoinCode",
    "getUniqueOwnershipJoinCode", "assembleOwnershipAccountsPayload", "getOwnershipAccountsForUser",
    "getOwnershipAccountsForUserLegacy", "getActiveLlcMembershipsForUser", "findAccountByJoinCode",
    "getOwnershipMembersForAccount", "getOrCreateIndividualOwnershipAccount",
    "canUserAdministerOwnershipAccount", "getPendingAccountRenameRequests", "getPendingAccountDeleteRequests"
  ].sort();

  it("keeps directives out, types declarative, and files below 500 lines", async () => {
    const fs = await import("node:fs");
    const ts = await import("typescript");
    for (const file of files) {
      const text = fs.readFileSync(`lib/ownership/${file}.ts`, "utf8");
      expect(text).not.toMatch(/(?:"use server"|"use client"|server-only)/);
      expect(text.trimEnd().split("\n").length).toBeLessThanOrEqual(500);
      if (file === "types") {
        const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
        expect(source.statements.every(node => ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)
          || (ts.isImportDeclaration(node) && node.importClause?.isTypeOnly))).toBe(true);
      }
    }
  });

  it("keeps the facade limited to the BASE named exports", async () => {
    const fs = await import("node:fs");
    const ts = await import("typescript");
    const facadeText = fs.readFileSync("lib/ownership.ts", "utf8");
    expect(facadeText.trimEnd().split("\n").length).toBeLessThanOrEqual(500);
    const source = ts.createSourceFile("ownership.ts", facadeText,
      ts.ScriptTarget.Latest, true);
    expect(source.statements.every(node => ts.isExportDeclaration(node) && !!node.moduleSpecifier
      && !!node.exportClause && ts.isNamedExports(node.exportClause))).toBe(true);
    const names = source.statements.flatMap(node => ts.isExportDeclaration(node) && node.exportClause
      && ts.isNamedExports(node.exportClause) ? node.exportClause.elements.map(element => element.name.text) : []);
    expect(names.sort()).toEqual(expectedExports);
  });

  it("permits only the declared internal dependency edges and no cycles", async () => {
    const fs = await import("node:fs");
    const ts = await import("typescript");
    const allowed: Record<string, string[]> = {
      types: [], accounts: ["types"], members: ["types"], governance: ["types", "accounts"]
    };
    const edges = new Map<string, string[]>();
    for (const file of files) {
      const source = ts.createSourceFile(file, fs.readFileSync(`lib/ownership/${file}.ts`, "utf8"),
        ts.ScriptTarget.Latest, true);
      const dependencies = source.statements.filter(ts.isImportDeclaration)
        .map(node => (node.moduleSpecifier as import("typescript").StringLiteral).text)
        .filter(specifier => specifier.startsWith("./"))
        .map(specifier => specifier.slice(2));
      expect(dependencies.every(dependency => allowed[file].includes(dependency))).toBe(true);
      edges.set(file, dependencies);
    }
    const visited = new Set<string>();
    const active = new Set<string>();
    function visit(file: string): boolean {
      if (active.has(file)) return false;
      if (visited.has(file)) return true;
      active.add(file);
      for (const dependency of edges.get(file) ?? []) if (!visit(dependency)) return false;
      active.delete(file);
      visited.add(file);
      return true;
    }
    expect(files.every(visit)).toBe(true);
  });

  it("keeps direct ownership module imports inside the folder or tests", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const ts = await import("typescript");
    const offenders: string[] = [];
    function scan(directory: string) {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (["node_modules", ".next", "coverage"].includes(entry.name)) continue;
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) scan(file);
        else if (/\.tsx?$/.test(file) && file !== "lib/ownership.ts" && !file.startsWith("tests/")
          && !file.includes("/__tests__/") && !file.startsWith("lib/ownership/")) {
          const text = fs.readFileSync(file, "utf8");
          const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
          const imports = source.statements.filter(node => ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
            .map(node => node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : "");
          function collectDynamicImports(node: import("typescript").Node) {
            if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
              && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) imports.push(node.arguments[0].text);
            ts.forEachChild(node, collectDynamicImports);
          }
          collectDynamicImports(source);
          const direct = imports.some(specifier => specifier.startsWith("@/lib/ownership/")
            || (specifier.startsWith(".") && path.normalize(path.join(path.dirname(file), specifier))
              .startsWith("lib/ownership/")));
          if (direct) offenders.push(file);
        }
      }
    }
    scan(".");
    expect(offenders).toEqual([]);
  });
});
