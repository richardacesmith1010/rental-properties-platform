# Sprint 237c-5 — real two-session concurrency proof (Claude, 2026-10-18 ~01:50Z)

Why: ChatGPT round 2 (REQUIRED 1, 5) — row locks alone let two concurrent final revokes both see the other row as live.
The fake (vitest) is single-threaded, so Postgres locking is proved here against the live database.

Method (re-runnable): temporary service-role-only copies `public.zz_c5_lock / zz_c5_revoke / zz_c5_grant / zz_c5_reset`
(same bodies as the rev 5 migration, plus a `p_use_lock` switch and a `p_hold` sleep before commit), committed throwaway
fixtures (profile `c5-race@example.com`, two pending manager rows on Smoke Test Property from the smoke owner and the
smoke manager, one active grant). `sprint237c5_manager_invite_race.mjs` fires two PostgREST RPCs 1 s apart (two real
sessions) and checks the final state. All temporary functions and fixtures were dropped afterwards (verified 0 left).

| Scenario | Overlap | Session 2 waited | Final state | Invariant (grant active ⇔ a live row) |
|---|---|---|---|---|
| A two final revokes, **no lock** (control) | yes | no | both expired, **grant active** | **broken** (reproduces the bug) |
| B two final revokes, with lock | yes | yes | both expired, grant off (S2 released) | ok |
| C revoke(rb) holds, grant(ra) | yes | yes | ra pending, rb expired, grant on | ok |
| D grant(ra) holds, revoke(rb) | yes | yes | ra pending, rb expired, grant on | ok |
| E revoke(ra, last live) holds, grant(ra) | yes | yes | both expired, grant off (grant → not_pending) | ok |

Single-session rolled-back suite: `sprint237c5_manager_invite_functions.sql` → G1-G4, R1-R5, A1, H1, X1, P1 all pass.

## Rev 6 re-run (2026-10-18 ~02:20Z) — source flag `assigned_directly` (ChatGPT round 3)
The column is not in production before approval, so this run used a throwaway table `public.zz_c5_pm` with the same
shape plus `assigned_directly`, and `zz_c5_*` copies of the rev 6 revoke and `manager_grant_homes` bodies on it (same lock
code). Script: `sprint237c5_manager_invite_race_rev6.mjs`. Everything was dropped afterwards (verified 0 objects, 0 rows).
Invariant: access active ⇔ (a live invitation for that home) or `assigned_directly`.

| Scenario | Overlap | S2 waited | Result | Invariant |
|---|---|---|---|---|
| A two final revokes, no lock (control) | yes | no | both expired, invite-made access still on | **broken** |
| B two final revokes, lock | yes | yes | both expired, access off (S2 released) | ok |
| F direct add holds, last revoke waits (round-3 scenario) | yes | yes | revoke `kept_direct`, access on, direct | ok |
| G last revoke holds, direct add waits | yes | yes | revoke released, then add → access on, direct | ok |

Rolled-back suite (rev 6): S0 G1-G4 R1-R5 A1 H1 D1-D3 X1 P1 all pass.

## C5 diagnostic (run after apply and at every /ship): where each active manager grant comes from
```sql
select pm.property_id, pm.manager_profile_id, pm.assigned_directly,
       exists (select 1 from invitations i join profiles p on lower(p.email) = lower(i.email)
               where p.id = pm.manager_profile_id and i.role = 'manager' and i.property_id = pm.property_id
                 and i.status in ('pending', 'accepted')) as invite_backed
from property_managers pm
where pm.active
order by 3, 4;
-- Buckets: direct only (assigned_directly, no live invite); invite-backed only; both. Review any row with
-- assigned_directly = false and invite_backed = false: invitation-made access with no live invitation (should be 0).
```
