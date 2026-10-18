// Claude runs this after the owner sets both emails. Codex never runs it.
import { randomBytes } from "node:crypto";
import { lstat, readFile, open, rename, unlink, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createAdminClient, createSummary, deterministicUuid, ensureProfile, hashPassword,
  listTargetUsers, printSummary, readOnlyClient, record, SeedRefusedError } from "./lib/seed-helpers.mjs";
import { ensureAppReviewGraph } from "./lib/appreview-graph.mjs";

const MARKER = "domus-appreview-v1";
const DEFAULT_ENV_FILE = new URL("../apps/web/.env.local", import.meta.url);
const spec = (role, email) => ({ role, email, fullName: role === "owner" ? "Jordan Demo" : "Riley Demo" });
function required(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new SeedRefusedError(`${name} is required`);
  return value;
}
function validateEnv(env) {
  const owner = required(env, "APPREVIEW_OWNER_EMAIL").toLowerCase();
  const tenant = required(env, "APPREVIEW_TENANT_EMAIL").toLowerCase();
  if (owner === tenant) throw new SeedRefusedError("demo emails must differ");
  const smoke = Object.entries(env).filter(([name]) => /^SMOKE_[A-Z0-9_]*EMAIL$/.test(name))
    .map(([, value]) => String(value ?? "").trim().toLowerCase());
  for (const email of [owner, tenant]) {
    if (!email.includes("appreview")) throw new SeedRefusedError("demo email must include appreview");
    if (smoke.includes(email)) throw new SeedRefusedError("demo email matches a smoke account");
  }
  required(env, "NEXT_PUBLIC_SUPABASE_URL");
  required(env, "SUPABASE_SERVICE_ROLE_KEY");
  return { owner: spec("owner", owner), tenant: spec("tenant", tenant) };
}
async function queryRows(admin, table, key, value) {
  const { data, error } = await admin.from(table).select("*").eq(key, value);
  if (error) throw new Error(`Failed to check ${table}: ${error.message}`);
  return data ?? [];
}
function accessIds(rows) { return rows.map((row) => row.id ?? `${row.account_id ?? row.property_id}:${row.profile_id ?? ""}`); }
async function checkAccess(admin, user, role, newlyCreated = false) {
  const [memberships, managers, leases, invitations] = await Promise.all([
    queryRows(admin, "ownership_account_members", "profile_id", user.id),
    queryRows(admin, "property_managers", "manager_profile_id", user.id),
    queryRows(admin, "leases", "tenant_profile_id", user.id),
    queryRows(admin, "invitations", "invited_profile_id", user.id)
  ]);
  const expectedAccount = deterministicUuid("appreview-account");
  const expectedLease = deterministicUuid("appreview-lease");
  const expectedUnit = deterministicUuid("appreview-unit");
  const foreign = newlyCreated ||
    memberships.some((row) => role !== "owner" || row.account_id !== expectedAccount || row.profile_id !== user.id) ||
    managers.length > 0 ||
    leases.some((row) => role !== "tenant" || row.id !== expectedLease || row.unit_id !== expectedUnit);
  if (foreign && [...memberships, ...managers, ...leases, ...invitations].length) {
    const ids = [...accessIds(memberships), ...accessIds(managers), ...accessIds(leases), ...accessIds(invitations)];
    throw new SeedRefusedError(`unexpected access for ${role}; auth id ${user.id}; row ids ${ids.join(", ")}`);
  }
  if (invitations.length) {
    throw new SeedRefusedError(`unexpected access for ${role}; auth id ${user.id}; invitation ids ${accessIds(invitations)}`);
  }
}
async function preflight(admin, specs) {
  const usersByEmail = await listTargetUsers(admin, specs.map((item) => item.email));
  for (const item of specs) {
    const user = usersByEmail.get(item.email);
    if (user && (user.app_metadata?.appreview_seed !== MARKER || user.app_metadata?.appreview_role !== item.role)) {
      throw new SeedRefusedError(`auth user is not a marked ${item.role}; auth id ${user.id}`);
    }
  }
  const { data: pending, error } = await admin.from("invitations").select("id, email").eq("status", "pending");
  if (error) throw new Error(`Failed to inspect invitations: ${error.message}`);
  const matches = (pending ?? []).filter((row) => specs.some((item) => row.email?.trim().toLowerCase() === item.email));
  if (matches.length) throw new SeedRefusedError(`pending invitations: ${matches.map((row) => row.id).join(", ")}`);
  for (const item of specs) {
    const user = usersByEmail.get(item.email);
    if (user) await checkAccess(admin, user, item.role);
  }
  return usersByEmail;
}
async function loadPasswordFile(path) {
  try {
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) throw new SeedRefusedError("env file is a symlink");
    if (!stat.isFile()) throw new SeedRefusedError("env path is not a file");
    if (stat.mode & 0o077) throw new SeedRefusedError("run chmod 600 on the env file");
    return await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}
