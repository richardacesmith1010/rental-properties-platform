import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

export interface PlainLanguageHit {
  file: string;
  line: number;
  text: string;
  reason: string;
}

const banned = [
  "charges?", "submits?", "delinquen(?:cy|cies|t|ts)", "disbursements?",
  "reconciliations?", "reconciles?", "remittances?", "acknowledg(?:e)?ments?",
  "terminates?", "commences?", "pursuant", "herein", "utilizes?",
  "facilitates?", "subsequent", "prior\\s+to", "inquires?", "endeavors?",
  "transactions?", "ledgers?", "CSV", "ACH", "onboard(?:ing|ings|s)?",
  "command\\s+center", "premiums?",
];
const bannedPattern = new RegExp(`\\b(?:${banned.join("|")})\\b`, "gi");
const displayAttributes = new Set(["title", "placeholder", "aria-label", "alt", "label"]);
const displayProperties = new Set([
  "title", "body", "description", "message", "error", "label", "subject",
  "heading", "text", "cta",
]);

function isEmailFile(file: string): boolean {
  return file.startsWith("apps/web/lib/") && /email/i.test(path.basename(file));
}

function plainText(value: string, email: boolean): string {
  let result = value.replace(/\$\{[^}]*\}/g, "value");
  if (email) {
    result = result.replace(/<\/[^>]+>/g, ". ").replace(/<[^>]*>/g, " ")
      .replace(/&apos;|&#39;/gi, "'").replace(/&(?:[a-z]+|#\d+);/gi, " ");
  }
  return result.replace(/\s+/g, " ").trim();
}

function shouldCheck(value: string): boolean {
  if (!/[a-z]/i.test(value) || /^https?:\/\//i.test(value)) return false;
  if (/^(?:\/|@\/|\.\/|\.\.\/)/.test(value)) return false;
  if (!value.includes(" ") && /^[\w./@:#?=&{}%-]+$/.test(value)) {
    return /^(?:charge|charges|submit|CSV|ACH|ledger|premium)$/i.test(value);
  }
  if (/^(?:[\w.-]+\/)+[\w.-]+$/.test(value)) return false;
  if (bannedPattern.test(value)) {
    bannedPattern.lastIndex = 0;
    return true;
  }
  bannedPattern.lastIndex = 0;
  return true;
}

function expressionText(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    return node.head.text + node.templateSpans.map((span) => `value${span.literal.text}`).join("");
  }
  return null;
}

export function scanSource(source: string, file: string): PlainLanguageHit[] {
  if (/^apps\/web\/app\/(?:terms|privacy|ops)\//.test(file)) return [];
  const email = isEmailFile(file);
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const hits: PlainLanguageHit[] = [];
  const seen = new Set<string>();

  function check(node: ts.Node, raw: string): void {
    const value = plainText(raw, email);
    if (!shouldCheck(value)) return;
    const line = tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
    const key = `${line}:${value}`;
    if (seen.has(key)) return;
    seen.add(key);
    for (const match of value.matchAll(bannedPattern)) {
      hits.push({ file, line, text: value, reason: `banned word: ${match[0]}` });
    }
    for (const sentence of value.split(/[.!?]+/)) {
      const words = sentence.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? [];
      if (words.length > 12) {
        hits.push({ file, line, text: value, reason: `sentence has ${words.length} words` });
      }
    }
  }

  function visit(node: ts.Node): void {
    if (ts.isJsxText(node)) check(node, node.getText(tree));
    if (email) {
      const value = expressionText(node);
      if (value !== null && !ts.isTemplateHead(node) && !ts.isTemplateMiddle(node)
        && !ts.isTemplateTail(node)) check(node, value);
    } else if (ts.isJsxExpression(node) && node.expression) {
      if (ts.isJsxAttribute(node.parent) && node.parent.name.getText(tree) === "className") {
        ts.forEachChild(node, visit);
        return;
      }
      const value = expressionText(node.expression);
      if (value !== null) check(node.expression, value);
    } else if (ts.isJsxAttribute(node) && displayAttributes.has(node.name.getText(tree))) {
      if (node.initializer) {
        const direct = expressionText(node.initializer);
        const nested = ts.isJsxExpression(node.initializer) && node.initializer.expression
          ? expressionText(node.initializer.expression) : null;
        if (direct !== null) check(node.initializer, direct);
        if (nested !== null) check(node.initializer, nested);
      }
    } else if (ts.isPropertyAssignment(node)) {
      const name = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : "";
      if (displayProperties.has(name)) {
        const value = expressionText(node.initializer);
        if (value !== null) check(node.initializer, value);
      }
    } else if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.expression.getText(tree) === "toast") {
      const first = node.arguments[0];
      if (first) {
        const value = expressionText(first);
        if (value !== null) check(first, value);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return hits;
}

export function scanWeb(root: string): PlainLanguageHit[] {
  const files: string[] = [];
  function walk(dir: string): void {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const relative = `${dir}/${entry.name}`;
      if (entry.isDirectory() && entry.name !== "__tests__") walk(relative);
      else if (/\.tsx?$/.test(entry.name) && !/\.(?:test|spec)\.tsx?$/.test(entry.name)) files.push(relative);
    }
  }
  walk("apps/web/app");
  walk("apps/web/components");
  walk("apps/web/lib");
  return files.flatMap((file) => scanSource(fs.readFileSync(path.join(root, file), "utf8"), file));
}
