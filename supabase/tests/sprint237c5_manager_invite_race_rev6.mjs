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
  const { data: g } = await db.from("zz_c5_pm").select("active, assigned_directly").eq("property_id", H).eq("manager_profile_id", P).single();
  const st = Object.fromEntries(rows.map((r) => [r.id === RA ? "ra" : "rb", r.status]));
  const live = rows.some((r) => r.status === "pending" || r.status === "accepted");
  return { ...st, active: g.active, direct: g.assigned_directly, invariant_ok: g.active === (live || g.assigned_directly) };
};
const reset = async (s) => { const { error } = await mk().rpc("zz_c5_reset", { p_state: s }); if (error) throw error; };
const call = (fn, args, delay) => sleep(delay).then(async () => {
  const sent = new Date().toISOString(); const { data, error } = await mk().rpc(fn, args);
  return { fn, sent, error: error?.message ?? null, data }; });
async function scenario(name, s, c1, c2) {
  await reset(s);
  const [r1, r2] = await Promise.all([call(...c1, 0), call(...c2, 1000)]);
  return { name, s1: r1, s2: r2, overlap: r2.sent < r1.data?.t_end, waited: r2.data?.t_locked >= r1.data?.t_end, final: await state() };
}
const rev = (id, by, lock, hold) => ["zz_c5_revoke", { p_invitation_id: id, p_inviter_id: by, p_use_lock: lock, p_hold: hold }];
const add = (hold) => ["zz_c5_grant_homes", { p_profile_id: P, p_property_ids: [H], p_hold: hold }];
const out = [];
out.push(await scenario("A two final revokes, NO lock (control)", "both_pending", rev(RA, A, false, 3), rev(RB, B, false, 0)));
out.push(await scenario("B two final revokes, lock", "both_pending", rev(RA, A, true, 3), rev(RB, B, true, 0)));
out.push(await scenario("F direct add holds, last revoke waits", "a_only", add(3), rev(RA, A, true, 0)));
out.push(await scenario("G last revoke holds, direct add waits", "a_only", rev(RA, A, true, 3), add(0)));
console.log(JSON.stringify(out));
