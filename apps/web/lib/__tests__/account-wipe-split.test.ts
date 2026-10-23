import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "../..");
const paths = {
  facade: "app/actions/account-wipe.ts",
  scope: "lib/account-wipe/scope.ts",
  mutations: "lib/account-wipe/mutations.ts"
} as const;
function source(file: string) { return fs.readFileSync(path.join(root, file), "utf8"); }
function ast(file: string) { return ts.createSourceFile(file, source(file), ts.ScriptTarget.Latest, true); }
function imports(file: string) {
  return ast(file).statements.filter(ts.isImportDeclaration).map((node) => ({
    name: (node.moduleSpecifier as ts.StringLiteral).text,
    typeOnly: Boolean(node.importClause?.isTypeOnly)
  }));
}
function internalImports(file: string) {
  const internalRoot = path.join(root, "lib/account-wipe");
  return imports(file).filter((edge) => {
    const target = edge.name.startsWith("@/")
      ? path.join(root, edge.name.slice(2))
      : edge.name.startsWith(".")
        ? path.resolve(root, path.dirname(file), edge.name)
        : "";
    return target === internalRoot || target.startsWith(`${internalRoot}${path.sep}`);
  });
}
function filesUnder(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (["node_modules", ".next", ".git"].includes(entry.name)) return [];
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(full) : /\.[cm]?[jt]sx?$/.test(entry.name) ? [full] : [];
  });
}

describe("account wipe split structure", () => {
  it("K7 new modules start server-only and have no client or action directives", () => {
    for (const file of [paths.scope, paths.mutations]) {
      const parsed = ast(file);
      const first = parsed.statements[0];
      expect(ts.isImportDeclaration(first)).toBe(true);
      if (ts.isImportDeclaration(first)) {
        expect((first.moduleSpecifier as ts.StringLiteral).text).toBe("server-only");
      }
      expect(source(file)).not.toMatch(/["']use (server|client)["']/);
    }
  });
  it("K7 facade keeps only six callable exports", () => {
    const parsed = ast(paths.facade);
    const first = parsed.statements[0];
    expect(ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression) &&
      first.expression.text === "use server").toBe(true);
    const exports = parsed.statements.filter((node) =>
      (ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) ||
      ts.isExportDeclaration(node) || ts.isExportAssignment(node));
    expect(exports.map((node) => ts.isFunctionDeclaration(node) ? node.name?.text : "unexpected export")).toEqual([
      "deleteAllProperties", "deleteAllTenants", "deleteAllManagers", "deleteAllLeases",
      "deleteAllFinancialData", "fullAccountWipe"
    ]);
    expect(exports.every((node) => ts.isFunctionDeclaration(node) &&
      Boolean(ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword)))).toBe(true);
  });
  it("K7 internal imports obey the exact directional allowlist", () => {
    expect(internalImports(paths.scope)).toEqual([]);
    expect(internalImports(paths.mutations)).toEqual([{ name: "./scope", typeOnly: true }]);
    expect(internalImports(paths.facade)).toEqual([
      { name: "@/lib/account-wipe/scope", typeOnly: false },
      { name: "@/lib/account-wipe/mutations", typeOnly: false }
    ]);
  });
  it("K7 no outside importer reaches private modules", () => {
    const offenders = filesUnder(root).map((file) => path.relative(root, file)).filter((file) => {
      if (file.startsWith("lib/account-wipe/") || file === paths.facade || file.includes("/__tests__/")) return false;
      return internalImports(file).length > 0;
    });
    expect(offenders).toEqual([]);
  });
  it("K7 each split file stays within 500 lines", () => {
    for (const file of Object.values(paths)) {
      expect(source(file).trimEnd().split("\n").length).toBeLessThanOrEqual(500);
    }
  });
});
