import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Each public export is named, so adding an export cannot silently widen an exception.
export const PUBLIC_ACTION_FILES: Record<string, { reason: string; exports: string[] }> = {
  "auth.ts": { reason: "Sign-out exit", exports: ["signOut"] },
  "login.ts": { reason: "Public sign-in", exports: ["loginAction"] },
  "forgot-password.ts": { reason: "Public password recovery", exports: ["forgotPasswordAction"] },
  "sign-up.ts": { reason: "Public registration records assent", exports: ["signUpAction"] },
  "join-invite.ts": { reason: "Public token-bound join resend", exports: ["resendFromJoinLink"] },
  "plaid.ts": { reason: "Retired entry points return only a fixed error", exports: [
    "initiatePlaidLink", "completePlaidLink", "refreshPlaidBalance", "disconnectPlaid"] },
  "feedback.ts": { reason: "support channel: people who won't agree can still tell us why (259a decision)", exports: ["submitFeedback"] },
  "llc-invitations.ts": { reason: "Public token-bound join; paused until 259b", exports: [
    "acceptLLCInvitation", "signInToJoinLLC", "createAccountToJoinLLC"] },
  "account-governance-delete-support.ts": { reason: "Internal governance helpers; authenticated callers supply context", exports: [
    "deleteGovernedAccount", "resolveAccountDeleteRequest"] },
  "account-governance-setup.ts": { reason: "Internal governance helpers; authenticated callers supply context", exports: [
    "revalidateOwnershipSurfaces", "normalizeName", "isOwnerAdminMembership", "loadAccountAndMembership",
    "getPendingRenameRequest", "getPendingDeleteRequest", "updateVotesReceived", "getVoteCounts", "applyApprovedRename"] },
  "entity-updates-support.ts": { reason: "Internal entity helpers; authenticated callers supply context", exports: [
    "revalidateEntitySurfaces", "hasChanges", "isDateAfter", "getUnitRecord", "getLeaseRecord", "getProfileRecord",
    "assertPropertyAccess"] },
  "llc-invitations-support.ts": { reason: "Internal helpers for gated management and public token-bound registration", exports: [
    "getAppUrl", "buildInviteUrl", "buildJoinRedirect", "getNickname", "buildInvitationResultMessage", "loadInviteManagementContext",
    "revalidateLlcSurfaces", "resolveInvitationForAcceptance", "finalizeInvitationAcceptance", "recordLlcRegistrationAgreement"] },
  "maintenance-queries.ts": { reason: "Internal photo helpers; authenticated callers supply ticket context", exports: [
    "getMaintenancePhotoFiles", "canAccessMaintenanceTicketForPhotos", "rollbackUploadedMaintenancePhotos",
    "insertMaintenancePhotoMetadata", "uploadPhotosForTicket"] },
  "shared.ts": { reason: "Internal capability check; does not authorize or mutate user data", exports: ["ensureCapabilityEnabled"] },
  "tenant-invitation-support.ts": { reason: "Internal invitation helpers; authenticated callers supply property context", exports: [
    "normalizeOptionalString", "buildPropertyAddress", "getTenantInviteContext", "buildTenantInviteMetadata", "createTenantInviteLink",
    "fallbackToSupabaseInvite", "buildTenantResendPayload", "deleteGeneratedInviteUser"] },
  "auth-helpers.ts": { reason: "The shared gate implementations", exports: ["requireAuth", "requireAuthForExit"] }
};
const EXIT_ACTIONS: Record<string, string[]> = {
  "account-deletion-request.ts": ["requestAccountDeletion"],
  "legal-acceptance.ts": ["agreeToTerms", "recordInviteAgreement"]
};
export const API_ROUTE_INVENTORY: Record<string, { kind: string; reason: string; loader?: string }> = {
  "account/export": { kind: "exit", reason: "R0 data export and receipt exit" },
  "ai/chat": { kind: "gated", reason: "Authenticated data" },
  "assets/document-packet/[packetId]": { kind: "gated", reason: "Authenticated data" },
  "assets/maintenance-photo/[photoId]": { kind: "gated", reason: "Authenticated data" },
  "assets/property-file/[fileId]": { kind: "gated", reason: "Authenticated data" },
  "cron/bank-sync": { kind: "cron", reason: "CRON_SECRET" },
  "cron/generate-charges": { kind: "cron", reason: "CRON_SECRET" },
  "cron/history": { kind: "cron", reason: "CRON_SECRET" },
  "cron/keep-alive": { kind: "cron", reason: "CRON_SECRET" },
  "cron/verify-stripe-accounts": { kind: "cron", reason: "CRON_SECRET" },
  "email-preview": { kind: "public", reason: "Readiness or preview endpoint; existing authorization" },
  "health/cron": { kind: "public", reason: "Readiness or preview endpoint; existing authorization" },
  "health": { kind: "public", reason: "Readiness or preview endpoint; existing authorization" },
  "health/stripe": { kind: "public", reason: "Readiness or preview endpoint; existing authorization" },
  "owner/section-data": { kind: "gated", reason: "Authenticated data" },
  "owner-statement/csv": { kind: "gated", reason: "Authenticated data", loader: "lib/owner-statement.ts" },
  "pdf/invoice/[paymentId]": { kind: "gated", reason: "Authenticated data", loader: "app/api/pdf/manager-invoice/[paymentId]/route.ts" },
  "pdf/lease-summary/[leaseId]": { kind: "exit", reason: "R0 data export and receipt exit" },
  "pdf/manager-invoice/[paymentId]": { kind: "gated", reason: "Authenticated data" },
  "pdf/owner-statement": { kind: "gated", reason: "Authenticated data", loader: "lib/owner-statement.ts" },
  "pdf/receipt/[chargeId]": { kind: "exit", reason: "R0 data export and receipt exit" },
  "pdf/receipts": { kind: "exit", reason: "R0 data export and receipt exit" },
  "webhooks/plaid": { kind: "webhook", reason: "Provider signature" },
  "webhooks/stripe": { kind: "webhook", reason: "Provider signature" }
};
export const PAGE_INVENTORY: Record<string, { kind: string; reason: string }> = {
  "achievements": { kind: "gated", reason: "Authenticated page" },
  "agree": { kind: "exit", reason: "R5 agreement/setup exit" },
  "auth/confirm": { kind: "public", reason: "Public Auth confirmation link" },
  "autopay/return": { kind: "gated", reason: "Authenticated page" },
  "complete-profile": { kind: "exit", reason: "R5 agreement/setup exit" },
  "connect/onboard": { kind: "gated", reason: "Authenticated page" },
  "connect/refresh": { kind: "gated", reason: "Authenticated page" },
  "connect/return": { kind: "gated", reason: "Authenticated page" },
  "join/[inviteId]": { kind: "public", reason: "Public invite landing" },
  "join-llc": { kind: "public", reason: "Public token-bound join; paused until 259b" },
  "login": { kind: "public", reason: "Public authentication" },
  "manager/clients/[accountId]": { kind: "gated", reason: "Authenticated page" },
  "manager": { kind: "gated", reason: "Authenticated page" },
  "manager/properties/[propertyId]": { kind: "gated", reason: "Authenticated page" },
  "marketing": { kind: "public", reason: "Public marketing" },
  "onboarding": { kind: "gated", reason: "Authenticated page" },
  "ops": { kind: "gated", reason: "Authenticated page" },
  "owner/bank/oauth": { kind: "gated", reason: "Authenticated page" },
  "owner/bank/oauth-app": { kind: "gated", reason: "Authenticated page" },
  "owner/bank": { kind: "gated", reason: "Authenticated page" },
  "owner/money": { kind: "gated", reason: "Authenticated page" },
  "owner": { kind: "gated", reason: "Authenticated page" },
  "owner/properties/[propertyId]": { kind: "gated", reason: "Authenticated page" },
  "owner/reports": { kind: "gated", reason: "Authenticated page" },
  "owner/setup": { kind: "gated", reason: "Authenticated page" },
  "": { kind: "public", reason: "Public entry redirects to role pages or marketing" },
  "payments/cancel": { kind: "public", reason: "Public checkout cancellation; redirects to gated dashboard" },
  "payments/receipt/[chargeId]": { kind: "gated", reason: "Authenticated page" },
  "payments/success": { kind: "gated", reason: "Authenticated page" },
  "privacy": { kind: "public", reason: "Public legal notice" },
  "reset-password": { kind: "public", reason: "Public password recovery" },
  "settings": { kind: "gated", reason: "Authenticated page" },
  "support": { kind: "public", reason: "Public help, including before agreement" },
  "tenant": { kind: "gated", reason: "Authenticated page" },
  "terms": { kind: "public", reason: "Public legal terms" }
};

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const name = path.join(directory, entry.name);
    return entry.isDirectory() && !name.includes("__tests__") ? files(name) : entry.isFile() ? [name] : [];
  });
}
function source(file: string) { return readFileSync(file, "utf8"); }
function functionDeclarations(ast: ts.SourceFile) {
  const declarations = new Map<string, { body: ts.ConciseBody; exported: boolean }>();
  for (const node of ast.statements) {
    const exported = ts.canHaveModifiers(node) &&
      (ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false);
    if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      declarations.set(node.name.text, { body: node.body, exported });
    } else if (ts.isVariableStatement(node)) for (const declaration of node.declarationList.declarations) {
      const value = declaration.initializer;
      if (ts.isIdentifier(declaration.name) && value && (ts.isArrowFunction(value) || ts.isFunctionExpression(value))) {
        declarations.set(declaration.name.text, { body: value.body, exported });
      }
    }
  }
  return declarations;
}
function callsIn(node: ts.Node) {
  const calls: string[] = [];
  function visit(child: ts.Node) {
    if (ts.isCallExpression(child) && ts.isIdentifier(child.expression)) calls.push(child.expression.text);
    ts.forEachChild(child, visit);
  }
  visit(node); return calls;
}
// Trace existing delegating actions through named helpers/imports to the real requireAuth call.
// This also covers checkout, wipe, and notification wrappers without adding redundant authentication.
function reachesGate(file: string, name: string, visited = new Set<string>()): boolean {
  const key = `${file}:${name}`;
  if (visited.has(key)) return false;
  visited.add(key);
  const ast = ts.createSourceFile(file, source(file), ts.ScriptTarget.Latest, true);
  const declarations = functionDeclarations(ast);
  const imports = new Map<string, { file: string; name: string }>();
  for (const node of ast.statements) {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue;
    const specifier = node.moduleSpecifier.text;
    const target = specifier.startsWith("@/") ? specifier.slice(2) : specifier.startsWith(".")
      ? path.join(path.dirname(file), specifier) : null;
    if (!target) continue;
    const bindings = node.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) for (const element of bindings.elements) {
      imports.set(element.name.text, { file: `${target}.ts`, name: (element.propertyName ?? element.name).text });
    }
  }
  const declaration = declarations.get(name);
  if (!declaration?.body) return false;
  const calls = callsIn(declaration.body);
  return calls.some((call) => {
    const imported = imports.get(call);
    if (call === "requireAuth" && imported?.file.endsWith("auth-helpers.ts")) return true;
    if (declarations.has(call)) return reachesGate(file, call, visited);
    return imported && !imported.file.endsWith("auth-helpers.ts") && reachesGate(imported.file, imported.name, visited);
  });
}

