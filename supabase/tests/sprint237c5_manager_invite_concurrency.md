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
