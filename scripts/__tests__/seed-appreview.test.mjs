import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, chmod, symlink, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAppReviewSeed } from "../seed-appreview-accounts.mjs";
import { createFakeAdmin } from "./helpers/fake-admin.mjs";
import { deterministicUuid } from "../lib/seed-helpers.mjs";
import { demoPng } from "../lib/demo-png.mjs";

const NOW = new Date("2026-10-18T12:00:00.000Z");
const ENV = { APPREVIEW_OWNER_EMAIL: "owner-appreview@example.invalid",
  APPREVIEW_TENANT_EMAIL: "tenant-appreview@example.invalid", NEXT_PUBLIC_SUPABASE_URL: "https://example.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "fake-service-key" };
async function setup(options = {}) {
  const folder = await mkdtemp(join(tmpdir(), "domus-appreview-test-"));
  return { fake: createFakeAdmin(options), envFile: join(folder, ".env.local"), lines: [], warnings: [] };
}
async function run(ctx, extra = {}) {
  const oldLog = console.log;
  const oldWarn = console.warn;
  console.log = (...parts) => ctx.lines.push(parts.join(" "));
  console.warn = (...parts) => ctx.warnings.push(parts.join(" "));
  try {
    return await runAppReviewSeed({ admin: ctx.fake.admin, env: ENV, envFile: ctx.envFile, now: NOW, ...extra });
  } finally { console.log = oldLog; console.warn = oldWarn; }
}
const writes = (ctx) => ctx.fake.calls.filter((call) => ["write", "auth-write", "storage-write"].includes(call.kind));

test("creates every App Review promise", async () => {
  const ctx = await setup();
  await run(ctx);
  const paid = ctx.fake.tables.rent_charges.find((row) => row.status === "paid");
  assert.ok(paid);
  assert.ok(ctx.fake.tables.payments.some((row) => row.rent_charge_id === paid.id && row.reversed_at == null));
  assert.equal(ctx.fake.tables.bank_review_items.length, 3);
  assert.ok(ctx.fake.tables.bank_review_items.every((row) => /^[0-9a-f]{64}$/.test(row.fingerprint)));
  const rent = ctx.fake.tables.bank_review_items.find((row) => row.direction === "in");
  const current = ctx.fake.tables.rent_charges.find((row) => row.due_date === "2026-10-01");
  assert.equal(rent.amount_cents, current.amount_cents);
  assert.equal(rent.suggestion.rentChargeId, current.id);
  assert.equal(ctx.fake.tables.maintenance_tickets.length, 1);
  assert.equal(ctx.fake.tables.maintenance_tickets[0].status, "open");
  assert.equal(ctx.fake.tables.maintenance_photos.length, 1);
  const photo = ctx.fake.tables.maintenance_photos[0];
  const bytes = ctx.fake.objects.get(photo.storage_path);
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(bytes.readUInt32BE(16), 480);
  assert.equal(bytes.readUInt32BE(20), 360);
  assert.ok(bytes.length < 50000);
  assert.equal(photo.file_type, "image/png");
  assert.ok(photo.file_name.endsWith(".png"));
  assert.equal(photo.file_size_bytes, bytes.length);
  assert.equal(ctx.fake.calls.find((call) => call.kind === "storage-write").contentType, "image/png");
  assert.deepEqual(demoPng(), demoPng());
  const titleSource = await readFile(new URL("../../apps/web/lib/inbox/thread-title.ts", import.meta.url), "utf8");
  assert.ok(titleSource.includes(ctx.fake.tables.inbox_threads[0].subject));
  assert.equal(ctx.fake.tables.inbox_messages.length, 2);
  assert.equal(ctx.fake.tables.inbox_messages[0].sender_email, null);
  assert.equal(ctx.fake.tables.inbox_messages[1].sender_email, ENV.APPREVIEW_OWNER_EMAIL);
  assert.deepEqual(ctx.fake.tables.inbox_messages.map((row) => [row.direction, row.channel]),
    [["inbound", "in_app"], ["outbound", "in_app"]]);
  assert.equal(ctx.fake.tables.property_expenses.length, 2);
  assert.ok(!writes(ctx).some((call) => call.table === "bank_connections"));
  assert.ok(!writes(ctx).some((call) =>
    ["profiles", "ownership_accounts"].includes(call.table) &&
    ("stripe_account_id" in (call.payload ?? {}) || "stripe_onboarding_complete" in (call.payload ?? {}))));
});

test("refuses unsafe emails before any call", async () => {
  const absent = await setup();
  await assert.rejects(run(absent, { env: undefined }), /APPREVIEW_OWNER_EMAIL is required/);
  assert.equal(absent.fake.calls.length, 0);
  const cases = [
    { APPREVIEW_OWNER_EMAIL: "" }, { APPREVIEW_TENANT_EMAIL: " " },
    { APPREVIEW_TENANT_EMAIL: ENV.APPREVIEW_OWNER_EMAIL.toUpperCase() },
    { APPREVIEW_OWNER_EMAIL: "owner@example.invalid" },
    { SMOKE_TENANT2_EMAIL: ENV.APPREVIEW_TENANT_EMAIL.toUpperCase() },
    { NEXT_PUBLIC_SUPABASE_URL: "" }, { SUPABASE_SERVICE_ROLE_KEY: "" }
  ];
  for (const change of cases) {
    const ctx = await setup();
    await assert.rejects(run(ctx, { env: { ...ENV, ...change } }), /required|differ|include appreview|smoke account/);
    assert.equal(ctx.fake.calls.length, 0);
  }
});

test("refuses a non-demo auth user or a pending invitation", async () => {
  const user = { id: "foreign-id", email: ENV.APPREVIEW_OWNER_EMAIL, app_metadata: {}, user_metadata: {} };
  const ctx = await setup({ users: [user] });
  await assert.rejects(run(ctx), /not a marked owner/);
  assert.equal(writes(ctx).length, 0);
  const invite = await setup({ tables: { invitations: [{ id: "invite-1", email: ENV.APPREVIEW_TENANT_EMAIL,
    status: "pending" }] } });
  await assert.rejects(run(invite), /pending invitations/);
  assert.equal(writes(invite).length, 0);
});

test("forged user_metadata is refused", async () => {
  const ctx = await setup({ users: [{ id: "forged-id", email: ENV.APPREVIEW_OWNER_EMAIL,
    user_metadata: { appreview_seed: "domus-appreview-v1", appreview_role: "owner" }, app_metadata: {} }] });
  await assert.rejects(run(ctx), /not a marked owner/);
  assert.equal(writes(ctx).length, 0);
});

test("smoke ids never collide with App Review writes", async () => {
  const a = await setup();
  const b = await setup();
  await run(a);
  await run(b);
  for (const table of ["ownership_accounts", "properties", "units", "leases", "rent_charges", "payments",
    "bank_accounts", "bank_review_items", "inbox_threads", "maintenance_tickets"]) {
    assert.deepEqual(a.fake.tables[table].map((row) => row.id), b.fake.tables[table].map((row) => row.id));
  }
  const appIds = new Set(writes(a).flatMap((call) => [call.id, call.payload?.id, call.payload?.user?.id])
    .filter(Boolean).concat(Object.values(a.fake.tables).flatMap((rows) => rows.map((row) => row.id))));
  for (const label of ["smoke-owner-account", "smoke-property", "smoke-unit", "smoke-lease"]) {
    assert.ok(!appIds.has(deterministicUuid(label)), label);
  }
});

test("dry run works with no demo users", async () => {
  const ctx = await setup();
  await writeFile(ctx.envFile, "SAMPLE=value\n", { mode: 0o600 });
  const before = await readFile(ctx.envFile);
  const summary = await run(ctx, { dryRun: true });
  assert.equal(writes(ctx).length, 0);
  assert.deepEqual(await readFile(ctx.envFile), before);
  assert.ok(ctx.lines.some((line) => line.includes("would-create")));
  for (const role of ["owner", "tenant"]) {
    assert.ok(summary["would-create"].includes(`${role} auth user`));
    assert.ok(summary["would-create"].includes(`${role} profile`));
  }
});

test("second run is a no-op", async () => {
  const ctx = await setup();
  await run(ctx);
  const before = writes(ctx).length;
  ctx.lines.length = 0;
  await run(ctx);
  assert.equal(writes(ctx).length, before);
  assert.ok(ctx.lines.some((line) => line.includes("existing:")));
  assert.ok(!ctx.lines.some((line) => line.includes("created:") || line.includes("updated:")));
});

test("old rent item is removed on month rollover", async () => {
  const ctx = await setup();
  await run(ctx);
  const old = ctx.fake.tables.rent_charges.find((row) => row.due_date === "2026-10-01");
  const before = ctx.fake.tables.property_expenses.length;
  await run(ctx, { now: new Date("2026-11-10T12:00:00.000Z") });
  assert.equal(old.status, "paid");
  assert.equal(ctx.fake.tables.payments.filter((row) => row.rent_charge_id === old.id).length, 1);
  assert.equal(ctx.fake.tables.property_expenses.length, before + 2);
  assert.equal(ctx.fake.tables.bank_review_items.filter((row) => row.posted_on === "2026-11-01").length, 3);
  assert.ok(!ctx.fake.tables.bank_review_items.some((row) => row.id ===
    deterministicUuid("appreview-bank-item-2026-10-rent")));
  for (const slug of ["plumber", "water"]) {
    assert.ok(ctx.fake.tables.bank_review_items.some((row) => row.id ===
      deterministicUuid(`appreview-bank-item-2026-10-${slug}`)));
  }
  const beforeRepeat = writes(ctx).length;
  await run(ctx, { now: new Date("2026-11-10T12:00:00.000Z") });
  assert.equal(writes(ctx).length, beforeRepeat);
});

test("adopts a cron-made charge", async () => {
  const cronId = deterministicUuid("cron-random");
  const ctx = await setup({ tables: { rent_charges: [{ id: cronId, lease_id: deterministicUuid("appreview-lease"),
    due_date: "2026-09-01", category: "rent", deleted_at: null, amount_cents: 400, status: "late" }] } });
  await run(ctx);
  assert.equal(ctx.fake.tables.rent_charges.find((row) => row.id === cronId).status, "paid");
  assert.equal(ctx.fake.tables.rent_charges.filter((row) => row.due_date === "2026-09-01").length, 1);
});

test("all demo rent is below the online minimum", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../../apps/web/lib/payment-fees.ts", import.meta.url), "utf8");
  const minimum = Number(source.match(/MIN_ONLINE_PAYMENT_CENTS\s*=\s*(\d+)/)?.[1]);
  assert.ok(minimum > 400);
  const ctx = await setup();
  await run(ctx);
  for (const table of ["units", "leases", "rent_charges", "payments"]) {
    for (const row of ctx.fake.tables[table]) assert.ok((row.monthly_rent_cents ?? row.amount_cents) < minimum);
  }
  assert.ok(ctx.fake.tables.bank_review_items.find((row) => row.direction === "in").amount_cents < minimum);
});

