# Account deletion step log

Rules: `docs/runbooks/account-deletion.md` §2. Append only. One line per step.
Only the request id goes here: never a name, email, phone, profile id, Stripe or Plaid id, file path, or message text.

| Request id | Step | When (UTC) | Result |
|---|---|---|---|
| 407bebfe-ed06-48cc-9034-9b98040f4651 | §15 dry run — fixture built (3 test accounts) | 2026-10-18T05:08Z | ok |
| 407bebfe-ed06-48cc-9034-9b98040f4651 | §15 tripwire test — A2 with a signed packet | 2026-10-18T05:08Z | ok — signed_leases 1, stopped before B (§13); packet removed |
| 407bebfe-ed06-48cc-9034-9b98040f4651 | A1 | 2026-10-18T05:09Z | ok |
| 407bebfe-ed06-48cc-9034-9b98040f4651 | A2 | 2026-10-18T05:09Z | ok — obligations: lease, manages 1 home, unpaid pay, shared LLC, sole owner, Stripe customer + 2 payout ids; tripwires 0 |
| 407bebfe-ed06-48cc-9034-9b98040f4651 | §5 day-3 emails | 2026-10-18T05:09Z | skip — dry run (drafted, not sent) |
| 407bebfe-ed06-48cc-9034-9b98040f4651 | A3 | 2026-10-18T05:09Z | ok — signed in after request → §6 email drafted, not sent; reply wait skip — dry run; treated as "delete" |
| 407bebfe-ed06-48cc-9034-9b98040f4651 | A4 | 2026-10-18T05:09Z | ok 17 hits; look-alikes: same name 1, same phone 1 |
| 407bebfe-ed06-48cc-9034-9b98040f4651 | A5 | 2026-10-18T05:09Z | ok — orphans 0 / 0 |
| 407bebfe-ed06-48cc-9034-9b98040f4651 | A6 | 2026-10-18T05:09Z | ok — owner go (dry run, 2026-10-18) |
| 407bebfe-ed06-48cc-9034-9b98040f4651 | B1 | 2026-10-18T05:10Z | ok |
| 407bebfe-ed06-48cc-9034-9b98040f4651 | B2 | 2026-10-18T05:10Z | skip — dry run (no person acting; the only session was Claude's test browser, closed) |
| 407bebfe-ed06-48cc-9034-9b98040f4651 | C1 | 2026-10-18T05:10Z | ok 1 rows (second run 0) |
| 407bebfe-ed06-48cc-9034-9b98040f4651 | C2 | 2026-10-18T05:10Z | ok 4 rows (second run 0) |
| 407bebfe-ed06-48cc-9034-9b98040f4651 | C3 | 2026-10-18T05:12Z | ok — cleaned 8 rows (Part 1: 1, Part 2: 6, Part 3: 1 mention); left 3 rows "someone else"; asked 1 (dry run: resolved per fixture intent) |
| 407bebfe-ed06-48cc-9034-9b98040f4651 | C4 | 2026-10-18T05:13Z | ok 3 rows (second run 0) |
| 407bebfe-ed06-48cc-9034-9b98040f4651 | C5 part 1 | 2026-10-18T05:13Z | ok — delete list 3, keep list 1 |
| 407bebfe-ed06-48cc-9034-9b98040f4651 | C5 part 2 | 2026-10-18T05:13Z | ok — 3 objects deleted (exact names) |
| 407bebfe-ed06-48cc-9034-9b98040f4651 | §15 forced stop 1 | 2026-10-18T05:13Z | stopped after C5 part 2 (resume from this log only) |
| 407bebfe-ed06-48cc-9034-9b98040f4651 | C5 part 3 | 2026-10-18T05:14Z | ok — delete list: 0 of 2 row-backed objects remain, profile photo 0 remain; keep list 1 of 1 present |
| 407bebfe-ed06-48cc-9034-9b98040f4651 | C5 part 4 | 2026-10-18T05:14Z | ok 3 rows (photos 2, home files 1; second run 0); list 1 now 0 rows; orphans 0 / 0 (baseline 0 / 0) |
| 407bebfe-ed06-48cc-9034-9b98040f4651 | C6 | 2026-10-18T05:16Z | skip — already done (test-mode customer shows deleted; forced stop 2 resumed) |
| 407bebfe-ed06-48cc-9034-9b98040f4651 | C7 | 2026-10-18T05:18Z | ok — 2 test-mode accounts (LLC member payout, sole LLC): balance 0, none in transit, deleted at Stripe, ids cleared one at a time; connect counts 0/0/0 |
| 407bebfe-ed06-48cc-9034-9b98040f4651 | C8 | 2026-10-18T05:18Z | skip — none (bank_links 0) |
| 407bebfe-ed06-48cc-9034-9b98040f4651 | C3b | 2026-10-18T05:19Z | ok — 3 rows re-checked (4 mentions), all someone else; first-name review 0 extra rows |
| 407bebfe-ed06-48cc-9034-9b98040f4651 | C9 | 2026-10-18T05:20Z | ok 1 rows (right after C3b; profile_anonymized true) |
| 407bebfe-ed06-48cc-9034-9b98040f4651 | C10 | 2026-10-18T05:20Z | ok (200; second run 404 = already gone) |
| 407bebfe-ed06-48cc-9034-9b98040f4651 | D1 | 2026-10-18T05:20Z | ok — all 7 columns true; orphans 0 / 0 (baseline 0 / 0); C3b ok; Appendix A rerun 1 row, judged someone else; C6/C7/C8 ok or skip |
| 407bebfe-ed06-48cc-9034-9b98040f4651 | D2 | 2026-10-18T05:20Z | ok — kept_records 5, kept_messages 1, signed_leases 0; files deleted yes; C7 not left open |
| 407bebfe-ed06-48cc-9034-9b98040f4651 | D3 | 2026-10-18T05:20Z | skip — dry run (drafted, not sent) |
| 407bebfe-ed06-48cc-9034-9b98040f4651 | D4 | 2026-10-18T05:21Z | ok 1 rows — done; email_at_request and profile_id null; confirmation_sent_at = now() (dry run, D3 not sent) |
