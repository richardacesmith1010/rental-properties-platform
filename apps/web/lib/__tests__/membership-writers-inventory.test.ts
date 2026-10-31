// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
const root = process.cwd();
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (["node_modules", ".next", "test-results"].includes(entry.name)) return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}
function isSource(path: string) {
  return /\.tsx?$/.test(path) && !/(?:^|\/)(?:__tests__|tests)\/|\.(?:test|spec)\./.test(path);
}
const writers = {
  "app/actions/account-governance-delete-support.ts": "Owner-authorized account deletion after requireAuth.",
  "app/actions/account-wipe.ts": "Deletes rows during an account wipe; never creates or activates",
  "app/actions/connect.ts": "Authenticated member self-service or account admin saves only the payout Stripe account id.",
  "app/actions/invitations.ts": "Owner-authorized invitation membership changes after requireAuth.",
  "app/actions/onboarding.ts": "Authenticated owner account creation after requireAuth.",
  "app/actions/ownership.ts": "Owner-authorized LLC creation after requireAuth.",
  "lib/distributions.ts": "Owner action-authorized distribution membership updates.",
  "lib/ownership/members.ts": "Owner or account administrator-authorized member changes."
};
const rpcs = {
  accept_llc_invitation: {
    writesMemberships: true, createsOrActivates: true, reason: "Atomically accepts an invitation and activates its membership."
  },
  account_wipe_apply: {
    writesMemberships: true, createsOrActivates: false, reason: "Deletes rows during an account wipe; never creates or activates"
  },
  ...Object.fromEntries([
    "acquire_bank_sync_lease", "save_bank_sync_cursor", "save_bank_balances", "manager_invite_accept", "owner_dashboard_payload",
    "manager_invite_revoke", "create_rent_charge_with_lines", "file_synced_bank_item", "manager_invite_grant", "manager_grant_homes",
    "is_owner_member_of_account", "ownership_accounts_payload", "owner_portfolio_payload", "owner_administered_property_ids",
    "undo_manual_payment", "add_rent_charge_line", "remove_rent_charge_line", "create_bank_connection", "add_client_home",
    "create_client_account", "resolve_bank_review_item", "record_deposit_return", "clear_deposit_return",
    "set_managers_can_send_reminders", "confirm_bank_account_links", "skip_bank_account_match", "disconnect_bank_connection"
  ].map(name => [name, { writesMemberships: false, createsOrActivates: false, reason: "Does not write memberships." }]))
};