function fileValues(contents) {
  const values = new Map();
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) values.set(match[1], match[2]);
  }
  return values;
}
async function savePasswordFile(path, original, additions, fsOps = {}) {
  if (!additions.length) return;
  const append = additions.map(([name, value]) => `${name}=${value}\n`).join("");
  const text = original + (original && !original.endsWith("\n") ? "\n" : "") + append;
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.appreview-${randomBytes(8).toString("hex")}.tmp`;
  let handle;
  try {
    handle = await open(temp, "wx", 0o600);
    await handle.writeFile(text);
    await handle.sync();
    await handle.close();
    handle = null;
    await (fsOps.rename ?? rename)(temp, path);
  } catch (error) {
    if (handle) await handle.close();
    await unlink(temp).catch(() => {});
    throw error;
  }
}
async function passwordsFor(specs, env, path, dryRun, fsOps) {
  if (dryRun) return Object.fromEntries(specs.map((item) => [item.role, { value: null, written: false }]));
  const contents = await loadPasswordFile(path);
  const stored = fileValues(contents);
  const additions = [];
  const result = {};
  for (const item of specs) {
    const key = `APPREVIEW_${item.role.toUpperCase()}_PASSWORD`;
    const envValue = typeof env[key] === "string" && env[key].trim() ? env[key] : null;
    const fileValue = stored.get(key);
    if (envValue) result[item.role] = { value: envValue, written: false };
    else if (fileValue) result[item.role] = { value: fileValue, written: false };
    else if (stored.has(key)) throw new SeedRefusedError(`${key} is blank in env file`);
    else {
      const value = `${randomBytes(24).toString("base64url")}-Aa1`;
      additions.push([key, value]);
      result[item.role] = { value, written: true };
    }
  }
  await savePasswordFile(path, contents, additions, fsOps);
  return result;
}
async function ensureUser(admin, item, user, password, summary, dryRun) {
  if (dryRun) {
    record(summary, user ? "existing" : "would-create", `${item.role} auth user`);
    return user ?? { id: deterministicUuid(`appreview-dryrun-${item.role}`), email: item.email };
  }
  const appMetadata = { appreview_seed: MARKER, appreview_role: item.role,
    appreview_password_hash: hashPassword(password) };
  const userMetadata = { full_name: item.fullName, role: item.role };
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({ email: item.email, password,
      email_confirm: true, user_metadata: userMetadata, app_metadata: appMetadata });
    if (error || !data?.user) throw new Error(`Failed to create ${item.role} auth user${error ? `: ${error.message}` : ""}`);
    await checkAccess(admin, data.user, item.role, true);
    record(summary, "created", `${item.role} auth user`);
    return data.user;
  }
  const changed = user.app_metadata?.appreview_password_hash !== appMetadata.appreview_password_hash ||
    user.user_metadata?.full_name !== item.fullName || user.user_metadata?.role !== item.role;
  if (!changed) {
    record(summary, "existing", `${item.role} auth user`);
    return user;
  }
  const { data, error } = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true,
    user_metadata: userMetadata, app_metadata: appMetadata });
  if (error || !data?.user) throw new Error(`Failed to update ${item.role} auth user${error ? `: ${error.message}` : ""}`);
  record(summary, "updated", `${item.role} auth user`);
  return data.user;
}
async function ensureDemoProfile(admin, user, item, summary, dryRun) {
  if (dryRun) {
    const { data, error } = await admin.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (error) throw new Error(`Failed to read ${item.role} profile: ${error.message}`);
    record(summary, data ? "existing" : "would-create", `${item.role} profile`);
    return;
  }
  await ensureProfile(admin, user, item, summary);
}
export async function runAppReviewSeed({ admin, env = {}, now = new Date(), dryRun = false,
  envFile = DEFAULT_ENV_FILE, fsOps } = {}) {
  const entries = validateEnv(env);
  const specs = [entries.owner, entries.tenant];
  const client = dryRun ? readOnlyClient(admin) : admin;
  const usersByEmail = await preflight(client, specs);
  const path = envFile instanceof URL ? fileURLToPath(envFile) : String(envFile);
  const passwords = await passwordsFor(specs, env, path, dryRun, fsOps);
  const summary = { ...createSummary(), "would-create": [], "would-update": [], "would-delete": [] };
  const users = {};
  for (const item of specs) {
    users[item.role] = await ensureUser(client, item, usersByEmail.get(item.email),
      passwords[item.role].value, summary, dryRun);
  }
  for (const item of specs) {
    await ensureDemoProfile(client, users[item.role], item, summary, dryRun);
    if (!dryRun) console.log(`[appreview-seed] ${item.role} password: ${passwords[item.role].written
      ? "saved to apps/web/.env.local (not shown)" : "configured (not shown)"}`);
  }
  await ensureAppReviewGraph({ admin: client, owner: users.owner, tenant: users.tenant,
    now: new Date(now), summary, dryRun });
  for (const status of ["created", "updated", "existing", "would-create", "would-update", "would-delete"]) {
    if (summary[status].length) console.log(`[appreview-seed] ${status}: ${summary[status].join(", ")}`);
  }
  console.log("[appreview-seed] complete");
  return summary;
}
async function main() {
  const env = process.env;
  validateEnv(env);
  const admin = createAdminClient({ supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY });
  await runAppReviewSeed({ admin, env, dryRun: process.argv.includes("--dry-run") });
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    if (error instanceof SeedRefusedError) console.error(`[appreview-seed] refused: ${error.message}`);
    else console.error(`[appreview-seed] failed: ${error.message}`);
    process.exitCode = 1;
  });
}