test("passwords are saved once and never printed", async () => {
  const ctx = await setup();
  await run(ctx);
  const first = await readFile(ctx.envFile, "utf8");
  assert.equal((first.match(/APPREVIEW_OWNER_PASSWORD=/g) ?? []).length, 1);
  assert.equal((first.match(/APPREVIEW_TENANT_PASSWORD=/g) ?? []).length, 1);
  const passwords = first.split("\n").filter((line) => line.includes("_PASSWORD=")).map((line) => line.split("=")[1]);
  await run(ctx);
  assert.equal(await readFile(ctx.envFile, "utf8"), first);
  for (const password of passwords) assert.ok(!ctx.lines.join("\n").includes(password));
  const existing = await setup();
  await writeFile(existing.envFile, "APPREVIEW_OWNER_PASSWORD=keep-me\n", { mode: 0o600 });
  await run(existing);
  const saved = await readFile(existing.envFile, "utf8");
  assert.ok(saved.startsWith("APPREVIEW_OWNER_PASSWORD=keep-me\n"));
  assert.equal((saved.match(/APPREVIEW_OWNER_PASSWORD=/g) ?? []).length, 1);
  assert.ok(!existing.lines.join("\n").includes("keep-me"));
});

test("no notifications and no RPC", async () => {
  const ctx = await setup();
  await run(ctx);
  assert.ok(!ctx.fake.calls.some((call) => call.kind === "rpc"));
  assert.ok(!writes(ctx).some((call) => ["notifications", "notification_deliveries", "message_deliveries",
    "communication_logs", "audit_logs", "bank_connections"].includes(call.table)));
  const source = await readFile(new URL("../lib/appreview-graph.mjs", import.meta.url), "utf8");
  assert.ok(!source.includes("apps/"));
});

