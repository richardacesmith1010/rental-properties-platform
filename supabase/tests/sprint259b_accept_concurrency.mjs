// Sprint 259b D4: real-concurrency checks for public.accept_llc_invitation on the live database (ChatGPT rev 4
// REQUIRED 2, rev 5 REQUIRED 2). Run after the 20261108 migration is applied and the temporary helper in
// sprint259b_accept_concurrency_helper.sql exists, from the repo root:
//   node supabase/tests/sprint259b_accept_concurrency.mjs [rounds]
// Each PostgREST request runs in its own transaction on its own connection. For every race, a holder request takes
// the invitation's row lock for HOLD_MS; both racers start while it is held, so each must wait on the lock (checked
// by its elapsed time), and the database decides the order. Races: accept/accept, accept/cancel, accept/resend
// (the resend rotates the token, as R6 does). Fixtures: two tester logins (@example.invalid, no password) and one LLC
// per race; all removed at the end, even on failure. Never prints credentials. Exit code 0 = pass.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const root = new URL("../../", import.meta.url);
const { createClient } = createRequire(new URL("apps/web/package.json", root))("@supabase/supabase-js");
const env = Object.fromEntries(readFileSync(new URL("apps/web/.env.local", root), "utf8").split(/\r?\n/)
  .filter((line) => /^[A-Z_0-9]+=/.test(line))
  .map((line) => { const i = line.indexOf("="); return [line.slice(0, i), line.slice(i + 1).replace(/^['"]|['"]$/g, "")]; }));
if (!env.NEXT_PUBLIC_SUPABASE_URL?.includes("vawqdqkaguhdgfhdebqw") || !env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Wrong project or missing service role key.");
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const ROUNDS = Number(process.argv[2] ?? 10);
const HOLD_MS = 2500;
const START_DELAY_MS = 700;
const MIN_WAIT_MS = 1200;
const CUR = "2026-10-30";
const HASH = {
  terms: "d9f5bae5103bae8db4851a6d30f0283f3c92017ba045d813b4b3c388bcb95b7d",
  privacy: "e698a76b026206ae3d8553fcef451dd867d06cc80fbe0734b647dc60d2f865c3"
};
const users = [];
const accounts = [];
const failures = [];
const tally = { acceptAccept: 0, acceptBeatCancel: 0, cancelBeatAccept: 0, acceptBeatResend: 0, resendBeatAccept: 0 };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function checked({ data, error }, what) {
  if (error) throw new Error(`${what} failed (${error.code ?? "unknown"})`);
  return data;
}
async function tester(label) {
  const email = `c259b-${label}-${randomUUID()}@example.invalid`;
  const { user } = checked(await admin.auth.admin.createUser({
    email, email_confirm: true, user_metadata: { role: "owner", full_name: `Race ${label}` }
  }), "create tester");
  users.push(user.id);
  checked(await admin.from("profiles").update({ is_tester: true }).eq("id", user.id), "mark tester");
  return { id: user.id, email };
}
async function invitation(label, inviter, email) {
  const account = checked(await admin.from("ownership_accounts")
    .insert({ account_type: "llc", display_name: `259b race ${label}`, claim_state: "claimed" }).select("id").single(),
  "create LLC");
  accounts.push(account.id);
  const row = checked(await admin.from("llc_invitations")
    .insert({ ownership_account_id: account.id, invited_by: inviter.id, email, status: "pending" })
    .select("id, token").single(), "invite");
  return { accountId: account.id, id: row.id, token: row.token };
}
const accept = (inv, person, token = inv.token) => admin.rpc("accept_llc_invitation", {
  p_invitation_id: inv.id, p_invitation_token: token, p_profile_id: person.id, p_full_name: "Race Invitee",
  p_nickname: "Race", p_terms_version: CUR, p_privacy_version: CUR
});
const cancel = (inv) => admin.from("llc_invitations").update({ status: "cancelled" })
  .eq("id", inv.id).eq("status", "pending").select("id");
const resend = (inv) => admin.from("llc_invitations").update({ token: randomUUID(), created_at: new Date().toISOString() })
  .eq("id", inv.id).eq("status", "pending").select("token");
async function state(inv, person) {
  const row = checked(await admin.from("llc_invitations").select("status, token").eq("id", inv.id).single(), "read");
  const members = checked(await admin.from("ownership_account_members").select("profile_id")
    .eq("account_id", inv.accountId).eq("profile_id", person.id), "read members");
  return { status: row.status, token: row.token, members: members.length };
}
// Starts the lock holder, then both racers while it holds the row; returns each racer's result and wait time.
async function race(inv, racers) {
  const holding = admin.rpc("zz_test_259b_hold", { p_invitation_id: inv.id, p_ms: HOLD_MS });
  await sleep(START_DELAY_MS);
  const started = Date.now();
  const results = await Promise.all(racers.map((run) => run().then((result) => ({ result, ms: Date.now() - started }))));
  checked(await holding, "hold");
  if (results.some(({ ms }) => ms < MIN_WAIT_MS)) failures.push(`no contention: waits ${results.map((r) => r.ms).join("/")} ms`);
  return results.map(({ result }) => result);
}

let leftovers = 0;
try {
  const inviter = await tester("inviter");
  const invitee = await tester("invitee");
  checked(await admin.from("legal_acceptances").insert({
    profile_id: invitee.id, terms_version: CUR, terms_sha256: HASH.terms, privacy_version: CUR,
    privacy_sha256: HASH.privacy, source: "agree_page", role_at_acceptance: "owner", client: "web",
    email_hmac: "0".repeat(64), email_hmac_key_version: 1
  }), "record agreement");
  for (let round = 1; round <= ROUNDS; round += 1) {
    const a = await invitation(`A${round}`, inviter, invitee.email);
    const outcomes = (await race(a, [() => accept(a, invitee), () => accept(a, invitee)]))
      .map((result) => checked(result, "accept")).sort();
    const sa = await state(a, invitee);
    if (outcomes.join() === "accepted,not_active" && sa.status === "accepted" && sa.members === 1) tally.acceptAccept += 1;
    else failures.push(`round ${round} accept/accept: ${outcomes.join()} ${sa.status} members=${sa.members}`);

    const b = await invitation(`B${round}`, inviter, invitee.email);
    const [accB, canB] = await race(b, [() => accept(b, invitee), () => cancel(b)]);
    const outB = checked(accB, "accept");
    const cancelled = checked(canB, "cancel").length;
    const sb = await state(b, invitee);
    if (outB === "accepted" && cancelled === 0 && sb.status === "accepted" && sb.members === 1) tally.acceptBeatCancel += 1;
    else if (outB === "not_active" && cancelled === 1 && sb.status === "cancelled" && sb.members === 0) {
      tally.cancelBeatAccept += 1;
    } else failures.push(`round ${round} accept/cancel: ${outB} cancel=${cancelled} ${sb.status} members=${sb.members}`);

    const c = await invitation(`C${round}`, inviter, invitee.email);
    const [accC, resC] = await race(c, [() => accept(c, invitee), () => resend(c)]);
    const outC = checked(accC, "accept");
    const rotated = checked(resC, "resend");
    const sc = await state(c, invitee);
    if (outC === "accepted" && rotated.length === 0 && sc.status === "accepted" && sc.token === c.token
        && sc.members === 1) {
      tally.acceptBeatResend += 1;
    } else if (outC === "not_active" && rotated.length === 1 && sc.status === "pending" && sc.token === rotated[0].token
        && sc.token !== c.token && sc.members === 0) {
      const again = checked(await accept(c, invitee), "old token again");
      const fresh = checked(await accept(c, invitee, rotated[0].token), "new token");
      const after = await state(c, invitee);
      if (again === "not_active" && fresh === "accepted" && after.status === "accepted" && after.members === 1) {
        tally.resendBeatAccept += 1;
      } else failures.push(`round ${round} after resend: old=${again} new=${fresh} ${after.status} members=${after.members}`);
    } else failures.push(`round ${round} accept/resend: ${outC} rotated=${rotated.length} ${sc.status} members=${sc.members}`);
  }
} catch (error) {
  failures.push(error instanceof Error ? error.message : "unexpected error");
} finally {
  for (const id of accounts) await admin.from("ownership_accounts").delete().eq("id", id);
  for (const id of users) {
    await admin.auth.admin.deleteUser(id);
    await admin.from("profiles").delete().eq("id", id);
  }
  const ids = (list) => (list.length ? list : [randomUUID()]);
  const counts = await Promise.all([
    admin.from("ownership_accounts").select("id", { count: "exact", head: true }).in("id", ids(accounts)),
    admin.from("profiles").select("id", { count: "exact", head: true }).in("id", ids(users)),
    admin.from("legal_acceptances").select("id", { count: "exact", head: true }).in("profile_id", ids(users))
  ]);
  leftovers = counts.reduce((sum, result) => sum + (result.count ?? 1), 0);
}
console.log(JSON.stringify({ rounds: ROUNDS, holdMs: HOLD_MS, ...tally, failures, leftovers }));
process.exit(failures.length === 0 && leftovers === 0 ? 0 : 1);
