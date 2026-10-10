const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
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
  assert.ok(offline.includes("<h1>Can't reach Domus right now.</h1>"));
  assert.ok(offline.includes("<p>Check your connection, then try again.</p>"));
  assert.match(offline, /<a href="https:\/\/domusbase.com"[^>]*>Try again<\/a>/);
});
for (const url of ["http://domusbase.com", "http://localhost.evil.com", "http:localhost", "//domusbase.com",
  "javascript:alert(1)", "ftp://example.com", "https://user:password@example.com", "https://", " https://example.com"]) {
  test(`rejects invalid developer URL ${url}`, () => assert.throws(() => config(url)));
}
