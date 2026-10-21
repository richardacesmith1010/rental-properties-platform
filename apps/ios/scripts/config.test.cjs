const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { parseLast, nextBuild } = require("./build-number.cjs");
const ios = path.resolve(__dirname, "..");
const repo = path.resolve(ios, "../..");
process.chdir(ios);
const ts = require("typescript");
const vm = require("node:vm");
const source = ts.transpileModule(readFileSync("capacitor.config.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS }
}).outputText;
function config(url) {
  const exports = {};
  vm.runInNewContext(source, { exports, URL, process: { env: url === undefined ? {} : { CAP_SERVER_URL: url } } });
  return exports.default;
}
test("uses the approved remote shell configuration", () => {
  const result = config();
  assert.equal(result.server.url, "https://domusbase.com/login");
  assert.ok(result.server.allowNavigation.includes(new URL(result.server.url).hostname));
  assert.equal(result.server.cleartext, false);
  assert.equal(result.server.errorPath, "offline.html");
  assert.equal(result.ios.scheme, undefined);
  assert.deepEqual(Array.from(result.server.allowNavigation), [
    "domusbase.com", "checkout.stripe.com", "hooks.stripe.com", "pay.stripe.com"
  ]);
});
for (const url of ["https://domusbase.invalid", "https://domusbase.com/tenant", "http://localhost:3000", "http://127.0.0.1:3000"]) {
  test(`accepts developer URL ${url}`, () => assert.equal(config(url).server.url, url));
}
test("keeps the exact offline message and retry action", () => {
  const offline = readFileSync("www/offline.html", "utf8");
  assert.equal(readFileSync("ios/App/App/public/offline.html", "utf8"), offline);
  assert.ok(offline.includes("<h1>Can't reach Domus right now.</h1>"));
  assert.ok(offline.includes("<p>Check your connection, then try again.</p>"));
  assert.match(offline, /<a href="https:\/\/domusbase.com\/login"[^>]*>Try again<\/a>/);
});
for (const url of ["http://domusbase.com", "http://localhost.evil.com", "http:localhost", "//domusbase.com",
  "javascript:alert(1)", "ftp://example.com", "https://user:password@example.com", "https://", " https://example.com"]) {
  test(`rejects invalid developer URL ${url}`, () => assert.throws(() => config(url)));
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: ios, encoding: "utf8", timeout: 300000,
    maxBuffer: 32 * 1024 * 1024, ...options });
  return { ...result, output: `${result.stdout || ""}${result.stderr || ""}` };
}
function successful(result) {
  assert.equal(result.status, 0, `${result.error || ""}\n${result.output.slice(-6000)}`);
  return result.stdout;
}
function plist(file) {
  return JSON.parse(successful(run("plutil", ["-convert", "json", "-o", "-", file])));
}
const projectFile = "ios/App/App.xcodeproj/project.pbxproj";
function projectAtHead() {
  return JSON.parse(successful(run("plutil", ["-convert", "json", "-o", "-", "--", "-"], {
    input: successful(run("git", ["show", `HEAD:apps/ios/${projectFile}`]))
  })));
}
function configurations(project, name) {
  const target = Object.values(project.objects).find(o => o.isa === "PBXNativeTarget" && o.name === name);
  return project.objects[target.buildConfigurationList].buildConfigurations.map(id => project.objects[id]);
}
const manifestFile = "ios/App/App/PrivacyInfo.xcprivacy";
test("App Store plist has exact camera and Photos save messages", () => {
  const info = plist("ios/App/App/Info.plist");
  assert.deepEqual(info.UIRequiredDeviceCapabilities, ["arm64"]);
  assert.equal(info.ITSAppUsesNonExemptEncryption, false);
  assert.equal(info.NSCameraUsageDescription, "Take photos of repairs, receipts, and your profile.");
  assert.equal(info.NSPhotoLibraryAddUsageDescription, "Save photos from Domus to your phone.");
});
test("L7 source and generated splash config use the adaptive storyboard background", () => {
  const generated = JSON.parse(readFileSync("ios/App/App/capacitor.config.json", "utf8"));
  for (const value of [config(), generated]) {
    assert.equal(value.plugins.SplashScreen.launchShowDuration, 0);
    assert.equal(value.plugins.SplashScreen.launchAutoHide, true);
    assert.equal(Object.hasOwn(value.plugins.SplashScreen, "backgroundColor"), false);
  }
});
test("L4 checked-in signing enables ad-hoc Simulator builds and preserves device signing", () => {
  const signing = readFileSync("ios/App/Signing.xcconfig", "utf8");
  assert.match(signing, /^CODE_SIGN_IDENTITY\[sdk=iphonesimulator\*\] = -$/m);
  assert.doesNotMatch(signing, /^CODE_SIGNING_ALLOWED\[sdk=iphonesimulator\*\]/m);
  assert.match(signing, /^CODE_SIGN_IDENTITY\[sdk=iphoneos\*\] = Apple Development$/m);
  const baseline = successful(run("git", ["show", "HEAD:apps/ios/ios/App/Signing.xcconfig"]));
  const deviceSettings = value => value.split("\n").filter(line => !line.includes("[sdk=iphonesimulator*]"));
  assert.deepEqual(deviceSettings(signing), deviceSettings(baseline));
});
test("L7 native splash consumers instantiate the launch storyboard without a Splash image", () => {
  const pluginRoot = path.join(ios, "node_modules/@capacitor/splash-screen/ios");
  function swiftFiles(root) {
    return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
      const file = path.join(root, entry.name);
      return entry.isDirectory() ? swiftFiles(file) : entry.name.endsWith(".swift") ? [file] : [];
    });
  }
  const sources = [...swiftFiles(pluginRoot), path.join(ios, "ios/App/App/LaunchSplashGate.swift")];
  for (const file of sources) assert.doesNotMatch(readFileSync(file, "utf8"), /["']Splash["']/);
  const plugin = readFileSync(path.join(pluginRoot, "Sources/SplashScreenPlugin/SplashScreen.swift"), "utf8");
  assert.match(plugin, /UILaunchStoryboardName/);
  assert.match(plugin, /UIStoryboard\(name:/);
  assert.match(plugin, /instantiateInitialViewController\(\)/);
  const cover = readFileSync("ios/App/App/LaunchSplashGate.swift", "utf8");
  assert.match(cover, /UIStoryboard\(name: "LaunchScreen"/);
  assert.match(cover, /instantiateInitialViewController\(\)/);
});
test("L6b launch XCTest and shared fixture belong to the test target", () => {
  const project = plist(projectFile).objects;
  const target = Object.values(project).find(object => object.isa === "PBXNativeTarget" && object.name === "AppTests");
  for (const [file, phase] of [["LaunchScreenTests.swift", "PBXSourcesBuildPhase"],
    ["LaunchMarkFixture.json", "PBXResourcesBuildPhase"]]) {
    const buildPhase = target.buildPhases.map(id => project[id]).find(object => object.isa === phase);
    assert.ok(buildPhase, `${file}: missing ${phase}`);
    assert.ok(buildPhase.files.some(id => project[project[id].fileRef].path === file), `${file}: missing membership`);
  }
});
test("privacy manifest matches audit flags/purposes and App Resources", () => {
  successful(run("plutil", ["-lint", manifestFile]));
  const manifest = plist(manifestFile);
  assert.equal(manifest.NSPrivacyCollectedDataTypes.length, 17);
  assert.doesNotMatch(readFileSync(manifestFile, "utf8"), /NSPrivacyCollectedDataType(?:DeviceID|BrowsingHistory)/);
  const table = readFileSync("PRIVACY-AUDIT.md", "utf8")
    .split("<!-- manifest-data:start -->")[1].split("<!-- manifest-data:end -->")[0];
  const rows = table.split("\n").filter(line => line.startsWith("| NSPrivacyCollectedDataType"));
  assert.ok(rows.length > 0);
  const expected = rows.map(line => {
    const [type, linked, tracking, purposes] = line.split("|").slice(1, -1).map(s => s.trim());
    assert.match(linked, /^(true|false)$/);
    assert.equal(tracking, "false");
    return { NSPrivacyCollectedDataType: type, NSPrivacyCollectedDataTypeLinked: linked === "true",
      NSPrivacyCollectedDataTypeTracking: false, NSPrivacyCollectedDataTypePurposes: purposes.split(",") };
  });
  assert.equal(new Set(expected.map(row => row.NSPrivacyCollectedDataType)).size, rows.length);
  assert.deepEqual(manifest.NSPrivacyCollectedDataTypes, expected);
  assert.equal(manifest.NSPrivacyTracking, false);
  assert.deepEqual(manifest.NSPrivacyTrackingDomains, []);
  assert.deepEqual(manifest.NSPrivacyAccessedAPITypes, [{
    NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults", NSPrivacyAccessedAPITypeReasons: ["CA92.1"]
  }]);
  const { objects } = plist(projectFile);
  const target = Object.values(objects).find(o => o.isa === "PBXNativeTarget" && o.name === "App");
  const resources = target.buildPhases.map(id => objects[id]).find(o => o.isa === "PBXResourcesBuildPhase");
  assert.ok(resources.files.some(id => objects[objects[id].fileRef].path === "PrivacyInfo.xcprivacy"));
});
const analyticsMessage = "Re-add Device ID and Browsing History to the manifest and App Store label if analytics is turned on.";
function assertAnalyticsGuard(source) {
  const file = ts.createSourceFile("layout.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const renders = [];
  function visit(node) {
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(file) === "Analytics") {
      renders.push(ts.isJsxOpeningElement(node) ? node.parent : node);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.ok(renders.length === 1, analyticsMessage);
  const render = renders[0], branch = render.parent;
  assert.ok(ts.isConditionalExpression(branch) && branch.whenTrue === render &&
    branch.whenFalse.kind === ts.SyntaxKind.NullKeyword, analyticsMessage);
  const condition = branch.condition;
  assert.ok(ts.isBinaryExpression(condition) && condition.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
    condition.left.getText(file) === "process.env.NEXT_PUBLIC_ENABLE_ANALYTICS" &&
    ts.isStringLiteral(condition.right) && condition.right.text === "true", analyticsMessage);
}
const layoutSource = readFileSync(path.join(ios, "../web/app/layout.tsx"), "utf8");
test("analytics render requires the explicit production privacy guard", () => assertAnalyticsGuard(layoutSource));
test("analytics guard rejects an unconditional render in a copy of today's layout", () => {
  const unconditional = layoutSource.replace(
    /\{process\.env\.NEXT_PUBLIC_ENABLE_ANALYTICS === "true" \? <Analytics \/> : null\}/, "<Analytics />"
  );
  assert.notEqual(unconditional, layoutSource);
  assert.throws(() => assertAnalyticsGuard(unconditional), { message: analyticsMessage });
});
test("analytics guard rejects extra renders and weakened or inverted conditions", () => {
  for (const changed of [
    layoutSource.replace("<SonnerProvider />", "<SonnerProvider /><Analytics />"),
    layoutSource.replace('NEXT_PUBLIC_ENABLE_ANALYTICS === "true"', 'NEXT_PUBLIC_ENABLE_ANALYTICS !== "true"'),
    layoutSource.replace('NEXT_PUBLIC_ENABLE_ANALYTICS === "true"', "NEXT_PUBLIC_ENABLE_ANALYTICS")
  ]) {
    assert.notEqual(changed, layoutSource);
    assert.throws(() => assertAnalyticsGuard(changed), { message: analyticsMessage });
  }
});
test("signing is target-scoped; original test settings and versions are preserved", () => {
  const project = plist(projectFile);
  assert.deepEqual(configurations(project, "AppTests"), configurations(projectAtHead(), "AppTests"));
  for (const config of configurations(project, "App")) {
    assert.notEqual(config.buildSettings.CODE_SIGNING_ALLOWED, "NO");
    assert.equal(String(config.buildSettings.CURRENT_PROJECT_VERSION), "1");
    assert.equal(String(config.buildSettings.MARKETING_VERSION), "1.0");
    assert.equal(project.objects[config.baseConfigurationReference].path, `../${config.name.toLowerCase()}.xcconfig`);
  }
  assert.equal(readFileSync("ios/release.xcconfig", "utf8"), '#include "App/Signing.xcconfig"\n');
  assert.match(readFileSync("ios/debug.xcconfig", "utf8"), /CAPACITOR_DEBUG = true/);
  assert.match(readFileSync("ios/debug.xcconfig", "utf8"), /#include "App\/Signing.xcconfig"/);
  assert.match(readFileSync("ios/App/Signing.xcconfig", "utf8"), /#include\? "Signing.local.xcconfig"/);
});
test("tracked sources contain no assigned team; secrets and artifacts are ignored", () => {
  const files = successful(run("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "apps/ios"], { cwd: repo })).split("\0").filter(Boolean);
  for (const file of files) {
    // Only the example is permitted to assign its non-secret placeholder.
    // Deleted tracked assets stay in the index until this no-commit sprint is staged.
    if (!fs.existsSync(path.join(repo, file))) continue;
    const source = readFileSync(path.join(repo, file), "utf8");
    const assignments = [...source.matchAll(/^[ \t]*DEVELOPMENT_TEAM[ \t]*=[ \t]*([^\r\n]*)/gm)];
    for (const match of assignments) {
      const value = match[1].replace(/;.*/, "").trim();
      assert.ok(!value || (file.endsWith("Signing.local.xcconfig.example") && value === "YOUR_TEAM_ID"), file);
    }
  }
  for (const file of ["ios/App/Signing.local.xcconfig", "build-number.pending", "ios/App/build/testflight.lock",
    "sample.xcarchive", "sample.ipa", "sample.mobileprovision", "sample.p12", "sample.cer"]) {
    successful(run("git", ["check-ignore", file]));
  }
});
test("build numbers are bounded, monotonic, and reject corrupt counters/overrides", () => {
  assert.equal(nextBuild(nextBuild("1")), 3);
  assert.equal(parseLast("1\n"), 1);
  assert.equal(nextBuild(1, "42"), 42);
  assert.equal(nextBuild(999999998), 999999999);
  for (const value of ["", "abc", "0", "-1", "1000000000", "01", "1.5", "1e2"]) {
    assert.throws(() => parseLast(value));
    assert.throws(() => nextBuild(1, value));
  }
  for (const value of ["1", "2"]) assert.throws(() => nextBuild(2, value));
  assert.throws(() => nextBuild(999999999));
});

// Everything that can archive/export is exercised only in isolated fake-tool fixtures.
const teamMessage = "Add your Apple Team ID to apps/ios/ios/App/Signing.local.xcconfig (see Signing.local.xcconfig.example).";
const { fixture: uploadFixture } = require("./config-upload-fixture.cjs");
// Extend the existing fixture in-place; every executable still lives in its temporary root.
const fixture = t => {
  const f = uploadFixture(t, { run, manifestFile, ios });
  const bin = path.join(f.dir, "bin");
  let fake = readFileSync(path.join(bin, "xcodebuild"), "utf8");
  fake = fake.replace("console.log('Xcode fake')", "console.log(mode === 'old-xcode' ? 'Xcode 25.4' : 'Xcode 26.1')");
  fake = fake.replace("if (args[0] === '-version')", `
if (args.includes('SDKVersion')) { console.log(mode === 'old-sdk' ? '25.5' : '26.1'); process.exit(0); }
if (args[0] === '-version')`);
  fake = fake.replace("console.log('sync team ABCDE12345');", `
const generated = path.join(root, 'ios/App/App'); fs.mkdirSync(generated, {recursive:true});
if (process.env.CAP_SERVER_URL) process.exit(97);
fs.writeFileSync(path.join(root, 'inherited-url-removed'), 'yes');
writeConfig(path.join(generated, 'capacitor.config.json'), 'generated');
console.log('sync team ABCDE12345');`);
  fake = fake.replace("const app = path.join", "let app = path.join");
  fake = fake.replace("fs.mkdirSync(app, {recursive:true});", `
if (mode === 'renamed-app') app = app.replace('App.app', 'Domus.app');
fs.mkdirSync(app, {recursive:true});
if (mode === 'multiple-apps') fs.mkdirSync(app.replace('App.app', 'Extra.app'));
writeConfig(path.join(app, 'capacitor.config.json'), 'archived');`);
  fake = fake.replace("</string></dict></plist>", "</string><key>NSPhotoLibraryAddUsageDescription</key>" +
    "<string>Save photos from Domus to your phone.</string></dict></plist>");
  fake = fake.replace("console.log('archive team ABCDE12345');", `
if (mode === 'missing-photos') {
  const info = path.join(app, 'Info.plist');
  fs.writeFileSync(info, fs.readFileSync(info, 'utf8').replace(
    '<key>NSPhotoLibraryAddUsageDescription</key><string>Save photos from Domus to your phone.</string>', ''));
}
console.log('archive team ABCDE12345');`);
  fake += `
function writeConfig(file, stage) {
  if (mode === stage + '-missing') return;
  const url = mode === stage + '-wrong' ? 'http://localhost:3000' : 'https://domusbase.com/login';
  const value = mode === stage + '-no-url' ? {} : {server:{url}};
  fs.writeFileSync(file, mode === stage + '-malformed' ? '{bad' : JSON.stringify(value));
}
`;
  for (const name of ["xcodebuild", "npx", "git", "mv"]) fs.writeFileSync(path.join(bin, name), fake, { mode: 0o755 });
  return f;
};
for (const stage of ["generated", "archived"]) {
  for (const [problem, message] of [["wrong", /Set server.url/], ["missing", /Missing capacitor.config/],
    ["malformed", /Invalid capacitor.config/], ["no-url", /Set server.url/]]) {
    test(`${stage} ${problem} config stops before upload`, t => {
      const f = fixture(t), result = f.run([], `${stage}-${problem}`);
      assert.equal(result.status, 1, result.output);
      assert.match(result.output, message);
      assert.doesNotMatch(f.read("calls"), /"-exportArchive"/);
      if (stage === "generated") assert.doesNotMatch(f.read("calls"), /"archive"/);
    });
  }
}
for (const [mode, message] of [["old-xcode", /Xcode 26 or newer/], ["old-sdk", /iOS 26 SDK or newer/],
  ["multiple-apps", /exactly one app/], ["missing-photos", /Add the Photos save message/]]) {
  test(`${mode} stops before upload with an actionable message`, t => {
    const f = fixture(t), result = f.run([], mode);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, message);
    assert.doesNotMatch(f.read("calls"), /"-exportArchive"/);
  });
}
test("hostile inherited URL is removed; both production copies pass, including a renamed app", t => {
  const f = fixture(t), previous = process.env.CAP_SERVER_URL;
  process.env.CAP_SERVER_URL = "http://localhost:3000";
  try { successful(f.run([], "renamed-app")); }
  finally {
    if (previous === undefined) delete process.env.CAP_SERVER_URL;
    else process.env.CAP_SERVER_URL = previous;
  }
  assert.equal(f.read("inherited-url-removed"), "yes");
  for (const prefix of ["ios/App/App", "ios/App/build/testflight/Domus.xcarchive/Products/Applications/Domus.app"]) {
    assert.equal(JSON.parse(f.read(`${prefix}/capacitor.config.json`)).server.url, "https://domusbase.com/login");
  }
  assert.match(f.read("calls"), /"-exportArchive"/);
});
test("dry run prints commands, redacts team, and executes/writes nothing", t => {
  const f = fixture(t), result = f.run(["--dry-run"]);
  successful(result);
  assert.match(result.output, /xcodebuild archive/);
  assert.match(result.output, /xcodebuild -exportArchive/);
  assert.match(result.output, /CURRENT_PROJECT_VERSION=2/);
  assert.equal((result.output.match(/-allowProvisioningUpdates/g) || []).length, 2);
  assert.match(result.output, /<team>/);
  assert.doesNotMatch(result.output, /ABCDE12345/);
  assert.equal(f.read("build-number.txt"), "1\n");
  for (const file of ["calls", "ios/App/build", "build-number.pending"]) assert.equal(f.exists(file), false, file);
  assert.match(successful(f.run(["--dry-run", "--build", "7"])), /CURRENT_PROJECT_VERSION=7/);
});
for (const team of [null, "DEVELOPMENT_TEAM = invalid", "DEVELOPMENT_TEAM = ABCDE12345\nDEVELOPMENT_TEAM = ZYXWV98765"]) {
  test(`dry run rejects ${team === null ? "missing" : "malformed/duplicate"} signing config`, t => {
    const f = fixture(t);
    if (team === null) fs.unlinkSync(path.join(f.dir, "ios/App/Signing.local.xcconfig"));
    else f.write("ios/App/Signing.local.xcconfig", team);
    const result = f.run(["--dry-run"]);
    assert.equal(result.status, 1);
    assert.equal(result.stderr.trim(), teamMessage);
    assert.equal(f.exists("calls"), false);
  });
}
test("sequential fake uploads advance 1 to 2 to 3, clear stale files and redact logs", t => {
  const f = fixture(t);
  for (const next of [2, 3]) {
    fs.mkdirSync(path.join(f.dir, "ios/App/build/testflight"), { recursive: true });
    f.write("ios/App/build/testflight/stale", "old archive");
    const result = f.run();
    successful(result);
    assert.match(result.output, new RegExp(`Upload submitted for build ${next}`));
    assert.doesNotMatch(result.output, /ABCDE12345/);
    assert.equal(f.read("build-number.txt"), `${next}\n`);
    for (const file of ["build-number.pending", "ios/App/build/testflight.lock", "ios/App/build/testflight/stale"]) assert.equal(f.exists(file), false);
    assert.doesNotMatch(f.read("ios/App/build/testflight/export.log"), /ABCDE12345/);
    const options = plist(path.join(f.dir, "ios/App/build/testflight/ExportOptions.plist"));
    assert.deepEqual(options, { method: "app-store-connect", destination: "upload", signingStyle: "automatic",
      teamID: "ABCDE12345", manageAppVersionAndBuildNumber: false, uploadSymbols: true });
  }
});
for (const mode of ["failed-export", "ambiguous", "counter"]) {
  test(`${mode} keeps pending guard and blocks retry; both resolution paths work`, t => {
    const f = fixture(t), result = f.run([], mode);
    assert.equal(result.status, 1);
    assert.match(result.output, /Upload status unknown for build 2/);
    assert.equal(f.read("build-number.txt"), "1\n");
    assert.equal(f.read("build-number.pending"), "2\n");
    assert.equal(f.exists("ios/App/build/testflight.lock"), false);
    const before = f.read("calls"), blocked = f.run();
    assert.equal(blocked.status, 1);
    assert.match(blocked.output, /Build 2 may already be uploaded.*--resolve uploaded or --resolve not-uploaded/);
    assert.equal(f.read("calls"), before);
    successful(f.run(["--resolve", "not-uploaded"]));
    assert.equal(f.read("build-number.txt"), "1\n");
    assert.equal(f.exists("build-number.pending"), false);
    f.write("build-number.pending", "2\n");
    successful(f.run(["--resolve", "uploaded"]));
    assert.equal(f.read("build-number.txt"), "2\n");
    assert.equal(f.exists("build-number.pending"), false);
  });
}
test("lock refuses a second invocation without removing the first lock", t => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.dir, "ios/App/build/testflight.lock"), { recursive: true });
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.output, /Another upload is running\./);
  assert.equal(f.exists("ios/App/build/testflight.lock"), true);
  assert.equal(f.exists("calls"), false);
});
test("counter replaced by a directory cannot falsely confirm an accepted upload", t => {
  const f = fixture(t), result = f.run([], "counter-directory");
  assert.equal(result.status, 1);
  assert.match(result.output, /Upload status unknown for build 2/);
  assert.equal(f.read("build-number.pending"), "2\n");
  assert.equal(f.exists("ios/App/build/testflight.lock"), false);
  assert.doesNotMatch(result.output, /Upload submitted/);
});
for (const mode of ["sync", "archive", "missing-app", "wrong-id", "wrong-version", "missing-privacy", "no-xcode", "no-export", "dirty"]) {
  test(`${mode} stops before export and releases lock`, t => {
    const f = fixture(t), result = f.run([], mode);
    assert.equal(result.status, 1, result.output);
    assert.equal(f.read("build-number.txt"), "1\n");
    assert.equal(f.exists("build-number.pending"), false);
    assert.equal(f.exists("ios/App/build/testflight.lock"), false);
    assert.doesNotMatch(f.read("calls"), /\["xcodebuild","-exportArchive"/);
    if (mode === "dirty") successful(f.run(["--allow-dirty"], mode));
  });
}
test("script rejects bad counters and low overrides; valid override is persisted", t => {
  const f = fixture(t);
  for (const value of ["oops", "0", "-1", "1000000000", "999999999"]) {
    f.write("build-number.txt", value);
    assert.equal(f.run().status, 1);
    assert.equal(f.exists("calls"), false);
  }
  f.write("build-number.txt", "2\n");
  for (const value of ["1", "2"]) assert.equal(f.run(["--build", value]).status, 1);
  successful(f.run(["--build", "42"]));
  assert.equal(f.read("build-number.txt"), "42\n");
});

// Real Xcode checks deliberately fail (never skip) if the host cannot build/resolve packages.
const localSigning = path.join(ios, "ios/App/Signing.local.xcconfig");
function withSigning(team, callback) {
  assert.equal(fs.existsSync(localSigning), false, "Remove your local signing file before running config tests; it will never be overwritten.");
  let created = false;
  try {
    if (team) {
      fs.writeFileSync(localSigning, `DEVELOPMENT_TEAM = ${team}\n`, { flag: "wx" });
      created = true;
    }
    return callback();
  } finally {
    if (created) fs.rmSync(localSigning, { force: true });
  }
}
const xcodeBase = ["-project", "App.xcodeproj", "-scheme", "App"];
const xcodeCwd = path.join(ios, "ios/App");
test("actual script dry run leaves workspace untouched, with and without synthetic signing", t => {
  const counter = readFileSync("build-number.txt", "utf8");
  const expectedNext = nextBuild(counter);
  const state = () => ["ios/App/build/testflight", "ios/App/build/testflight.lock", "build-number.pending"]
    .map(file => fs.existsSync(file) ? fs.statSync(file).mtimeMs : null);
  const before = state();
  withSigning("", () => {
    const result = run(path.join(__dirname, "testflight.sh"), ["--dry-run"]);
    assert.equal(result.status, 1);
    assert.equal(result.stderr.trim(), teamMessage);
  });
  withSigning("ABCDE12345", () => {
    const result = run(path.join(__dirname, "testflight.sh"), ["--dry-run"]);
    successful(result);
    assert.match(result.output, new RegExp(`CURRENT_PROJECT_VERSION=${expectedNext}\\b`));
    assert.doesNotMatch(result.output, /ABCDE12345/);
    t.diagnostic(result.stdout.trim());
  });
  assert.equal(readFileSync("build-number.txt", "utf8"), counter);
  assert.deepEqual(state(), before);
  assert.equal(fs.existsSync(localSigning), false);
});
function settings(configuration, sdk, extra = []) {
  return JSON.parse(successful(run("xcodebuild", [...xcodeBase, "-configuration", configuration,
    "-sdk", sdk, "-showBuildSettings", "-json", ...extra], { cwd: xcodeCwd })));
}
for (const [configuration, sdk, team] of [["Debug", "iphonesimulator", ""], ["Release", "iphoneos", ""],
  ["Release", "iphoneos", "ABCDE12345"], ["Debug", "iphoneos", "ABCDE12345"],
  ["Debug", "iphoneos", ""], ["Release", "iphonesimulator", ""]]) {
  test(`effective ${configuration} ${sdk} ${team ? "synthetic local team" : "no local signing file"}`, t => withSigning(team, () => {
    const all = settings(configuration, sdk);
    const app = all.find(row => row.target === "App").buildSettings;
    assert.equal(app.DEVELOPMENT_TEAM || "", team);
    assert.equal(app.CODE_SIGN_STYLE, "Automatic");
    if (sdk === "iphoneos") {
      assert.equal(app.CODE_SIGN_IDENTITY, "Apple Development");
      assert.equal(app.CODE_SIGNING_ALLOWED, "YES");
    } else {
      assert.equal(app.CODE_SIGN_IDENTITY, "-");
      assert.equal(app.CODE_SIGNING_ALLOWED, "YES");
    }
    if (configuration === "Release") {
      assert.doesNotMatch(app.SWIFT_ACTIVE_COMPILATION_CONDITIONS || "", /\bDEBUG\b/);
      assert.doesNotMatch(app.OTHER_SWIFT_FLAGS || "", /-D\s*DEBUG\b/);
    }
    for (const key of ["CODE_SIGN_IDENTITY", "CODE_SIGN_STYLE", "CODE_SIGNING_ALLOWED", "DEVELOPMENT_TEAM", "SWIFT_ACTIVE_COMPILATION_CONDITIONS", "OTHER_SWIFT_FLAGS"])
      t.diagnostic(`${configuration} ${sdk}: ${key} = ${app[key] || ""}`);
  }));
}
test("distribution export retains automatic App Store signing without an identity override", () => {
  const options = plist("scripts/ExportOptions.template.plist");
  assert.equal(options.method, "app-store-connect");
  assert.equal(options.signingStyle, "automatic");
  assert.equal(options.signingCertificate, undefined);
  assert.doesNotMatch(readFileSync("scripts/testflight.sh", "utf8"), /CODE_SIGN_IDENTITY\s*=/);
});
test("effective test target settings match the pre-sprint project", () => withSigning("", () => {
  const temporary = fs.mkdtempSync(path.join(xcodeCwd, "baseline-"));
  const baselineProject = `${temporary}.xcodeproj`;
  fs.renameSync(temporary, baselineProject);
  try {
    const original = projectAtHead();
    // Same SOURCE_ROOT, but restore pre-sprint project Debug xcconfig without signing.
    const debug = path.join(baselineProject, "debug.xcconfig");
    fs.writeFileSync(debug, "CAPACITOR_DEBUG = true\n");
    for (const obj of Object.values(original.objects)) if (obj.path === "../debug.xcconfig") obj.path = debug;
    fs.writeFileSync(path.join(baselineProject, "project.pbxproj"), JSON.stringify(original));
    successful(run("plutil", ["-convert", "xml1", path.join(baselineProject, "project.pbxproj")]));
    for (const configuration of ["Debug", "Release"]) {
      const query = project => JSON.parse(successful(run("xcodebuild", ["-project", project, "-target", "AppTests",
        "-configuration", configuration, "-sdk", "iphonesimulator", "-showBuildSettings", "-json", `SRCROOT=${xcodeCwd}`], { cwd: xcodeCwd })))[0].buildSettings;
      const before = query(baselineProject), after = query("App.xcodeproj");
      for (const key of ["CODE_SIGNING_ALLOWED", "CODE_SIGN_STYLE", "DEVELOPMENT_TEAM", "SWIFT_ACTIVE_COMPILATION_CONDITIONS", "OTHER_SWIFT_FLAGS", "CAPACITOR_DEBUG", "IPHONEOS_DEPLOYMENT_TARGET", "PRODUCT_BUNDLE_IDENTIFIER"])
        assert.equal(after[key] || "", before[key] || "", `${configuration} ${key}`);
    }
  } finally { fs.rmSync(baselineProject, { recursive: true, force: true }); }
}));
for (const sdk of ["iphonesimulator", "iphoneos"]) {
  test(`Release ${sdk} built bundle contains the exact privacy manifest`, () => withSigning("", () => {
    const derived = fs.mkdtempSync(path.join(os.tmpdir(), "domus212-release-"));
    try {
      successful(run("xcodebuild", [...xcodeBase, "-configuration", "Release", "-sdk", sdk,
        "-derivedDataPath", derived, ...(sdk === "iphoneos" ? ["CODE_SIGNING_ALLOWED=NO"] : []), "build"], { cwd: xcodeCwd }));
      const bundle = path.join(derived, `Build/Products/Release-${sdk}/App.app/PrivacyInfo.xcprivacy`);
      assert.deepEqual(plist(bundle), plist(manifestFile));
    } finally { fs.rmSync(derived, { recursive: true, force: true }); }
  }));
}
