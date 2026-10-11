const fs = require("node:fs");
const { readFileSync } = fs;
const path = require("node:path");
const os = require("node:os");

function fixture(t, { run, manifestFile, ios }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "domus212-upload-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const sub of ["scripts", "ios/App", "bin"]) fs.mkdirSync(path.join(dir, sub), { recursive: true });
  for (const file of ["testflight.sh", "build-number.cjs", "ExportOptions.template.plist"]) {
    fs.copyFileSync(path.join(__dirname, file), path.join(dir, "scripts", file));
  }
  fs.writeFileSync(path.join(dir, "build-number.txt"), "1\n");
  fs.writeFileSync(path.join(dir, "ios/App/Signing.local.xcconfig"), "DEVELOPMENT_TEAM = ABCDE12345\n");
  const fake = `#!${process.execPath}
const fs = require('node:fs'), path = require('node:path');
const args = process.argv.slice(2), name = path.basename(process.argv[1]);
const root = process.env.FAKE_ROOT, mode = process.env.FAKE_MODE;
fs.appendFileSync(path.join(root, 'calls'), JSON.stringify([name, ...args]) + '\\n');
if (name === 'git') { if (mode === 'dirty') console.log(' M README.md'); process.exit(0); }
if (name === 'mv') {
  if (mode === 'counter' && args.at(-1).endsWith('/build-number.txt')) process.exit(1);
  const r = require('node:child_process').spawnSync('/bin/mv', args, {stdio:'inherit'}); process.exit(r.status);
}
if (name === 'npx') { console.log('sync team ABCDE12345'); process.exit(mode === 'sync' ? 1 : 0); }
if (args[0] === '-version') { console.log('Xcode fake'); process.exit(mode === 'no-xcode' ? 1 : 0); }
if (args[0] === '-help') { console.log(mode === 'no-export' ? 'unsupported' : '-exportArchive'); process.exit(0); }
if (args[0] === 'archive') {
  if (mode === 'archive') process.exit(1);
  const app = path.join(args[args.indexOf('-archivePath') + 1], 'Products/Applications/App.app');
  if (mode === 'missing-app') process.exit(0);
  fs.mkdirSync(app, {recursive:true});
  const version = mode === 'wrong-version' ? '999' : args.find(a => a.startsWith('CURRENT_PROJECT_VERSION=')).split('=')[1];
  const id = mode === 'wrong-id' ? 'invalid.bundle' : 'com.domusbase.app';
  fs.writeFileSync(path.join(app, 'Info.plist'), '<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>' + id + '</string><key>CFBundleVersion</key><string>' + version + '</string></dict></plist>');
  if (mode !== 'missing-privacy') fs.copyFileSync(process.env.FAKE_MANIFEST, path.join(app, 'PrivacyInfo.xcprivacy'));
  console.log('archive team ABCDE12345'); process.exit(0);
}
if (args[0] === '-exportArchive') {
  if (!fs.existsSync(path.join(root, 'build-number.pending'))) process.exit(99);
  if (mode === 'counter-directory') {
    fs.unlinkSync(path.join(root, 'build-number.txt'));
    fs.mkdirSync(path.join(root, 'build-number.txt'));
  }
  console.log('export team ABCDE12345');
  if (mode === 'failed-export') { console.log('** EXPORT SUCCEEDED **'); process.exit(1); }
  if (mode !== 'ambiguous') console.log('** EXPORT SUCCEEDED **');
  process.exit(0);
}
process.exit(98);
`;
  for (const name of ["xcodebuild", "npx", "git", "mv"]) fs.writeFileSync(path.join(dir, "bin", name), fake, { mode: 0o755 });
  return { dir, read: file => readFileSync(path.join(dir, file), "utf8"),
    exists: file => fs.existsSync(path.join(dir, file)),
    write: (file, text) => fs.writeFileSync(path.join(dir, file), text),
    run: (args = [], mode = "success") => run("bash", [path.join(dir, "scripts/testflight.sh"), ...args], {
      cwd: os.tmpdir(), env: { ...process.env, PATH: `${dir}/bin:${process.env.PATH}`,
        FAKE_ROOT: dir, FAKE_MODE: mode, FAKE_MANIFEST: path.join(ios, manifestFile) }
    }) };
}

module.exports = { fixture };
