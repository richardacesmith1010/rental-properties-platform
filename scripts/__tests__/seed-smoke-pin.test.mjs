import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { runSmokeSeed } from "../seed-smoke-accounts.mjs";
import { createFakeAdmin } from "./helpers/fake-admin.mjs";

const users = Object.fromEntries(["owner", "manager", "tenant"].map((role) => [role, {
  email: `smoke-${role}@example.invalid`, password: `pin-${role}`, role,
  fullName: `Smoke ${role[0].toUpperCase()}${role.slice(1)}`
}]));
const labels = [
  "owner auth user", "owner profile", "manager auth user", "manager profile", "tenant auth user", "tenant profile",
  "ownership account", "ownership membership", "smoke property", "smoke unit", "manager assignment", "smoke lease"
];

test("smoke writes and output are unchanged", async () => {
  const fake = createFakeAdmin();
  const lines = [];
  const old = console.log;
  console.log = (line) => lines.push(line);
  try {
    await runSmokeSeed({ admin: fake.admin, config: { users } });
    const writes = fake.calls.filter((call) => ["write", "auth-write"].includes(call.kind))
      .map(({ kind, table, op, payload }) => ({ kind, table, op: op ?? "insert", payload }));
    assert.equal(writes.length, 12);
    assert.equal(createHash("sha256").update(JSON.stringify(writes)).digest("hex"),
      "f4b8d4fc7672517b1d533be9500944dd3a7b3f24addefb07ab1370a7a721292d");
    assert.deepEqual(lines, [`[smoke-seed] created: ${labels.join(", ")}`, "[smoke-seed] complete"]);
    const before = fake.calls.length;
    lines.length = 0;
    await runSmokeSeed({ admin: fake.admin, config: { users } });
    assert.deepEqual(fake.calls.slice(before).filter((call) => ["write", "auth-write"].includes(call.kind)), []);
    assert.deepEqual(lines, [`[smoke-seed] existing: ${labels.join(", ")}`, "[smoke-seed] complete"]);
  } finally { console.log = old; }
});
