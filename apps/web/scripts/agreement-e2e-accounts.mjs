// Operator-only harness. Never prints credentials; all mutations are limited to this run's manifest.
import { createHash, createHmac, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { assertProject, cleanupAccounts, creationPlan, runEmail } from "./agreement-e2e-guards.mjs";

const web = fileURLToPath(new URL("../", import.meta.url));
const envPath = `${web}.env.local`;
const manifestPath = `${web}.agreement-e2e.json`;
const envText = await readFile(envPath, "utf8").catch(() => "");
const env = { ...Object.fromEntries(envText.split(/\r?\n/).filter((line) => /^[A-Z_0-9]+=/.test(line))
  .map((line) => { const i = line.indexOf("="); return [line.slice(0, i), line.slice(i + 1).replace(/^['"]|['"]$/g, "")]; })),
...process.env };
const [command, flag, project] = process.argv.slice(2);
if (flag !== "--project" || process.argv.length !== 5) throw new Error("Use <command> --project <ref>.");
assertProject(project, env.NEXT_PUBLIC_SUPABASE_URL);
if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing service role key.");
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
function checked(result) { if (result.error) throw new Error(`Harness operation failed (${result.error.code ?? "unknown"}).`);
  return result.data; }
async function save(manifest) { await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600 }); }
const password = () => `Aa9!${randomBytes(24).toString("base64url")}`;
async function profile(id) {
  return checked(await admin.from("profiles").select("id, email, role, is_tester").eq("id", id).maybeSingle());
}
async function markTester(id) { checked(await admin.from("profiles").update({ is_tester: true }).eq("id", id)); }
async function findSignup(email) {
  for (let page = 1; ; page++) {
    const data = checked(await admin.auth.admin.listUsers({ page, perPage: 200 }));
    const found = data.users.find((user) => user.email === email);
    if (found) return found;
    if (data.users.length < 200) return null;
  }
}
if (command === "create") {
  try { await readFile(manifestPath); throw new Error("Clean up the existing manifest before creating another run."); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const runId = `${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
  const plan = creationPlan(runId);
  const manifest = { project, runId, createdAt: new Date().toISOString(), accounts: [], signup: plan.reserve };
  await save(manifest);
  const variables = {};
  for (const item of plan.create) {
    const secret = password();
    const { user } = checked(await admin.auth.admin.createUser({ email: item.email, password: secret,
      email_confirm: true, user_metadata: { role: item.role } }));
    if (!user) throw new Error("Missing created user.");
    manifest.accounts.push({ ...item, id: user.id });
    await save(manifest);
    await markTester(user.id);
    variables[`AGREEMENT_E2E_${item.label.toUpperCase()}_EMAIL`] = item.email;
    variables[`AGREEMENT_E2E_${item.label.toUpperCase()}_PASSWORD`] = secret;
  }
  variables.AGREEMENT_E2E_SIGNUP_EMAIL = plan.reserve.email;
  variables.AGREEMENT_E2E_SIGNUP_PASSWORD = password();
  const filtered = envText.split(/\r?\n/).filter((line) => !line.startsWith("AGREEMENT_E2E_"));
  await writeFile(envPath, filtered.join("\n").trimEnd() + "\n" +
    Object.entries(variables).map(([key, value]) => `${key}=${value}`).join("\n") + "\n", { mode: 0o600 });
  console.log("Created two testers and reserved the form sign-up. Credentials saved locally.");
} else {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assertProject(project, env.NEXT_PUBLIC_SUPABASE_URL, manifest);
  if (command === "confirm-signup") {
    if (manifest.signup.email !== runEmail(manifest.runId, "signup")) throw new Error("Reserved email mismatch.");
    const user = await findSignup(manifest.signup.email);
    if (!user || user.invited_at || Date.parse(user.created_at) < Date.now() - 15 * 60_000) {
      throw new Error("Fresh form registration required.");
    }
    if (!manifest.accounts.some((entry) => entry.id === user.id)) {
      manifest.accounts.push({ ...manifest.signup, id: user.id });
      await save(manifest);
    }
    await markTester(user.id);
    checked(await admin.auth.admin.updateUserById(user.id, { email_confirm: true }));
    console.log("Confirmed the form registration and marked it as a tester.");
  } else if (command === "check") {
    if (!env.LEGAL_RECORD_HMAC_KEY) throw new Error("Missing legal record key for verification.");
    const published = checked(await admin.from("legal_document_versions").select("document, version, sha256"));
    const hashes = {};
    for (const document of ["terms", "privacy"]) {
      const bytes = await readFile(`${web}legal-archive/${document}/2026-10-30.txt`);
      hashes[document] = createHash("sha256").update(bytes).digest("hex");
      if (!published.some((row) => row.document === document && row.version === "2026-10-30" &&
          row.sha256 === hashes[document])) throw new Error("Published legal hash mismatch.");
    }
    for (const account of manifest.accounts) {
      const { user } = checked(await admin.auth.admin.getUserById(account.id));
      const row = await profile(account.id);
      if (!user || user.email !== account.email || row?.role !== account.role || !row.is_tester) {
        throw new Error("Account verification failed.");
      }
      const rows = checked(await admin.from("legal_acceptances")
        .select("source, role_at_acceptance, client, email_hmac, email_hmac_key_version, terms_sha256, privacy_sha256, app_commit")
        .eq("profile_id", account.id));
      if (rows.length > 1 || (account.label === "signup" && (rows.length !== 1 || rows[0].source !== "sign_up")) ||
          (account.label === "owner" && rows.length === 1 && rows[0].source !== "agree_page") ||
          rows.some((record) => record.role_at_acceptance !== account.role || record.client !== "web" ||
            record.email_hmac_key_version !== 1 || record.terms_sha256 !== hashes.terms ||
            record.privacy_sha256 !== hashes.privacy || record.email_hmac !== createHmac("sha256", env.LEGAL_RECORD_HMAC_KEY)
              .update(user.email.trim().toLowerCase()).digest("hex"))) throw new Error("Agreement verification failed.");
      console.log(JSON.stringify({ label: account.label, role: row.role, count: rows.length,
        records: rows.map(({ email_hmac, ...record }) => record) }));
    }
  } else if (command === "cleanup") {
    const removed = await cleanupAccounts({ project, url: env.NEXT_PUBLIC_SUPABASE_URL, manifest,
      load: async (id) => {
        const result = await admin.auth.admin.getUserById(id);
        if (result.error && result.error.status !== 404 && result.error.code !== "user_not_found") checked(result);
        return { authUser: result.data.user, profile: await profile(id) };
      },
      deleteAuth: async (id) => { checked(await admin.auth.admin.deleteUser(id)); },
      deleteProfile: async (id) => { checked(await admin.from("profiles").delete().eq("id", id)); }, save
    });
    // Keep the manifest as a record and make interruption retries idempotent; create needs it archived/removed by the operator.
    console.log(`Removed ${removed.length} manifest accounts (including already completed deletions).`);
  } else throw new Error("Unknown command.");
}
