import { createRequire } from "node:module";
import fs from "node:fs";
const root = process.argv[2];
const require = createRequire(root + "/apps/web/package.json");
const { createClient } = require("@supabase/supabase-js");
const env = Object.fromEntries(fs.readFileSync(root + "/apps/web/.env.local", "utf8").split("\n")
  .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const mk = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const db = mk();
const A = "a2f5e6af-76a9-4bb8-bba4-2588465bcabb", B = "062e5fa4-dbdb-4987-8343-d601ca6819b9";
const H = "4952915f-9886-4a59-a512-fb06637131cd", P = "78e77195-10a0-441f-8ff0-ba969070d77e";
const RA = "684e5f7a-2587-4390-ad20-6824839571a0", RB = "8d038b76-0637-4e6c-b323-4fd83c0fe5cd";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const state = async () => {
  const { data: rows } = await db.from("invitations").select("id, status").in("id", [RA, RB]);
  const { data: g } = await db.from("property_managers").select("active").eq("property_id", H).eq("manager_profile_id", P).single();
  const st = Object.fromEntries(rows.map((r) => [r.id === RA ? "ra" : "rb", r.status]));
  const live = rows.some((r) => r.status === "pending" || r.status === "accepted");
  return { ...st, grant: g.active, invariant_ok: g.active === live };
};
const reset = async (s) => { const { error } = await mk().rpc("zz_c5_reset", { p_state: s }); if (error) throw error; };
const call = (fn, args, delay) => sleep(delay).then(async () => {
  const sent = new Date().toISOString(); const { data, error } = await mk().rpc(fn, args);
  return { fn, sent, error: error?.message ?? null, data }; });
async function scenario(name, s, c1, c2) {
  await reset(s);
  const [r1, r2] = await Promise.all([call(...c1, 0), call(...c2, 1000)]);
  const overlap = r2.sent < r1.data?.t_end;
  const waited = r2.data?.t_locked >= r1.data?.t_end;
  return { name, s1: r1, s2: r2, s2_sent_before_s1_end: overlap, s2_waited_for_s1: waited, final: await state() };
}
const out = [];
out.push(await scenario("A concurrent final revokes, NO lock (bug control)", "both_pending",
  ["zz_c5_revoke", { p_invitation_id: RA, p_inviter_id: A, p_use_lock: false, p_hold: 3 }],
  ["zz_c5_revoke", { p_invitation_id: RB, p_inviter_id: B, p_use_lock: false, p_hold: 0 }]));
out.push(await scenario("B concurrent final revokes, WITH lock", "both_pending",
  ["zz_c5_revoke", { p_invitation_id: RA, p_inviter_id: A, p_use_lock: true, p_hold: 3 }],
  ["zz_c5_revoke", { p_invitation_id: RB, p_inviter_id: B, p_use_lock: true, p_hold: 0 }]));
out.push(await scenario("C revoke(rb) holds, grant(ra) waits, WITH lock", "both_pending",
  ["zz_c5_revoke", { p_invitation_id: RB, p_inviter_id: B, p_use_lock: true, p_hold: 3 }],
  ["zz_c5_grant", { p_ids: [RA], p_profile_id: P, p_inviter_id: A, p_use_lock: true, p_hold: 0 }]));
out.push(await scenario("D grant(ra) holds, revoke(rb) waits, WITH lock", "both_pending",
  ["zz_c5_grant", { p_ids: [RA], p_profile_id: P, p_inviter_id: A, p_use_lock: true, p_hold: 3 }],
  ["zz_c5_revoke", { p_invitation_id: RB, p_inviter_id: B, p_use_lock: true, p_hold: 0 }]));
out.push(await scenario("E revoke(ra, last live) holds, grant(ra) waits -> not_pending, WITH lock", "a_pending_granted",
  ["zz_c5_revoke", { p_invitation_id: RA, p_inviter_id: A, p_use_lock: true, p_hold: 3 }],
  ["zz_c5_grant", { p_ids: [RA], p_profile_id: P, p_inviter_id: A, p_use_lock: true, p_hold: 0 }]));
console.log(JSON.stringify(out, null, 1));