test("warns but never writes Stripe", async () => {
  const ctx = await setup();
  await run(ctx);
  const owner = ctx.fake.tables.profiles.find((row) => row.role === "owner");
  owner.stripe_account_id = "acct_demo";
  const before = writes(ctx).length;
  await run(ctx);
  assert.ok(ctx.warnings.some((line) => line.includes("Stripe")));
  assert.equal(writes(ctx).length, before);
});

test("post-create access aborts", async () => {
  const ctx = await setup({ onCreateUser({ user, tables }) {
    tables.ownership_account_members.push({ id: "injected-membership", account_id: "foreign", profile_id: user.id });
  } });
  await assert.rejects(run(ctx), /unexpected access for owner/);
  const afterCreate = writes(ctx).slice(writes(ctx).findIndex((call) => call.op === "createUser") + 1);
  assert.equal(afterCreate.length, 0);
});

test("tenant post-create access aborts before profile writes", async () => {
  const ctx = await setup({ onCreateUser({ user, tables }) {
    if (user.user_metadata.role === "tenant") {
      tables.leases.push({ id: "injected-lease", unit_id: "foreign", tenant_profile_id: user.id });
    }
  } });
  await assert.rejects(run(ctx), /unexpected access for tenant/);
  const tenantCreate = writes(ctx).findIndex((call) => call.op === "createUser" &&
    call.payload.user_metadata.role === "tenant");
  assert.equal(writes(ctx).slice(tenantCreate + 1).length, 0);
});

