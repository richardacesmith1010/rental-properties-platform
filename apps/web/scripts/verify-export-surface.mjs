import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

function optionsFromArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!["--base", "--facade"].includes(argv[i]) || !argv[i + 1]) {
      throw new Error("Usage: --base <sha> --facade <path>");
    }
    options[argv[i].slice(2)] = argv[i + 1];
  }
  if (!options.base || !options.facade) throw new Error("Usage: --base <sha> --facade <path>");
  return options;
}

function programFor(file, compilerOptions) {
  const program = ts.createProgram([file], compilerOptions);
  const source = program.getSourceFile(file);
  if (!source) throw new Error(`Cannot load ${file}`);
  return { checker: program.getTypeChecker(), source };
}

function exportSurface({ checker, source }) {
  const moduleSymbol = checker.getSymbolAtLocation(source);
  if (!moduleSymbol) throw new Error(`Cannot inspect exports in ${source.fileName}`);
  const surface = new Map();
  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    const symbol = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0] ?? source;
    const kind = [
      symbol.flags & ts.SymbolFlags.Type ? "type" : "",
      symbol.flags & ts.SymbolFlags.Value ? "value" : ""
    ].filter(Boolean).join("+");
    const parts = [];
    if (symbol.flags & ts.SymbolFlags.Type) {
      const type = checker.getDeclaredTypeOfSymbol(symbol);
      const properties = checker.getPropertiesOfType(type).map(property => {
        const location = property.valueDeclaration ?? property.declarations?.[0] ?? declaration;
        const propertyType = checker.getTypeOfSymbolAtLocation(property, location);
        const optional = property.flags & ts.SymbolFlags.Optional ? "?" : "";
        return `${property.name}${optional}: ${checker.typeToString(propertyType, location, ts.TypeFormatFlags.NoTruncation)}`;
      });
      parts.push(`type ${checker.typeToString(type, declaration, ts.TypeFormatFlags.NoTruncation)}`);
      parts.push(`properties {${properties.join("; ")}}`);
    }
    if (symbol.flags & ts.SymbolFlags.Value) {
      const type = checker.getTypeOfSymbolAtLocation(symbol, declaration);
      const signatures = checker.getSignaturesOfType(type, ts.SignatureKind.Call);
      parts.push(signatures.length ? signatures.map(signature => checker.signatureToString(
        signature, declaration, ts.TypeFormatFlags.NoTruncation
      )).join("; ") : checker.typeToString(type, declaration, ts.TypeFormatFlags.NoTruncation));
    }
    surface.set(exported.name, { kind, api: parts.join(" | ") });
  }
  return surface;
}

let temporaryDirectory;
try {
  const options = optionsFromArgs(process.argv.slice(2));
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const facade = path.resolve(options.facade);
  const repoPath = path.relative(root, facade).split(path.sep).join("/");
  if (repoPath.startsWith("..")) throw new Error("Facade is outside the repository");
  const baseSource = execFileSync("git", ["show", `${options.base}:${repoPath}`], { encoding: "utf8" });
  const configPath = ts.findConfigFile(path.dirname(facade), ts.sys.fileExists, "tsconfig.json");
  if (!configPath) throw new Error("Cannot find tsconfig.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath));
  if (parsed.errors.length) throw new Error("Cannot parse tsconfig.json");
  temporaryDirectory = mkdtempSync(path.join(path.dirname(facade), ".export-surface-"));
  const baseFile = path.join(temporaryDirectory, path.basename(facade));
  writeFileSync(baseFile, baseSource);
  const before = exportSurface(programFor(baseFile, parsed.options));
  const after = exportSurface(programFor(facade, parsed.options));
  let failures = 0;
  for (const name of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const base = before.get(name);
    const current = after.get(name);
    const match = !!base && !!current && base.kind === current.kind && base.api === current.api;
    if (!match) {
      console.log(`${name} | ${base?.kind ?? "MISSING"} | ${current?.kind ?? "MISSING"} | ${base?.api === current?.api}`);
      failures++;
    } else {
      console.log(`OK ${name} | ${current.kind}`);
    }
  }
  console.log(failures ? `DIFF ${failures} export(s)` : `OK ${before.size} exports: names, namespaces, public APIs`);
  if (failures) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
}
