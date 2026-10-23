import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

function argumentsByFlag(argv) {
  const options = { newFiles: [] };
  for (let i = 0; i < argv.length;) {
    const flag = argv[i];
    if (!["--base", "--old", "--facade", "--new"].includes(flag)) {
      throw new Error(`Invalid argument: ${flag ?? "missing"}`);
    }
    if (flag === "--new") {
      i++;
      if (!argv[i] || argv[i].startsWith("--")) throw new Error("--new needs a file");
      while (i < argv.length && !argv[i].startsWith("--")) options.newFiles.push(argv[i++]);
    } else {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error(`${flag} needs a value`);
      options[flag.slice(2)] = value;
      i += 2;
    }
  }
  if (!options.base || !options.old || !options.facade || options.newFiles.length === 0) {
    throw new Error("Usage: --base <sha> --old <path> --facade <path> --new <path>...");
  }
  return options;
}

function declarationName(node) {
  if (ts.isVariableStatement(node)) {
    if (node.declarationList.declarations.length !== 1) {
      throw new Error("A variable statement must declare exactly one name");
    }
    const name = node.declarationList.declarations[0].name;
    if (!ts.isIdentifier(name)) throw new Error("Destructured top-level declaration is unsupported");
    return name.text;
  }
  if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)
    || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node)) {
    if (!node.name) throw new Error("Anonymous top-level declaration is unsupported");
    return node.name.text;
  }
  throw new Error(`Unsupported top-level statement: ${ts.SyntaxKind[node.kind]}`);
}

function parseDeclarations(file, source) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  if (ast.parseDiagnostics.length) throw new Error(`TypeScript parse failed: ${file}`);
  const declarations = new Map();
  for (const node of ast.statements) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
      || (ts.isExpressionStatement(node) && ts.isStringLiteral(node.expression))) continue;
    const name = declarationName(node);
    if (declarations.has(name)) throw new Error(`Duplicate top-level declaration ${name} in ${file}`);
    declarations.set(name, { node, text: node.getFullText(ast), ast });
  }
  return declarations;
}

function withoutAddedExport(entry) {
  const { node, text, ast } = entry;
  const offset = node.getStart(ast) - node.getFullStart();
  if (!text.slice(offset).startsWith("export ")) return null;
  return text.slice(0, offset) + text.slice(offset + "export ".length);
}

try {
  const options = argumentsByFlag(process.argv.slice(2));
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const oldPath = path.relative(root, path.resolve(options.old)).split(path.sep).join("/");
  if (oldPath.startsWith("..")) throw new Error("Old path is outside the repository");
  const original = execFileSync("git", ["show", `${options.base}:${oldPath}`], { encoding: "utf8" });
  const old = parseDeclarations(oldPath, original);
  const files = [options.facade, ...options.newFiles];
  const found = new Map();
  const perFile = new Map();
  for (const file of files) {
    const declarations = parseDeclarations(file, readFileSync(file, "utf8"));
    perFile.set(file, declarations);
    for (const [name, entry] of declarations) {
      if (found.has(name)) throw new Error(`Duplicate declaration ${name} across ${found.get(name).file} and ${file}`);
      found.set(name, { ...entry, file });
    }
  }

  let failures = 0;
  const facade = perFile.get(options.facade);
  for (const [name, originalEntry] of old) {
    const current = found.get(name);
    const moved = current?.file !== options.facade;
    const actual = current && moved
      ? (current.text === originalEntry.text ? current.text : withoutAddedExport(current))
      : current?.text;
    const match = actual === originalEntry.text;
    console.log(`${match ? "OK" : "DIFF"} ${name}`);
    if (!match) failures++;
  }
  for (const name of found.keys()) {
    if (!old.has(name)) {
      console.log(`DIFF extra declaration ${name}`);
      failures++;
    }
  }
  const retained = [...old].filter(([name]) => facade.has(name)).map(([, entry]) => entry.text).join("");
  const facadeText = [...facade.values()].map(entry => entry.text).join("");
  if (retained !== facadeText) {
    console.log("DIFF facade non-import text");
    failures++;
  } else {
    console.log("OK facade non-import text");
  }
  if (failures) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