describe("agreement entry-point inventories", () => {
  it("I1 discovers function and async const exports without a use-server directive", () => {
    const ast = ts.createSourceFile("fixture.ts", `
      export async function action() { return requireAuth("owner"); }
      export const arrow = async () => requireAuth("tenant");
      export const expression = async function () { return requireAuthForExit(); };
      async function privateHelper() {}
    `, ts.ScriptTarget.Latest, true);
    const exports = [...functionDeclarations(ast)].filter(([, declaration]) => declaration.exported);
    expect(exports.map(([name]) => name)).toEqual(["action", "arrow", "expression"]);
    expect(exports.map(([, declaration]) => callsIn(declaration.body))).toEqual([
      ["requireAuth"], ["requireAuth"], ["requireAuthForExit"]
    ]);
  });
  it("I1 every action export reaches requireAuth or a named public/exit exception in every ts file", () => {
    for (const file of files("app/actions").filter((file) => file.endsWith(".ts"))) {
      const text = source(file);
      const filename = path.basename(file);
      const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
      for (const [name, declaration] of functionDeclarations(ast)) {
        if (!declaration.exported) continue;
        if (EXIT_ACTIONS[filename]?.includes(name)) {
          expect(callsIn(declaration.body).filter((call) => call === "requireAuthForExit"), `${file}:${name}`)
            .toEqual(["requireAuthForExit"]);
        } else if (PUBLIC_ACTION_FILES[filename]?.exports.includes(name)) {
          const entry = PUBLIC_ACTION_FILES[filename];
          expect(entry.reason.length).toBeGreaterThan(10);
          if (entry.reason.startsWith("Internal")) expect(text, file).not.toMatch(/["']use server["']/);
        } else expect(reachesGate(file, name), `${file}:${name} needs an agreement gate`).toBe(true);
      }
      const exitCalls = callsIn(ast).filter((call) => call === "requireAuthForExit").length;
      expect(exitCalls, file).toEqual(EXIT_ACTIONS[filename]?.length ?? 0);
    }
  });
  it("I2 every API route chooses a gate, exit, cron, webhook or public classification", () => {
    const routes = files("app/api").filter((file) => file.endsWith("/route.ts"));
    const names = routes.map((file) => file.slice("app/api/".length, -"/route.ts".length));
    expect(names.sort()).toEqual(Object.keys(API_ROUTE_INVENTORY).sort());
    for (const [name, entry] of Object.entries(API_ROUTE_INVENTORY)) {
      expect(["gated", "exit", "cron", "webhook", "public"], name).toContain(entry.kind);
      expect(entry.reason.length).toBeGreaterThan(5);
      const text = source(`app/api/${name}/route.ts`);
      if (entry.kind === "gated") {
        expect(entry.loader ? source(entry.loader) : text, name).toContain("agreementApiResponse(");
        if (entry.loader) expect(text).toContain(entry.loader.replace(/^lib\//, "@/lib/").replace(/\.ts$/, ""));
      }
      if (entry.kind === "exit") expect(name).toMatch(/^(account\/export|pdf\/(receipt\/|receipts$|lease-summary\/))/);
    }
  });
  it("I3 every page chooses a default gate, two exits, or a public reason", () => {
    const pages = files("app").filter((file) => file.endsWith("/page.tsx"));
    const names = pages.map((file) => file.slice("app/".length).replace(/\/?page\.tsx$/, ""));
    expect(names.sort()).toEqual(Object.keys(PAGE_INVENTORY).sort());
    for (const [name, entry] of Object.entries(PAGE_INVENTORY)) {
      expect(["gated", "exit", "public"], name).toContain(entry.kind);
      const text = source(`app/${name ? `${name}/` : ""}page.tsx`);
      if (entry.kind === "gated") {
        expect(text, name).toMatch(/(?:getAuthenticatedUser|requireRole)\(/);
        expect(text, name).not.toContain('legal: "skip"');
      } else if (entry.kind === "exit") {
        expect(["agree", "complete-profile"]).toContain(name); expect(text).toContain('legal: "skip"');
      } else expect(entry.reason.length).toBeGreaterThan(10);
    }
  });
});