test("JSONB suggestion order does not cause an update", async () => {
  const ctx = await setup();
  await run(ctx);
  for (const item of ctx.fake.tables.bank_review_items) {
    item.suggestion = Object.fromEntries(Object.entries(item.suggestion).reverse());
  }
  const before = writes(ctx).length;
  await run(ctx);
  assert.equal(writes(ctx).length, before);
});

test("foreign row at a demo id is refused", async () => {
  const cases = [
    ["ownership_accounts", "created_by_profile_id"], ["properties", "owner_account_id"],
    ["units", "property_id"], ["leases", "unit_id"], ["rent_charges", "lease_id"],
    ["payments", "rent_charge_id"], ["property_expenses", "property_id"],
    ["bank_accounts", "owner_account_id"], ["bank_review_items", "bank_account_id"],
    ["inbox_threads", "property_id"], ["inbox_messages", "thread_id"],
    ["maintenance_tickets", "unit_id"], ["maintenance_photos", "ticket_id"]
  ];
  for (const [table, parent] of cases) {
    const ctx = await setup();
    await run(ctx);
    const row = ctx.fake.tables[table][0];
    const previous = row[parent];
    row[parent] = "foreign-parent";
    const before = writes(ctx).length;
    await assert.rejects(run(ctx), /foreign|unexpected access/);
    assert.equal(row[parent], "foreign-parent");
    assert.equal(writes(ctx).length, before, `${table} must not be updated`);
    row[parent] = previous;
  }
});

