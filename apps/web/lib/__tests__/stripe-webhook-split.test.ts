import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const lib = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  "stripe-webhook/context.ts",
  "stripe-webhook/notify.ts",
  "stripe-webhook/transfers.ts",
  "stripe-webhook/payments.ts",
  "stripe-webhook-handlers.ts"
];
const allowed: Record<string, string[]> = {
  "stripe-webhook/context.ts": [],
  "stripe-webhook/notify.ts": ["stripe-webhook/context.ts"],
  "stripe-webhook/transfers.ts": ["stripe-webhook/context.ts", "stripe-webhook/notify.ts"],
  "stripe-webhook/payments.ts": [
    "stripe-webhook/context.ts",
    "stripe-webhook/notify.ts",
    "stripe-webhook/transfers.ts"
  ],
  "stripe-webhook-handlers.ts": [
    "stripe-webhook/context.ts",
    "stripe-webhook/notify.ts",
    "stripe-webhook/transfers.ts",
    "stripe-webhook/payments.ts"
  ]
};

function sourceFor(file: string) {
  const text = readFileSync(path.join(lib, file), "utf8");
  return { text, ast: ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true) };
}

function internalTarget(file: string, specifier: string) {
  const target = specifier.startsWith("./") || specifier.startsWith("../")
    ? path.resolve(path.dirname(path.join(lib, file)), specifier)
    : specifier.startsWith("@/lib/")
      ? path.join(lib, specifier.slice("@/lib/".length))
      : null;
  if (!target) return null;
  const relative = path.relative(lib, `${target}.ts`).split(path.sep).join("/");
  return files.includes(relative) ? relative : null;
}

describe("Stripe webhook split structure", () => {
  it("starts every new module with server-only and has no client or action directive", () => {
    for (const file of files.filter(name => name.startsWith("stripe-webhook/"))) {
      const { text, ast } = sourceFor(file);
      const first = ast.statements[0];
      expect(ts.isImportDeclaration(first) && first.moduleSpecifier.getText(ast)).toBe('"server-only"');
      expect(text).not.toContain('"use server"');
      expect(text).not.toContain('"use client"');
    }
  });

  it("uses only allowed internal import edges and has no cycle", () => {
    const edges = new Map<string, string[]>();
    for (const file of files) {
      const { ast } = sourceFor(file);
      const targets = ast.statements
        .filter(ts.isImportDeclaration)
        .map(node => internalTarget(file, (node.moduleSpecifier as ts.StringLiteral).text))
        .filter((target): target is string => target !== null);
      for (const target of targets) expect(allowed[file], `${file} -> ${target}`).toContain(target);
      edges.set(file, targets);
    }
    const visiting = new Set<string>();
    const visited = new Set<string>();
    function visit(file: string) {
      expect(visiting.has(file), `cycle at ${file}`).toBe(false);
      if (visited.has(file)) return;
      visiting.add(file);
      for (const target of edges.get(file) ?? []) visit(target);
      visiting.delete(file);
      visited.add(file);
    }
    for (const file of files) visit(file);
  });

  it("keeps every split file within 500 lines", () => {
    for (const file of files) {
      const lines = sourceFor(file).text.trimEnd().split("\n").length;
      expect(lines, file).toBeLessThanOrEqual(500);
    }
  });
});