function programFor(texts: Map<string, string>) {
  const options: ts.CompilerOptions = { target: ts.ScriptTarget.Latest, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler, baseUrl: root, paths: { "@/*": ["./*"] }, noLib: true, types: [] };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = name => {
    const text = texts.get(name);
    return text === undefined ? undefined : ts.createSourceFile(name, text, options.target!, true);
  };
  host.fileExists = name => texts.has(name);
  host.readFile = name => texts.get(name);
  return ts.createProgram([...texts.keys()], options, host);
}
function unwrap(node: ts.Expression): ts.Expression {
  return ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) ||
    ts.isAwaitExpression(node) || ts.isNonNullExpression(node) || ts.isTypeAssertionExpression(node) ? unwrap(node.expression) : node;
}
function scan(file: ts.SourceFile, checker: ts.TypeChecker) {
  const name = relative(root, file.fileName);
  const memberWrites = new Set<string>();
  const rpcNames: string[] = [];
  const acceptCallers: string[] = [];
  const invitationRpcCallers: string[] = [];
  const rawSql: string[] = [];
  const constants = new Map<string, ts.Expression>();
  const rpcConstants = new Map<string, ts.Expression>();
  function collectRpcConstants(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      rpcConstants.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, collectRpcConstants);
  }
  collectRpcConstants(file);
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement) || !(statement.declarationList.flags & ts.NodeFlags.Const)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer) constants.set(declaration.name.text, declaration.initializer);
    }
  }
  function stringValue(expression: ts.Expression, values = constants, seen = new Set<string>()): string | undefined {
    const value = unwrap(expression);
    if (ts.isStringLiteralLike(value)) return value.text;
    if (!ts.isIdentifier(value) || seen.has(value.text)) return undefined;
    seen.add(value.text);
    const initializer = values.get(value.text);
    return initializer && stringValue(initializer, values, seen);
  }
  function visit(node: ts.Node) {
    if (ts.isIdentifier(node)) {
      let symbol = checker.getSymbolAtLocation(node);
      if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
      const declaration = symbol?.valueDeclaration;
      const isReference = !ts.isImportSpecifier(node.parent) && !ts.isNamespaceImport(node.parent) &&
        !(ts.isFunctionDeclaration(node.parent) && node.parent.name === node);
      if (isReference && symbol?.getName() === "acceptLLCInvitationMembership" && declaration &&
          relative(root, declaration.getSourceFile().fileName) === "lib/llc-invitations.ts") acceptCallers.push(name);
    }
    if (ts.isStringLiteralLike(node) || ts.isTemplateExpression(node)) {
      const sql = ts.isStringLiteralLike(node) ? node.text : node.getText(file);
      if (/\b(?:insert|upsert|update|delete|select|truncate|merge)\b[\s\S]*\bownership_account_members\b/i.test(sql)) rawSql.push(sql);
    }
    if (ts.isCallExpression(node)) {
      const callee = unwrap(node.expression);
      if (ts.isPropertyAccessExpression(callee)) {
        const method = callee.name.text;
        const arg = node.arguments[0];
        const value = arg && stringValue(arg, method === "rpc" ? rpcConstants : constants);
        if (method === "rpc") {
          rpcNames.push(value ?? "UNREVIEWED_DYNAMIC_RPC");
          if (value === "accept_llc_invitation") {
            let owner: ts.Node = node;
            while (owner.parent && !ts.isFunctionDeclaration(owner)) owner = owner.parent;
            invitationRpcCallers.push(`${name}:${ts.isFunctionDeclaration(owner) ? owner.name?.text : "unknown"}`);
          }
        }
        if (/^(?:insert|upsert|update|delete)/.test(method) && value === "ownership_account_members") memberWrites.add(name);
        if (method === "from" && value === "ownership_account_members") {
          const methods: string[] = [];
          let current: ts.Node = node;
          while (current.parent) {
            const parent = current.parent;
            if (ts.isPropertyAccessExpression(parent) && parent.expression === current) methods.push(parent.name.text);
            else if (ts.isCallExpression(parent) && parent.expression === current) { /* Continue the builder chain. */ }
            else if (ts.isExpression(parent) && unwrap(parent) !== parent) { /* Transparent expression wrapper. */ }
            else break;
            current = parent;
          }
          const assigned = ts.isVariableDeclaration(current.parent) ||
            (ts.isBinaryExpression(current.parent) && current.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken);
          if (methods.some(method => /^(?:insert|upsert|update|delete)/.test(method)) || (assigned && !methods.includes("select"))) {
            memberWrites.add(name);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return { memberWrites: [...memberWrites], rpcNames, acceptCallers, invitationRpcCallers, rawSql };
}
function scanSynthetic(text: string) {
  const filename = join(root, "new.ts");
  const program = programFor(new Map([
    [filename, text], [join(root, "lib/llc-invitations.ts"), "export function acceptLLCInvitationMembership() {}"]
  ]));
  return scan(program.getSourceFile(filename)!, program.getTypeChecker());
}
describe("reviewed membership trust boundary", () => {
  it("T19 inventories all eight table writers and distinguishes delete-only RPCs from activation", () => {
    const texts = new Map(files(root).filter(isSource).map(path => [path, readFileSync(path, "utf8")]));
    const program = programFor(texts);
    const checker = program.getTypeChecker();
    const rows = [...texts.keys()].map(path => ({ name: relative(root, path), ...scan(program.getSourceFile(path)!, checker) }));
    expect([...new Set(rows.flatMap(row => row.memberWrites))].sort()).toEqual(Object.keys(writers).sort());
    for (const reason of Object.values(writers)) expect(reason.length).toBeGreaterThan(10);
    expect([...new Set(rows.flatMap(row => row.rpcNames))].sort()).toEqual(Object.keys(rpcs).sort());
    expect(rows.flatMap(row => row.acceptCallers)).toEqual(["app/actions/llc-invitations-support.ts"]);
    expect(rows.filter(row => row.rpcNames.includes("accept_llc_invitation")).map(row => row.name)).toEqual(["lib/llc-invitations.ts"]);
    expect(rows.flatMap(row => row.rawSql)).toEqual([]);
    expect(rows.flatMap(row => row.invitationRpcCallers)).toEqual(["lib/llc-invitations.ts:acceptLLCInvitationMembership"]);
    expect(Object.entries(rpcs).filter(([, entry]) => entry.writesMemberships).map(([name]) => name).sort())
      .toEqual(["accept_llc_invitation", "account_wipe_apply"]);
    expect(Object.entries(rpcs).filter(([, entry]) => entry.createsOrActivates).map(([name]) => name)).toEqual(["accept_llc_invitation"]);
    expect(rpcs.account_wipe_apply.reason).toEqual("Deletes rows during an account wipe; never creates or activates");
  }, 60_000);
  it("T19 scanner recognizes all quote styles, whitespace, mutations and rejects unknown RPCs and SQL", () => {
    for (const quote of ["'", '\"', "`"] ) {
      for (const method of ["insert", "upsert", "update", "delete"]) {
        expect(scanSynthetic(`client.from ( ${quote}ownership_account_members${quote} ).${method}({})`).memberWrites)
          .toEqual(["new.ts"]);
      }
    }
    expect(scanSynthetic('db.rpc("new_writer", {})').rpcNames).toEqual(["new_writer"]);
    expect(scanSynthetic('db.rpc(input, {})').rpcNames).toEqual(["UNREVIEWED_DYNAMIC_RPC"]);
    expect(scanSynthetic('const sql = "INSERT INTO ownership_account_members VALUES (1)"').rawSql)
      .toEqual(["INSERT INTO ownership_account_members VALUES (1)"]);
  });
  it.each([
    ["module string constant", 'const TABLE = "ownership_account_members"; client.from(TABLE).upsert({});'],
    ["parentheses", '(client.from("ownership_account_members")).insert({});'],
    ["as cast", '(client.from("ownership_account_members") as Builder).upsert({});'],
    ["satisfies", '(client.from("ownership_account_members") satisfies Builder).update({});'],
    ["await", '(await client.from("ownership_account_members")).delete();'],
    ["non-null", 'client.from("ownership_account_members")!.insert({});'],
    ["variable builder", 'const members = client.from("ownership_account_members"); members.upsert({});'],
    ["assigned builder", 'let members; members = client.from("ownership_account_members"); members.insert({});'],
    ["insert helper", 'plan.insertRows("ownership_account_members", []);'],
    ["upsert helper", 'plan.upsertRows("ownership_account_members", []);'],
    ["update helper", 'plan.updateWhere("ownership_account_members", []);'],
    ["deleteIn helper", 'plan.deleteIn("ownership_account_members", []);'],
    ["deleteWhere helper", 'plan.deleteWhere("ownership_account_members", []);']
  ])("T19 scanner flags %s", (_name, text) => {
    expect(scanSynthetic(text).memberWrites).toEqual(["new.ts"]);
  });
  it("T19 scanner permits a selected builder assigned to a variable", () => {
    expect(scanSynthetic('const members = client.from("ownership_account_members").select("id");').memberWrites).toEqual([]);
  });
  it.each([
    ["aliased import", 'import { acceptLLCInvitationMembership as join } from "@/lib/llc-invitations"; join();'],
    ["namespace import", 'import * as invites from "@/lib/llc-invitations"; invites.acceptLLCInvitationMembership();'],
    ["function reference", 'import { acceptLLCInvitationMembership as join } from "@/lib/llc-invitations"; const invoke = join;']
  ])("T19 type checker flags %s of the join helper", (_name, text) => {
    expect(scanSynthetic(text).acceptCallers).toEqual(["new.ts"]);
  });
  it.each(["TRUNCATE TABLE public.ownership_account_members", "MERGE INTO public.ownership_account_members USING incoming ON true"])(
    "T19 scanner flags raw SQL %s", sql => {
      expect(scanSynthetic(`const sql = ${JSON.stringify(sql)};`).rawSql).toEqual([sql]);
    }
  );
  it("T6 removes hold symbols and sentences from every app file, including tests and non-code", () => {
    const forbidden = ["LLC_INVITES_" + "PAUSED", "isLlcInvites" + "Paused",
      "Partner invites are paused for " + "a safety fix. Please try again in a few days.",
      "This invite is paused for " + "a safety fix. Please try again in a few days."];
    for (const file of files(root)) {
      const content = readFileSync(file, "utf8");
      for (const phrase of forbidden) expect(content, relative(root, file)).not.toContain(phrase);
    }
  }, 60_000);
});