test("cron M0 adopted unchanged", async () => {
  for (const status of ["pending", "late"]) {
    const ctx = await setup({ tables: { rent_charges: [{ id: `cron-${status}`,
      lease_id: deterministicUuid("appreview-lease"), due_date: "2026-10-01", category: "rent",
      deleted_at: null, amount_cents: 400, status }] } });
    await run(ctx);
    assert.equal(ctx.fake.tables.rent_charges.find((row) => row.due_date === "2026-10-01").id, `cron-${status}`);
    assert.equal(ctx.fake.tables.rent_charges.filter((row) => row.due_date === "2026-10-01").length, 1);
    const adopted = ctx.fake.tables.rent_charges.find((row) => row.due_date === "2026-10-01");
    assert.equal(adopted.status, status);
    assert.equal(adopted.amount_cents, 400);
  }
});

test("cron M0+1 untouched, then adopted", async () => {
  const next = { id: "cron-next", lease_id: deterministicUuid("appreview-lease"),
    due_date: "2026-11-01", category: "rent", deleted_at: null, amount_cents: 400, status: "pending" };
  const ctx = await setup({ tables: { rent_charges: [next] } });
  await run(ctx);
  assert.deepEqual(ctx.fake.tables.rent_charges.find((row) => row.id === "cron-next"), next);
  await run(ctx, { now: new Date("2026-11-02T12:00:00.000Z") });
  assert.equal(ctx.fake.tables.rent_charges.filter((row) => row.due_date === "2026-11-01").length, 1);
  assert.equal(ctx.fake.tables.rent_charges.find((row) => row.due_date === "2026-11-01").id, "cron-next");
});

test("conflicting payment refuses before writing", async () => {
  const ctx = await setup();
  await run(ctx);
  ctx.fake.tables.payments.push({ id: deterministicUuid("conflict"),
    rent_charge_id: deterministicUuid("appreview-charge-2026-08"),
    amount_cents: 300, recorded_via: "manual", reversed_at: null });
  const before = writes(ctx).length;
  await assert.rejects(run(ctx), /conflicting payment/);
  assert.equal(writes(ctx).length, before);
  assert.equal(ctx.fake.tables.payments.filter((row) => row.rent_charge_id ===
    deterministicUuid("appreview-charge-2026-08")).length, 2);
});

test("env password status is truthful", async () => {
  const ctx = await setup();
  await writeFile(ctx.envFile, "UNCHANGED=yes\n", { mode: 0o600 });
  const original = await readFile(ctx.envFile);
  await run(ctx, { env: { ...ENV, APPREVIEW_OWNER_PASSWORD: " owner-test-secret ",
    APPREVIEW_TENANT_PASSWORD: "tenant-test-secret" } });
  assert.deepEqual(await readFile(ctx.envFile), original);
  assert.ok(ctx.lines.some((line) => line.includes("owner password: configured (not shown)")));
  assert.ok(!ctx.lines.join("\n").includes("owner-test-secret"));
  assert.equal(writes(ctx).find((call) => call.op === "createUser")?.payload.password, " owner-test-secret ");
});

test("strict fake catches mistakes", async () => {
  const fail = { kind: "write", table: "properties" };
  const ctx = await setup({ fail });
  await assert.rejects(run(ctx), /injected error/);
  assert.ok(!writes(ctx).some((call) => call.table === "units"));
  assert.throws(() => ctx.fake.admin.from("unknown_table"), /unknown table/);
  assert.throws(() => ctx.fake.admin.auth.admin.inviteUserByEmail("x"), /forbidden auth method/);
  assert.throws(() => ctx.fake.admin.rpc("anything"), /rpc forbidden/);
});

test("existing demo user with foreign access", async () => {
  const user = { id: deterministicUuid("existing-owner"), email: ENV.APPREVIEW_OWNER_EMAIL,
    app_metadata: { appreview_seed: "domus-appreview-v1", appreview_role: "owner",
      appreview_password_hash: "old-hash" }, user_metadata: { full_name: "Jordan Demo", role: "owner" } };
  const ctx = await setup({ users: [user], tables: { ownership_account_members: [{ id: deterministicUuid("foreign-membership"),
    account_id: deterministicUuid("other-account"), profile_id: user.id }] } });
  await assert.rejects(run(ctx), /unexpected access for owner/);
  assert.equal(writes(ctx).length, 0);
  await assert.rejects(readFile(ctx.envFile), /ENOENT/);
});

test("waived month stays waived", async () => {
  const waivedId = deterministicUuid("waived-id");
  const charge = { id: waivedId, lease_id: deterministicUuid("appreview-lease"), due_date: "2026-08-01",
    category: "rent", deleted_at: null, amount_cents: 400, status: "waived" };
  const ctx = await setup({ tables: { rent_charges: [charge] } });
  await run(ctx);
  assert.equal(ctx.fake.tables.rent_charges.find((row) => row.id === waivedId).status, "waived");
  assert.ok(!ctx.fake.tables.payments.some((row) => row.rent_charge_id === waivedId));
  const bad = await setup({ tables: { rent_charges: [charge], payments: [{ id: deterministicUuid("wrong-payment"),
    rent_charge_id: waivedId, amount_cents: 400, reversed_at: null, recorded_via: "manual" }] } });
  await assert.rejects(run(bad), /waived charge has payment/);
});

test("password file safety", async () => {
  const symlinkCtx = await setup();
  const target = join(symlinkCtx.envFile, "..");
  await symlink(target, symlinkCtx.envFile);
  await assert.rejects(run(symlinkCtx), /symlink/);
  const modeCtx = await setup();
  await writeFile(modeCtx.envFile, "SAMPLE=yes\n", { mode: 0o644 });
  await chmod(modeCtx.envFile, 0o644);
  await assert.rejects(run(modeCtx), /chmod 600/);
  const refused = await setup();
  await writeFile(refused.envFile, "SAMPLE=yes\n", { mode: 0o600 });
  const original = await readFile(refused.envFile);
  await assert.rejects(run(refused, { env: { ...ENV, APPREVIEW_OWNER_EMAIL: "unsafe@example.invalid" } }),
    /include appreview/);
  assert.deepEqual(await readFile(refused.envFile), original);
  const interrupted = await setup();
  await writeFile(interrupted.envFile, "SAMPLE=yes\n", { mode: 0o600 });
  const bytes = await readFile(interrupted.envFile);
  await assert.rejects(run(interrupted, { fsOps: { rename: async () => { throw new Error("rename interrupted"); } } }),
    /rename interrupted/);
  assert.deepEqual(await readFile(interrupted.envFile), bytes);
  await run(interrupted);
  assert.ok((await readFile(interrupted.envFile, "utf8")).includes("APPREVIEW_OWNER_PASSWORD="));
  assert.equal((await stat(interrupted.envFile)).mode & 0o077, 0);
});

test("resume after a crash", async () => {
  const failure = { kind: "write", table: "bank_review_items" };
  const interrupted = await setup({ fail: failure });
  await assert.rejects(run(interrupted), /injected error/);
  delete failure.kind;
  await run(interrupted);
  const clean = await setup();
  await run(clean);
  for (const table of ["properties", "units", "leases", "rent_charges", "payments", "property_expenses",
    "bank_review_items", "inbox_messages", "maintenance_tickets", "maintenance_photos"]) {
    assert.deepEqual(interrupted.fake.tables[table], clean.fake.tables[table]);
  }
});

test("photo name match is exact", async () => {
  const ticketId = deterministicUuid("appreview-ticket");
  const photoId = deterministicUuid("appreview-photo");
  const filename = `${photoId}-sink.png`;
  const ctx = await setup({ objects: { [`${ticketId}/${filename}-old`]: Buffer.from("unrelated") } });
  await run(ctx);
  assert.ok(ctx.fake.objects.has(`${ticketId}/${filename}`));
});

test("December to January", async () => {
  const ctx = await setup();
  await run(ctx, { now: new Date("2026-12-10T12:00:00.000Z") });
  const december = ctx.fake.tables.rent_charges.find((row) => row.due_date === "2026-12-01");
  await run(ctx, { now: new Date("2027-01-10T12:00:00.000Z") });
  assert.equal(ctx.fake.tables.rent_charges.find((row) => row.due_date === "2027-01-01").id,
    deterministicUuid("appreview-charge-2027-01"));
  assert.equal(ctx.fake.tables.rent_charges.find((row) => row.due_date === "2026-12-01").id, december.id);
  assert.equal(december.status, "paid");
});

test("fake rejects bad uuids and duplicate ids", async () => {
  const { admin } = createFakeAdmin();
  const invalid = await admin.from("profiles").select("id").eq("id", "not-a-uuid");
  assert.equal(invalid.error?.code, "22P02");
  const id = deterministicUuid("duplicate-profile");
  assert.equal((await admin.from("profiles").insert({ id })).error, null);
  assert.equal((await admin.from("profiles").insert({ id })).error?.code, "23505");
  assert.equal((await admin.from("profiles").insert({ id: "not-a-uuid" })).error?.code, "22P02");
});

test("a foreign rent item is not deleted", async () => {
  const ctx = await setup();
  await run(ctx);
  const rent = ctx.fake.tables.bank_review_items.find((row) => row.id ===
    deterministicUuid("appreview-bank-item-2026-10-rent"));
  rent.owner_account_id = deterministicUuid("foreign-account");
  const previous = structuredClone(rent);
  await run(ctx, { now: new Date("2026-11-10T12:00:00.000Z") });
  assert.deepEqual(ctx.fake.tables.bank_review_items.find((row) => row.id === rent.id), previous);
  assert.ok(!writes(ctx).some((call) => call.table === "bank_review_items" && call.op === "delete"));
});

test("dry rollover reports old rent item without deleting it", async () => {
  const ctx = await setup();
  await run(ctx);
  const before = writes(ctx).length;
  const summary = await run(ctx, { dryRun: true, now: new Date("2026-11-10T12:00:00.000Z") });
  assert.ok(summary["would-delete"].includes("old rent bank item 2026-10"));
  assert.equal(writes(ctx).length, before);
  assert.ok(ctx.fake.tables.bank_review_items.some((row) => row.id ===
    deterministicUuid("appreview-bank-item-2026-10-rent")));
});

test("foreign lease and membership are refused without touching those tables", async () => {
  for (const [table, parent] of [["leases", "tenant_profile_id"],
    ["ownership_account_members", "profile_id"]]) {
    const ctx = await setup();
    await run(ctx);
    ctx.fake.tables[table][0][parent] = deterministicUuid(`foreign-${table}`);
    const before = writes(ctx).length;
    await assert.rejects(run(ctx), /foreign|unexpected access/);
    assert.ok(!writes(ctx).slice(before).some((call) => call.table === table &&
      ["update", "insert", "upsert"].includes(call.op)));
  }
});

test("auth errors are readable but never leak a password", async () => {
  const ctx = await setup({ fail: { kind: "auth-write", message: "boom" } });
  const secret = "generated-password-test-secret";
  await assert.rejects(run(ctx, { env: { ...ENV, APPREVIEW_OWNER_PASSWORD: secret } }), (error) => {
    assert.match(error.message, /Failed to create owner auth user: boom/);
    assert.ok(!error.message.includes(secret));
    return true;
  });
  const existing = await setup();
  await run(existing);
  existing.fake.users[0].app_metadata.appreview_password_hash = "stale";
  const failure = { kind: "auth-write", message: "boom" };
  const update = await setup({ users: existing.fake.users, tables: existing.fake.tables, fail: failure });
  await assert.rejects(run(update, { env: { ...ENV, APPREVIEW_OWNER_PASSWORD: secret } }), (error) => {
    assert.match(error.message, /Failed to update owner auth user: boom/);
    assert.ok(!error.message.includes(secret));
    return true;
  });
});
