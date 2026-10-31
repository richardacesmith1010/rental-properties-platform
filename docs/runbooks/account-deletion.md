# Runbook — finishing an account deletion request (rev 3.4, 2026-10-18 — §15 dry run PASSED; its fixes are marked "(3.4)")

Review history: rev 1 with the 238b packet → rev 2 REJECT → rev 2 REJECT again (2026-10-16) → rev 3 APPROVE WITH
CHANGES (2026-10-17; matching rows reviewed before change, signed leases a tripwire, full D1 profile check, look-alike
and crash/resume dry-run cases) → rev 3.1 APPROVE WITH CHANGES (each mention decided on its own, a C3b gate before C9,
Stripe ids cleared one account at a time, shared files kept) → rev 3.2 APPROVE WITH CHANGES (shared files never sent to
Storage, exact delete call confirmed, whole-field check before a one-mention edit) → rev 3.3 (this file; those two
REQUIRED items adopted, which ChatGPT called the final runbook changes before the dry run).
The in-app button (Sprint 238b, commit `cda681a`) only records the request in `public.account_deletion_requests` and signs
the person out. This runbook finishes the deletion by hand. Automatic deletion stays parked
(`docs/account-deletion-design.md`). Every table and column named here was checked against the live database on
2026-10-17 (lesson L-004). Every SQL block was plan-checked there with `EXPLAIN` (which changes nothing), and every
column set to null was checked to allow null. The Appendix A search was run read-only against the withdrawn 238b test
request and found that test account's email and name.

## 0. Ground rules
- **Promise:** finished within **30 days** of `requested_at`. Nothing anyone owes can push us past that (§5).
- **Owner "go":** the owner (Ace) says "go" in chat for **each** request before Phase B. Claude prepares everything else.
  The owner also sends every email in this runbook from support@domusbase.com. Claude drafts them.
- **No personal data outside the database.** The step log, the handoff, commits and chat summaries hold the request id
  only. Queries here return counts, true/false, and row ids. If you must read a row's text (C3 review), copy it nowhere.
- **Never delete the `profiles` row.** 17 tables cascade-delete from it (for example `manager_payments`,
  `charge_edit_history`, `ownership_account_members`). That would wipe other people's records. Anonymize it (C9).
- **No single transaction.** Auth, Storage, Stripe and Plaid calls can't join a database transaction. So the work is an
  ordered list of steps. Each step is safe to run twice. Each has a **done when** check: run it first and skip the step
  if it already passes.
- **How SQL finds the person.** Replace `<rid>` with the request id. Every statement reads the person from the request
  row, so you never paste their id or email into SQL. Run SQL as the database owner (Supabase MCP `execute_sql` or the
  SQL editor). Shell calls that need the person's id read it from the A1 output; never log it.
- **Point of no return:** step C1. Before C1 the request can still be withdrawn cleanly (§11).
- **(3.4) Shell steps run in `bash`** (in zsh an unquoted `$(… | xargs)` stays one word). Never paste an id into a
  command: look it up inside the command from the request id, e.g.
  ```bash
  PID=$(curl -sS "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/account_deletion_requests?id=eq.<rid>&select=profile_id" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    | python3 -c 'import json,sys;print(json.load(sys.stdin)[0]["profile_id"])')
  ```
  — the value stays in the shell variable and is never printed.

## 1. Timeline (day 0 = `requested_at`)
| Day | What happens | Who |
|---|---|---|
| 0 | The button records the request, adds a feedback heads-up, writes an audit row, and signs the person out. | App |
| 0–2 | Queue check finds it. Run Phase A (checks only, no changes). | Claude |
| by 3 | Obligation found (A2) or new sign-in (A3)? Send the day-3 emails (§5, §6). Either way, ask the owner for "go". | Claude drafts, owner sends |
| 14 | Second sign-in check (A3). Reminder to anyone still holding an obligation. | Claude drafts, owner sends |
| by 21 | Run Phases B–D whatever obligations remain. §5 says how each one is closed. Only two things may finish later: C7's wait for a Stripe balance to empty, and a §6 wait. | Claude, after "go" |
| by 28 | Last day for those two waits. Then run what is left: all of B–D after a §6 wait; the rest of C7, then C8–D4, after a Stripe wait. | Claude |
| 30 | Deadline: completion email sent, request closed. | — |

With no obligation and no new sign-in, run as soon as the owner says "go". Don't wait for day 21. With an obligation,
pick a **run date** no later than day 21, put it in the day-3 emails, and don't start Phase B before it. If the owner
hasn't said "go" by day 19, Claude asks again and marks it urgent.

**Queue check (daily; until a scheduled check exists, at every session start):**
```sql
select id, role_at_request, requested_at, requested_at + interval '30 days' as due,
       now() > requested_at + interval '3 days' as past_day_3,
       now() > requested_at + interval '21 days' as past_day_21
from public.account_deletion_requests where status = 'open' order by requested_at;
```

## 2. Step log
- **Where:** `docs/runbooks/account-deletion-log.md` in this repo. Append only. Commit it at the end of each session.
- **Format:** one line per step: `| <rid> | <step> | <UTC time> | <result> |`. Result is one of `ok`, `ok <n> rows`,
  `skip — already done`, `skip — none`, `waiting — until <date>`, `fail — <short reason>`; (3.4) dry runs only:
  `skip — dry run`, `stopped — forced stop <n>`.
- **Never** write a name, email, phone, profile id, Stripe or Plaid id, file path, or message text in it.
- **Resume:** find the request's last `ok` or `skip` line. Run the next step's done-when check, then carry on.
  After a `fail`, fix the cause and run that same step again. Never skip ahead past a failed step.
- The request stays `status = 'open'` until D4, so the queue check keeps showing an unfinished request.

## 3. Phase A — check (no changes)

**A1 Target.** Go on only if `status = 'open'` and `profile_exists`. If an email doesn't match, the person changed it
after asking. The profile id is still the key, and A4 searches every known email. Never act on an email alone.
```sql
select r.status, r.profile_id as pid,   -- pid is for shell steps only; never log it
       p.id is not null as profile_exists, u.id is not null as auth_user_exists,
       lower(p.email) = lower(r.email_at_request) as profile_email_matches,
       lower(u.email) = lower(r.email_at_request) as auth_email_matches,
       p.full_name = 'Deleted user' as already_anonymized
from public.account_deletion_requests r
left join public.profiles p on p.id = r.profile_id
left join auth.users u on u.id = r.profile_id
where r.id = '<rid>';
```

**A2 Roles and obligations.** The person may hold several roles. Act on all of them. Any count above 0 drives a day-3
email (§5). `bank_links`, `doc_rows`, `inspection_photos`, `signed_leases` and `lease_files` are **tripwires** (§13).
```sql
with r as (select profile_id as pid, lower(email_at_request) as req_email
           from public.account_deletion_requests where id = '<rid>'),
e as (select req_email as v from r union select lower(p.email) from public.profiles p join r on p.id = r.pid),
packets as (select k.id from public.document_packets k, r where k.created_by_profile_id = r.pid
            union select s.packet_id from public.document_signers s, r
             where s.profile_id = r.pid or lower(s.email) in (select v from e)),
mine as (select m.account_id,
                exists (select 1 from public.ownership_account_members o, r
                        where o.account_id = m.account_id and o.active and o.profile_id <> r.pid) as shared
         from public.ownership_account_members m, r where m.profile_id = r.pid and m.active)
select
 (select count(*) from public.leases l, r where l.tenant_profile_id = r.pid and l.active) as active_leases,
 (select count(*) from public.property_managers x, r where x.manager_profile_id = r.pid and x.active) as managed_homes,
 (select count(*) from public.ownership_account_managers x, r where x.manager_profile_id = r.pid and x.active)
   as managed_accounts,
 (select count(*) from public.manager_payments x, r where x.manager_profile_id = r.pid and x.status = 'pending')
   as unpaid_manager_pay,
 (select count(*) from mine where shared) as shared_llcs,
 (select count(*) from mine where not shared) as sole_accounts,
 (select count(*) from public.properties p join mine on p.owner_account_id = mine.account_id where not mine.shared)
   as sole_homes,
 (select count(*) from public.properties p, r where p.owner_profile_id = r.pid) as homes_on_profile,
 (select count(*) from public.ownership_accounts a join mine on a.id = mine.account_id where a.managed_client)
   as managed_client_accounts,
 (select count(*) from public.profiles p, r where p.id = r.pid and p.stripe_customer_id is not null) as stripe_customer,
 (select count(*) from public.profiles p, r where p.id = r.pid and p.stripe_account_id is not null) as connect_profile,
 (select count(*) from public.ownership_account_members m, r
   where m.profile_id = r.pid and m.payout_stripe_account_id is not null) as connect_member_payout,
 (select count(*) from public.ownership_accounts a join mine on a.id = mine.account_id
   where not mine.shared and a.stripe_account_id is not null) as connect_sole_account,
 (select count(*) from public.bank_connections b join mine on b.owner_account_id = mine.account_id where not mine.shared)
 + (select count(*) from public.ownership_accounts a join mine on a.id = mine.account_id
   where not mine.shared and a.plaid_access_token is not null) as bank_links,
 (select count(*) from public.documents d, r where d.uploaded_by_profile_id = r.pid) as doc_rows,
 (select count(*) from public.inspection_items i join public.inspections n on n.id = i.inspection_id, r
   where n.inspector_id = r.pid and i.photo_path is not null) as inspection_photos,
 (select count(*) from storage.objects o where o.bucket_id = 'lease-documents'
   and split_part(o.name, '/', 1) in (select id::text from packets)) as lease_files,
 (select count(*) from public.document_signers s, r
   where (s.profile_id = r.pid or lower(s.email) in (select v from e)) and s.status = 'signed') as signed_leases;
```
`lease_files` counts only files in folders of lease packets this person made or was asked to sign
(`lease-documents/<packet id>/…`), so an unrelated lease never stops a request.

**A3 Signed in again?** Run on day 3, day 14, and right before B1.
```sql
select u.last_sign_in_at > r.requested_at as signed_in_after_request,
       exists (select 1 from auth.sessions s where s.user_id = r.profile_id) as has_live_session,
       exists (select 1 from auth.sessions s where s.user_id = r.profile_id and s.updated_at > r.requested_at)
         as session_used_after_request
from public.account_deletion_requests r left join auth.users u on u.id = r.profile_id
where r.id = '<rid>';
```
- `signed_in_after_request` or `session_used_after_request` is `true` → §6 before going on.
- `has_live_session` alone means the button's global sign-out didn't end every session (238b falls back to a local
  sign-out). Nothing to ask the person: B1 and B2 end that session.

**A4 Search.** Run the query in Appendix A. It lists every column where the person's email, name, or phone shows up,
with row ids. Log only the total hit count. A name shorter than 5 characters is skipped by the query; search for it by
hand. A4 is also C3's done-when check. Names or numbers the person used before their current ones are stored nowhere,
so A4 can't search for them. The person can't change their profile without signing in again, which A3 catches.

Then check for **look-alikes**: other people who share this person's name, email, or phone. Any count above 0 means C3
must treat matches on that value with extra care (§8, C3).
```sql
with r as (select profile_id as pid, lower(email_at_request) as req_email
           from public.account_deletion_requests where id = '<rid>'),
me as (select lower(p.full_name) as name, lower(p.email) as email,
              right(regexp_replace(p.phone, '\D', '', 'g'), 10) as phone
       from public.profiles p join r on p.id = r.pid)
select
 (select count(*) from public.profiles o, r, me where o.id <> r.pid and lower(o.full_name) = me.name) as same_name,
 (select count(*) from public.profiles o, r, me
   where o.id <> r.pid and (lower(o.email) = me.email or lower(o.email) = r.req_email)) as same_email,
 (select count(*) from public.profiles o, r, me
   where o.id <> r.pid and right(regexp_replace(o.phone, '\D', '', 'g'), 10) = me.phone) as same_phone;
```

**A5 Baseline.** Log these two counts. D1 compares against them.
```sql
select (select count(*) from storage.objects o where o.bucket_id = 'maintenance-photos'
          and not exists (select 1 from public.maintenance_photos m where m.storage_path = o.name)) as orphan_photos,
       (select count(*) from storage.objects o where o.bucket_id = 'property-files'
          and not exists (select 1 from public.property_files f where f.storage_path = o.name)) as orphan_files;
```

**A6 Owner "go".** Log `A6 ok — owner go` with the date. No "go", no Phase B.

## 4. What happens to each kind of data
Legend: **D** delete · **A** anonymize (keep the row, remove identity) · **S** scrub text (replace the person's email,
name and phone inside free text) · **K** keep. The person's own words in shared records stay for the other people, with
their identity scrubbed.

**Linked rows change automatically. Matching rows are checked first.** A row is *linked* when one of its profile-id
columns points at this person (for example `sender_profile_id`, `invited_profile_id`, `document_signers.profile_id`).
C1 and C2 change only linked rows. A row that merely *contains* their email, name, or phone may belong to someone else:
a look-alike name, a shared family mailbox, a reused phone number. Those rows change only after C3's review says they
mean this person.

| Data | Action | Step |
|---|---|---|
| `profiles` row | **A**: name "Deleted user", email `deleted+<id>@deleted.domusbase.invalid`, contact, photo, Stripe ids, settings cleared | C9 |
| `auth.users` (plus identities, sessions, tokens) | **D** with the Auth admin API | C10 |
| `legal_acceptances` (Terms agreement records, Sprint 259a) | **K**: no name, email or phone; stays linked to the anonymized profile id; the table refuses direct deletes | — |
| `notifications` to them, `notification_preferences`, `autopay_enrollments`, `communication_logs` about them | **D** | C1 |
| `inbox_messages.sender_email` | **A** (null); message text **S**, then **K** | C2 linked, C3 matches |
| `invitations`, `llc_invitations` to them | **A** email → placeholder, name → "Deleted user" | C2 linked, C3 matches |
| `document_signers` (them) | **A** email → placeholder; IP, browser and typed signature → null. A **signed** lease is a tripwire (§13). | C2 linked, C3 matches |
| `feedback` from them, including the "Account deletion requested (…)" row | **A** email, browser, screen size, profile link → null; message **S** then **K** | C2 linked, C3 matches |
| `rental_applications` that are theirs, and their `screening_reports` | **A** name → "Deleted user", email → placeholder, phone → null; notes **S**; screening reports **D** | C3 (no profile link) |
| `account_partners` (them), `ownership_accounts.client_contact_email` they claimed | **A** (partner name → "Deleted user (xxxx)", 4 characters of the row id, since names are unique per LLC) | C2 |
| `vendors` entries and other client contact emails that are them | **A** | C3 |
| All other free text (Appendix A list: repairs, comments, rent notes, payment memos, activity log, audit metadata, manager pay notes, bank memos …) | **S**, then **K** | C3 |
| Manager assignments, pay setups, co-owned LLC membership, pending invitations they sent | set inactive / expired, **K** | C4 |
| Repair photos and home files they uploaded; profile photo | **D** file and row | C5 |
| Stripe customer (tenant) | **D** at Stripe | C6 |
| Stripe payout account (manager, owner, LLC member) | **D** at Stripe once empty; else left with the person at Stripe (§5) | C7 |
| Plaid bank link (sole owner) | removed at Plaid, stored token deleted | C8 (tripwire) |
| Leases, rent, payments, payouts, edit and rent history, repairs, manager and partner pay, bank imports, sole-owner homes | **K**, de-identified through the profile (§10) | — |
| Signed leases: typed signature and files in `lease-documents` | Tripwire (§13): no step until the legal basis is settled | — |
| Audit row written by the button (`request_account_deletion`, metadata `{role}`) | **K** (no personal data) | — |
| Vercel, Sentry and Resend logs | not deleted per person; they expire on each service's schedule | — |
| On their phone | Face ID setting and cookies stay on the device; sign-out already ended the session | — |

## 5. Obligations: contact by day 3, proceed by day 21
Nothing below can block deletion past day 30. On the run date (day 21 at the latest), each one is closed the way the
last column says.

| Obligation (A2) | Day-3 email to | On the run date (day 21 at the latest) |
|---|---|---|
| Active lease as tenant | The person; the home's owner | Deletion goes ahead. The lease and rent stay for the owner to manage. Autopay and the Stripe customer go (C1, C6). |
| Manages homes, or unpaid manager pay | The person; each owner of those homes | C4 sets assignments and pay setups inactive. Unpaid pay stays on record for the owner to settle. |
| Co-owned LLC (`shared_llcs`) | The person; the other active members | C4 removes them from the LLC. The other members keep the homes and must reset each owner's share. |
| Sole owner of homes | The person; on the run date, that home's tenants | Homes and records stay, de-identified. Online rent stops once C7 unlinks the payout account. |
| Money in a Stripe payout account | The person | C7 re-checks daily. Empty → delete it. Not empty by day 28 → unlink in Domus and leave it with the person at Stripe. |

**Day-3 email to the person** (keep the lines that apply):
> Subject: About your request to delete your Domus account
>
> We got your request to delete your Domus account.
> We will finish by <due date>.
> Deleting your account does not end your lease. Talk to your landlord about rent.
> You still manage homes in Domus. We will remove you on <run date>.
> If an owner still owes you pay, ask them before then.
> You share an LLC (a business account) with other owners. We will remove you on <run date>.
> Your homes and their records stay in Domus without your name.
> You still have money in your Stripe payout account. Stripe will send it to your bank.
> Changed your mind? Reply "keep my account" before <run date>.

**Day-3 email to the other people** (one per person; never say why the person left):
> Subject: A Domus account linked to your home is closing
>
> Someone linked to <home name> is closing their Domus account.
> On <run date>, their name will show as "Deleted user".
> Their records for your home stay in Domus.
> (Tenant) Their lease stays active until you end it.
> (Manager) We will remove them as manager. Settle any pay you owe before then.
> (LLC) Please update each owner's share of the rent.

**Run-date email to a sole owner's tenants** (after C7):
> Subject: Your landlord closed their Domus account
>
> The owner of <home name> closed their Domus account.
> Your rent history stays in Domus.
> You can't pay rent online in Domus anymore. Ask your landlord how to pay.

## 6. Signed in again after asking
The button signed them out, but the sign-in still works until C10. If A3 is `true`:
1. Email them (owner sends):
   > Subject: Do you still want your Domus account deleted?
   >
   > You asked us to delete your Domus account on <request date>.
   > Then you signed in again on <sign-in date>.
   > Do you still want it deleted?
   > Reply "keep" to keep your account.
   > If we don't hear back by <reply-by date>, we will delete it.
2. Log `A3 waiting — until <reply-by date>`.
3. Reply "keep" → withdraw (§11). Reply "delete" → go on now. No reply in 7 days → go on. Signing in again during
   the wait is not a reply; only an email answer counts.
4. Check on day 3 and day 14, so a wait ends by day 21. A sign-in first seen right before B1 (day 21 at the latest)
   still leaves 7 days before day 30.

## 7. Phase B — freeze
**B1 Block new sign-ins.** Done when `auth.users.banned_until > now()`, or the auth user is already gone.
```bash
# Load the two values without printing them. Never paste the key anywhere.
export $(/usr/bin/grep -E '^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)=' apps/web/.env.local | xargs)
curl -sS -o /dev/null -w '%{http_code}\n' -X PUT "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/admin/users/<pid from A1>" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" -d '{"ban_duration":"876000h"}'
```
`200` = done. `404` = the auth user is already gone (C10 ran before): skip to the next unfinished step.

**B2 Wait out open sessions.** A ban stops new sign-ins and token refreshes. An access token already issued works until it
expires (this project's JWT expiry; Supabase default 1 hour). Done when `now()` is more than one JWT lifetime past both
B1 and `auth.users.last_sign_in_at`. After B2 the person can't change any data, so the steps below can't race them.

## 8. Phase C — remove (C1 is the point of no return)
Run in order. Each step's SQL is safe to run again: a second run changes 0 rows.

**C1 Delete personal-only rows (linked only).** One statement; it returns how many rows each part deleted. Done when a
second run returns all zeros. (Deleting a notification also deletes its delivery log rows.)
```sql
with r as (select profile_id as pid from public.account_deletion_requests where id = '<rid>'),
d1 as (delete from public.notifications x using r where x.recipient_profile_id = r.pid returning 1),
d2 as (delete from public.notification_preferences x using r where x.profile_id = r.pid returning 1),
d3 as (delete from public.autopay_enrollments x using r where x.tenant_profile_id = r.pid returning 1),
d4 as (delete from public.communication_logs x using r where x.profile_id = r.pid returning 1)
select (select count(*) from d1) as notifications, (select count(*) from d2) as preferences,
       (select count(*) from d3) as autopay, (select count(*) from d4) as communication_logs;
```

**C2 Anonymize identity fields (linked only).** One statement. Done when a second run returns all zeros.
```sql
with r as (select profile_id as pid, lower(email_at_request) as req_email
           from public.account_deletion_requests where id = '<rid>'),
e as (select req_email as v from r
      union select lower(p.email) from public.profiles p join r on p.id = r.pid
      union select lower(u.email) from auth.users u join r on u.id = r.pid),
-- messages they sent
u1 as (update public.inbox_messages x set sender_email = null from r
        where x.sender_profile_id = r.pid and x.sender_email is not null returning 1),
-- invitations they accepted (placeholder holds the row id: the table has a unique key on email)
u2 as (update public.invitations x set email = 'deleted+' || x.id || '@deleted.domusbase.invalid',
              full_name = 'Deleted user', status = case when x.status = 'pending' then 'expired' else x.status end
         from r where x.invited_profile_id = r.pid
          and x.email is distinct from 'deleted+' || x.id || '@deleted.domusbase.invalid' returning 1),
-- their lease signer rows; the typed signature goes too (signed leases are a tripwire, §13)
u3 as (update public.document_signers s set email = 'deleted+' || s.id || '@deleted.domusbase.invalid',
              ip_address = null, user_agent = null, signature_text = null
         from r where s.profile_id = r.pid
          and s.email is distinct from 'deleted+' || s.id || '@deleted.domusbase.invalid' returning 1),
-- their feedback, including the "Account deletion requested (…)" row (its message holds only the role)
u4 as (update public.feedback x set email = null, user_agent = null, viewport = null, profile_id = null
         from r where x.profile_id = r.pid returning 1),
-- their LLC partner entry (names are unique per LLC, so add 4 characters of the row id),
-- and the client contact email of an account they claimed
u5 as (update public.account_partners x set display_name = 'Deleted user (' || left(x.id::text, 4) || ')',
              profile_id = null
         from r where x.profile_id = r.pid returning 1),
u6 as (update public.ownership_accounts x set client_contact_email = null
         from r where x.claimed_by_profile_id = r.pid and lower(x.client_contact_email) in (select v from e) returning 1)
select (select count(*) from u1) as sender_emails, (select count(*) from u2) as invitations,
       (select count(*) from u3) as signers, (select count(*) from u4) as feedback,
       (select count(*) from u5) as partners, (select count(*) from u6) as client_emails;
```

**C3 Review matches, then clean them.** Run A4 (Appendix A). Every row it lists, in every column, is checked by Claude
before anything changes. Open the row in the SQL editor; don't copy its text anywhere. Decide **each mention**, not just
each row: one message can name both this person and a look-alike.
- **A mention means this person** when its context ties it to them: the same lease, home, repair, thread, LLC, or
  application they were part of. An exact email match with no look-alike (A4) and nothing pointing elsewhere also counts.
- **A mention means someone else** when a look-alike exists and the context points to that other person, or the name
  matches but the context is unrelated. Leave it as it is.
- **Unsure:** leave it and ask the owner in chat, naming only the table, row id and mention number. (3.4) A row about
  money or a repair with no link to a lease, charge or ticket (e.g. a notification without `entity_id`) that could fit
  this person or a look-alike is "unsure" — the dry run hit exactly this case.
- **(3.4) A different name on the same row points elsewhere.** A4's look-alike check only compares `profiles`; an exact
  email match on a vendor, contact or application row that carries a **different** name (a shared family mailbox) means
  someone else.
- **Clean only what means this person** (Appendix B):
  - Identity columns (invitations, signers, feedback, sender emails, applications and their screening reports, vendors,
    client contact emails): Part 1, with the ids you confirmed.
  - Free text where **every** mention in the field means this person: Part 2 (replaces them all).
  - Free text that mixes people: Part 3. It lists each mention by number and replaces only the numbers you pick.
- **First-name review:** the first-name query under Appendix A lists rows with the first name alone. Same rules. (3.4) Run it
  over the **full** Appendix A `docs` list, not a subset.
- A phone hit the template can't remove is digits from separate numbers. Check it, then count it as "someone else".
- Log three counts: rows cleaned, rows left with only "someone else" mentions, rows asked about.
- **Done when** a fresh A4 run lists only rows whose remaining mentions were all judged "someone else".

**C3b Gate before C9 (same session as C9).** C9 erases the name and phone that the search needs. So right before C9,
prove nothing of theirs is left while all three are still searchable:
1. Run Appendix A again, in full.
2. Re-check every row it lists, mention by mention, with C3's rules. Each remaining mention must mean someone else.
   Don't rely on matching counts from an earlier session; look again.
3. Any mention that means this person: back to C3.
4. Log `C3b ok — <n> rows re-checked, all someone else`. Then run C9 right away. If the session ends between C3b and
   C9, run C3b again.

**C4 End roles.** One statement inside a transaction. Done when a second run returns all zeros. The `set local` line
lets these updates touch homes in a managed client account (their guard triggers allow it only for non-user callers).
It has no effect elsewhere and ends with the transaction.
```sql
begin;
set local domus.client_sync = 'on';
with r as (select profile_id as pid from public.account_deletion_requests where id = '<rid>'),
u1 as (update public.property_managers x set active = false from r
        where x.active and x.manager_profile_id = r.pid returning 1),
u2 as (update public.ownership_account_managers x set active = false, updated_at = now() from r
        where x.active and x.manager_profile_id = r.pid returning 1),
u3 as (update public.manager_payment_configs x set active = false, updated_at = now() from r
        where x.active and x.manager_profile_id = r.pid returning 1),
-- co-owned LLCs only; a sole owner's membership stays so their homes keep an owner of record
u4 as (update public.ownership_account_members m set active = false from r
        where m.active and m.profile_id = r.pid
          and exists (select 1 from public.ownership_account_members o
                      where o.account_id = m.account_id and o.active and o.profile_id <> r.pid) returning 1),
-- invitations they sent that nobody has used yet
u5 as (update public.invitations x set status = 'expired' from r
        where x.status = 'pending' and x.invited_by = r.pid returning 1),
u6 as (update public.llc_invitations x set status = 'cancelled' from r
        where x.status = 'pending' and x.invited_by = r.pid returning 1)
select (select count(*) from u1) as home_assignments, (select count(*) from u2) as account_assignments,
       (select count(*) from u3) as pay_setups, (select count(*) from u4) as llc_memberships,
       (select count(*) from u5) as invitations, (select count(*) from u6) as llc_invitations;
commit;
```

**C5 Files.** Storage objects carry no `owner_id` today (0 of 4 objects, 2026-10-17), so files are found through the app
rows. Delete the files first, check, then delete the rows.
1. List (bucket, path). `used_by_others` counts rows of other people that point at the same file.
   ```sql
   with r as (select profile_id as pid from public.account_deletion_requests where id = '<rid>'),
   files as (
     select 'maintenance-photos' as bucket, m.storage_path as path from public.maintenance_photos m, r
      where m.uploaded_by_profile_id = r.pid
     union select 'property-files', f.storage_path from public.property_files f, r where f.uploaded_by_profile_id = r.pid
     union select o.bucket_id, o.name from storage.objects o, r
      where o.bucket_id = 'profile-avatars' and o.name like r.pid::text || '/%'
     union select o.bucket_id, o.name from storage.objects o, r where o.owner_id = r.pid::text)
   select f.bucket, f.path,
          (select count(*) from public.maintenance_photos m, r
            where f.bucket = 'maintenance-photos' and m.storage_path = f.path and m.uploaded_by_profile_id <> r.pid)
        + (select count(*) from public.property_files p, r
            where f.bucket = 'property-files' and p.storage_path = f.path and p.uploaded_by_profile_id <> r.pid)
          as used_by_others
   from files f;
   ```
   Split the list in two. **Delete list:** rows with `used_by_others` = 0. **Keep list:** rows above 0. A shared file
   is never sent to Storage; only this person's row goes, in part 4.
2. Delete the files on the delete list **one exact object name per call** (same two values as B1). Never send a
   keep-list path. Never delete from `storage.objects` with SQL: Supabase's docs say that orphans the file. This is the
   call the official client's `remove()` makes (storage-js 2.7.1, `StorageFileApi.js`: `DELETE /object/<bucket>` with
   `{"prefixes": [...]}`). Despite the field name, Supabase's docs show it takes exact object paths.
   ```bash
   curl -sS -X DELETE "$NEXT_PUBLIC_SUPABASE_URL/storage/v1/object/<bucket>" \
     -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
     -H "Content-Type: application/json" -d '{"prefixes":["<exact object name>"]}'
   ```
   The answer lists the objects it deleted. One entry with that exact name = deleted. `[]` = it was already gone; part 3
   confirms it. More than one entry, or an error: stop and log `fail`. The dry run proves this on a shared file.
3. Check both lists against `storage.objects` (same bucket and name). Every delete-list object must be gone. Every
   keep-list object must still be there. (3.4) The profile photo is found only through Storage, so after part 2 it drops
   out of list 1; on resume, check it as "0 objects under `profile-avatars/<pid>/`". After a partial failure, run 1–3 again: list 1 still comes from the rows,
   which part 4 hasn't deleted yet.
4. Delete the rows. An expense that used a deleted file as its receipt keeps its row; the database clears the link
   (`property_expenses.receipt_file_id` is `on delete set null`).
   ```sql
   with r as (select profile_id as pid from public.account_deletion_requests where id = '<rid>'),
   d1 as (delete from public.maintenance_photos x using r where x.uploaded_by_profile_id = r.pid returning 1),
   d2 as (delete from public.property_files x using r where x.uploaded_by_profile_id = r.pid returning 1)
   select (select count(*) from d1) as photos, (select count(*) from d2) as home_files;
   ```
Done when list 1 returns 0 rows.

**C6 Stripe customer (tenant).** Skip if A2 `stripe_customer` = 0. Use the **live-mode** Stripe Dashboard in the
owner's signed-in Chrome (`apps/web/.env.local` holds a test-mode key, so it can't reach live customers). Find the
customer by the id in `profiles.stripe_customer_id` and delete it. (3.4) **Done when** Stripe shows the customer as
deleted: the id stays in `profiles` until C9, so the database can't prove C6 — after a crash, look the id up at Stripe.
Dry runs use the test-mode API instead (`DELETE /v1/customers/<id>` with the `sk_test_` key; done = `deleted: true`). Deleting a customer removes its saved cards and banks
and cancels anything recurring. Stripe keeps its own legally required payment records. Done when the Dashboard shows
the customer as deleted, or a search finds nothing. Never copy the live secret key.

**C7 Stripe payout accounts.** Skip if A2 `connect_profile`, `connect_member_payout` and `connect_sole_account` are all 0.
Find the ids in `profiles.stripe_account_id`, `ownership_account_members.payout_stripe_account_id` (this person), and
`ownership_accounts.stripe_account_id` (only accounts where this person is the sole member). For each, in the live-mode
Dashboard (Connect → the account):
- **Balance zero, no payout on the way:** delete or close the account from its menu. Then clear the id in Domus.
  (3.4) "No payout on the way" = available 0, pending 0, and no payout with status `in_transit`. Dry runs use the
  test-mode API (`GET /v1/balance` and `GET /v1/payouts?status=in_transit` with `Stripe-Account: <id>`, then
  `DELETE /v1/accounts/<id>`). Run the clear statement below from a shell that holds the id in a variable (PostgREST
  `PATCH` with the same filters), so the id is never pasted into chat or SQL text.
- **Money still there:** Stripe pays it out to the person's bank on its normal schedule. Re-check once a day. Delete it
  once it's empty.
- **Still not empty on day 28:** don't wait longer. Clear the id in Domus and leave the account with the person at Stripe.
  Log `C7 ok — left open at Stripe`. The completion email says so.

**One account at a time.** Clear an id in Domus only after **that** account is deleted at Stripe or the day-28 rule
applies to it. Until then the id stays in Domus, so a resumed session can look it up at Stripe again. That is the
recovery path, since the log holds no Stripe ids. Use the statement for that account's kind, with its id:
```sql
-- a manager's own payout account
update public.profiles set stripe_account_id = null, stripe_onboarding_complete = false, stripe_status = null,
       stripe_last_verified_at = null
 where id = (select profile_id from public.account_deletion_requests where id = '<rid>')
   and stripe_account_id = '<acct id>';
-- their payout account as an LLC member
update public.ownership_account_members set payout_stripe_account_id = null
 where profile_id = (select profile_id from public.account_deletion_requests where id = '<rid>')
   and payout_stripe_account_id = '<acct id>';
-- the payout account of an LLC where they are the only active member (C4 already took them out of shared ones)
update public.ownership_accounts a set stripe_account_id = null, stripe_onboarding_complete = false,
       stripe_status = null, stripe_last_verified_at = null
 where a.stripe_account_id = '<acct id>'
   and exists (select 1 from public.ownership_account_members m where m.account_id = a.id
               and m.profile_id = (select profile_id from public.account_deletion_requests where id = '<rid>'))
   and not exists (select 1 from public.ownership_account_members o where o.account_id = a.id and o.active
               and o.profile_id <> (select profile_id from public.account_deletion_requests where id = '<rid>'));
```
Done when A2's three `connect_*` counts are 0.

**C8 Plaid bank link (sole owner).** Skip if A2 `bank_links` = 0 (0 links exist today, 2026-10-17). Otherwise stop: this is a
tripwire (§13).

**C9 Anonymize the profile.** Only right after C3b is logged `ok` in this session. Done when D1's `profile_anonymized`
is true.
```sql
update public.profiles set full_name = 'Deleted user', email = 'deleted+' || id || '@deleted.domusbase.invalid',
       phone = null, nickname = null, avatar_url = null, notification_preferences = '{}'::jsonb,
       notifications_paused_until = null, stripe_customer_id = null, stripe_account_id = null,
       stripe_onboarding_complete = false, stripe_status = null, stripe_last_verified_at = null, ai_consent_at = null
 where id = (select profile_id from public.account_deletion_requests where id = '<rid>')
   and (full_name is distinct from 'Deleted user'
        or email is distinct from 'deleted+' || id || '@deleted.domusbase.invalid'
        or phone is not null or avatar_url is not null or stripe_customer_id is not null
        or stripe_account_id is not null or ai_consent_at is not null);   -- (3.4) a second run changes 0 rows
```
`'{}'` is the column's default (checked 2026-10-17). The placeholder email is unique because it holds the profile id.

**C10 Delete the sign-in.** Removes the auth user, identities, sessions and refresh tokens. No app table has a foreign key
to `auth.users`, so nothing else is touched. Done when the user is gone.
```bash
curl -sS -o /dev/null -w '%{http_code}\n' -X DELETE "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/admin/users/<pid from A1>" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```
`200` = deleted. `404` = already gone (done).

## 9. Phase D — verify, tell, close

**D1 Verify.** Every column must be `true`. If one is `false`, go back to its step. No email until all pass.
```sql
with r as (select profile_id as pid, lower(email_at_request) as e from public.account_deletion_requests where id = '<rid>')
select
 (select p.full_name = 'Deleted user' and p.email = 'deleted+' || p.id || '@deleted.domusbase.invalid'
         and p.phone is null and p.nickname is null and p.avatar_url is null
         and p.notification_preferences = '{}'::jsonb and p.notifications_paused_until is null
         and p.stripe_customer_id is null and p.stripe_account_id is null
         and p.stripe_onboarding_complete = false and p.stripe_status is null
         and p.stripe_last_verified_at is null and p.ai_consent_at is null
    from public.profiles p, r where p.id = r.pid) as profile_anonymized,
 not exists (select 1 from auth.users u, r where u.id = r.pid) as auth_user_gone,
 not exists (select 1 from storage.objects o, r where o.bucket_id = 'profile-avatars' and o.name like r.pid::text || '/%')
   and not exists (select 1 from storage.objects o, r where o.owner_id = r.pid::text) as owned_files_gone,
 not exists (select 1 from public.maintenance_photos m, r where m.uploaded_by_profile_id = r.pid)
   and not exists (select 1 from public.property_files f, r where f.uploaded_by_profile_id = r.pid) as file_rows_gone,
 not exists (select 1 from public.notifications n, r where n.recipient_profile_id = r.pid)
   and not exists (select 1 from public.notification_preferences n, r where n.profile_id = r.pid)
   and not exists (select 1 from public.autopay_enrollments a, r where a.tenant_profile_id = r.pid)
   and not exists (select 1 from public.communication_logs c, r where c.profile_id = r.pid) as personal_rows_gone,
 not exists (select 1 from public.property_managers x, r where x.manager_profile_id = r.pid and x.active)
   and not exists (select 1 from public.ownership_account_managers x, r where x.manager_profile_id = r.pid and x.active)
   as roles_ended,
 not exists (select 1 from public.ownership_account_members m, r
             where m.profile_id = r.pid and m.payout_stripe_account_id is not null) as payout_ids_cleared;
```
Also, all three must hold:
- A5's two orphan counts are no higher than the baseline. Higher means a file lost its row but not its object: C5.
- C3b is logged `ok`. That is the proof for email, name and phone.
- Appendix A, run again, lists only rows whose mentions were judged "someone else". After C9 and C10 it can only
  search the request's email, so this is an extra email check, not proof for the name or phone.
- The log shows C6, C7 and C8 as `ok` or `skip`.

**D2 Pick the completion email lines** from what was really kept:
```sql
with r as (select profile_id as pid from public.account_deletion_requests where id = '<rid>')
select
 (select count(*) from public.leases l, r where l.tenant_profile_id = r.pid)
 + (select count(*) from public.manager_payments x, r where x.manager_profile_id = r.pid)
 + (select count(*) from public.maintenance_tickets t, r where t.tenant_profile_id = r.pid)
 + (select count(*) from public.ownership_account_members m, r where m.profile_id = r.pid) as kept_records,
 (select count(*) from public.inbox_messages m, r where m.sender_profile_id = r.pid)
 + (select count(*) from public.maintenance_comments c, r where c.author_id = r.pid) as kept_messages,
 (select count(*) from public.document_signers s join public.document_packets k on k.id = s.packet_id, r
   where s.profile_id = r.pid and s.status = 'signed' and k.status = 'signed') as signed_leases;
```
Plus: did C5 delete any files, and is C7 logged `left open at Stripe`?

**D3 Send the completion email** (owner, from support@domusbase.com, to `email_at_request`; §12). If it bounces, log
`D3 ok — bounced` and go on.

**D4 Close the request** in one statement. This also clears the queue's own personal data.
```sql
update public.account_deletion_requests
   set status = 'done', handled_at = now(), confirmation_sent_at = <time D3 was sent>,
       email_at_request = null, profile_id = null
 where id = '<rid>' and status = 'open';
```
Done when the row shows `done` with both fields null. Then add a one-line handoff entry: request id, "done", date.

## 10. What we keep, and why
The owner decided on 2026-10-07 to keep shared rent, payment and repair records, without the person's name or contact
details. The lawyer has not yet set how long (the legal draft suggests 7 years). Until then nothing kept is purged.

| Kept | Why | Personal details left in it |
|---|---|---|
| Leases, rent, payments, payouts, rent and edit history, manager and partner pay, bank imports | Money and tax records for the other people involved | None after C3 and C9. Free text (rent notes, payment memos, bank memos) is scrubbed. |
| Repairs, repair comments, messages | The other person's record of the home and the talk | None after C3. Their words stay, minus email, name and phone. |
| Activity log and audit metadata | Who did what, for security | None after C3. Keys like `tenantEmail`, `managerEmail`, `ownerEmail`, `name` are scrubbed when they hold this person. |
| Sole-owner homes | Records of the tenants and partners who used them | None after C3 and C9. |
| Terms agreement records (`legal_acceptances`) | Proof of which Terms version the person agreed to, if a claim about their use of Domus comes later | None: versions, document hashes, role, web or iPhone, times and the deploy commit. Kept 10 years after closure, then purged with the owner's approval; a legal hold skips the purge (Sprint 259a decision; the Privacy rewrite says so). |

**Signed leases are not kept by default.** Apple's rule 5.1.1(v) allows keeping only what we must keep by law. Nobody has
confirmed yet that Domus must keep a signed lease. So a signed lease (a typed signature or a file in `lease-documents`)
is a tripwire (§13). Before the first request that has one, the owner chooses: the lawyer confirms we must keep it and
for how long, or we delete it. Today none exist: 0 packets, 0 signers, and no app code writes `lease-documents` files
(2026-10-17).

## 11. Withdrawn requests
- **Before B1:** set `status = 'withdrawn'`, `handled_at = now()`, `email_at_request = null`. They sign in again with
  "Forgot password?" or a magic link.
- **After B1, before C1:** do the same, then lift the ban: the B1 call with `{"ban_duration":"none"}`.
- **After C1:** too late to undo. Finish the steps, then tell them in the completion email.
Log `withdrawn` with the date.

## 12. Completion email
Send only after D1 passes. From support@domusbase.com, to `email_at_request`. Keep the lines that match D2.
> Subject: Your Domus account is deleted
>
> Hi,
>
> We deleted your Domus account. You can't sign in anymore.
> We removed your name, email, and phone number from your profile.
> *(files deleted)* We deleted the photos and files you added.
> *(kept_records > 0)* We kept rent, payment, and repair records for the other people involved.
> *(kept_records > 0)* We took your name, email, and phone off them.
> *(kept_messages > 0)* Messages you sent stay for the people you wrote to.
> *(kept_messages > 0)* We took your name, email, and phone out of them.
> *(signed lease kept, lawyer confirmed, §13)* The law makes us keep your signed lease.
> *(signed lease kept, lawyer confirmed, §13)* It shows your name and signature. Only the home's owner and manager see it.
> *(C7 left open)* Your Stripe payout account is still open at Stripe.
> *(C7 left open)* Stripe will send the money in it to your bank.
> *(C7 left open)* Stripe support can help you close it.
>
> Questions? Just reply to this email.
>
> Domus Support

Every sentence is 12 words or fewer. Don't add a line that D2 doesn't support.

## 13. Tripwires: stop and extend this runbook
These kinds of data have no tested steps yet, because none exist today (2026-10-17). If A2 counts any of them, stop
before Phase B. Write the missing step as a reviewed addendum (rev 3.x), then go on. Day 21 still holds.
| A2 count | Why it stops | Today |
|---|---|---|
| `bank_links` | Removing a Plaid link needs a one-off script that decrypts the stored token. Plaid keys live only in Vercel. | 0 |
| `doc_rows` | No app code writes `documents`; the bucket for its files is unknown. | 0 rows |
| `inspection_photos` | No app code writes `inspection_items.photo_path`; bucket unknown. | 0 |
| `signed_leases` | Keeping a signature needs a legal basis nobody has confirmed (§10). The owner picks: lawyer confirms keep (with the rule), or delete. | 0 signers |
| `lease_files` | Same as `signed_leases`; also no app code writes `lease-documents`, so the file path is new. | 0 objects |

A "keep" answer for signed leases changes C2's and Appendix B's `signature_text = null` for signed rows only. Write
that change, the lawyer's rule, and the completion-email lines into the addendum.

## 14. Code-side checks already verified (Sprint 238b review)
Verified in the 238b review (commit `cda681a`, security PASS). The live table was checked on 2026-10-17.
- **Rate limit:** `checkRateLimit("requestAccountDeletion:<user id>", 3, 10 minutes)`. It lives in server memory, so it
  is per instance. The hard stop is the unique index `account_deletion_requests_one_open`: one open request per person.
- **CSRF:** it is a Next.js server action. Next.js checks that the Origin matches the Host. `next.config.mjs` adds no
  `allowedOrigins`. The person must also type `DELETE`.
- **Identity:** user id, email and role come from the session (`requireAuth`). Other form fields are ignored. The test
  suite includes a forged-field test.
- **Database access:** the insert uses the service-role client after `requireAuth`. Clients have no grants.
- **Logs:** failures log only an error code and message. No email is logged.
- **Re-check (expect 0 rows, then `true`):**
  ```sql
  select grantee, privilege_type from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'account_deletion_requests'
     and grantee in ('anon', 'authenticated', 'PUBLIC');
  select relrowsecurity from pg_class where oid = 'public.account_deletion_requests'::regclass;
  ```
  2026-10-17 result: no grants, RLS on, 0 policies.

## 15. Dry run on a disposable fixture (before the first real request)
Claude runs this only after the owner says "go" for the dry run. It must pass before any real request reaches Phase B.
The owner's "go" covers creating and later removing the three test accounts below.

**Fixture.** Built only from new test accounts in the `+walk`/`+smoke` style. Never the smoke accounts: smoke tests
depend on them.
- **X** (the person deleting): `richard.ace.smith+deldry1@gmail.com`, created with the Auth admin API, no password.
  Sign in with a server-generated magic link. Name "Dana Drytest", phone "(555) 010-0199".
- **Y** (the other person): `richard.ace.smith+deldry2@gmail.com`, made the same way.
- **X as owner:** sole member of LLC "Dry Run A" with home A, plus a test-mode Stripe account id. Member of "Dry Run B"
  with Y, 50/50, with a test-mode payout id.
- **X as manager:** manages Y's home C, with a pay setup and one pending manager payment.
- **X as tenant:** active lease at home C. A rent note with X's name and a payment memo with X's phone. A test-mode
  Stripe customer with a test card.
- **Text and files:** messages between X and Y, where Y writes X's name and phone. A repair by X with Y's comment
  holding X's email. One photo by X, one by Y. A home file and a profile photo by X. A feedback row. A notification to
  each, Y's naming X. An audit row with `tenantEmail` = X's email. An invitation to X's email. One unsigned lease
  packet with X as signer.
- **Look-alikes (the collision test):** **Z** = `richard.ace.smith+deldry3@gmail.com`, also named "Dana Drytest", with
  X's phone number (a reused number). Z writes to Y, signing with that name and number. Y's vendor list has a contact
  "Sam Drytest" with X's exact email (a shared family mailbox). One message from Y names both in one field: "Dana
  Drytest fixed the sink. Dana Drytest from unit 2 paid." The first means X, the second Z.
- **Shared file:** one repair photo object with two rows pointing at it, one uploaded by X and one by Y.
- **Tripwire test:** a second, separate run of A2 against a signed packet for X must stop before Phase B (§13).
  Delete that packet before the main run.
- X presses "Delete my account" in the app (the real button). Then X signs in again, to trigger A3.

**Run.** Phases A–D exactly as written, with `<rid>` = X's request. Stripe steps use the **test-mode** Dashboard. Day
waits are skipped and logged `skip — dry run`. Emails are drafted, never sent.
**Stop on purpose twice** and resume in a fresh session from the log only: once after C5 part 2 (files gone, rows still
there), and once after the C6 Stripe delete but before logging it.

**Pass when all are true:**
1. D1 is all `true`. Appendix A finds X's email, name and phone only in rows judged "someone else".
2. Y's and Z's rows are intact. Before/after counts and text match for their messages, comments, photo, lease, charges,
   payments, homes and LLC B membership. Z's name and number and the "Sam Drytest" vendor row are unchanged. In Y's
   two-name message only the first mention changed. The shared photo object and Y's row for it remain, and Y can
   still open it in the app.
   C3b ran right before C9 and found only Z's mentions and the vendor row.
3. LLC B lost X as a member. Home A still has its records. X's test Stripe customer and accounts are deleted.
4. Every step's second run changes 0 rows or returns "already done". Both forced stops resume with no error and no
   repeated work.
5. The log holds only the request id: no `@`, no "Drytest", no 10-digit numbers.
6. `npm run smoke:web` is green afterwards.

**Result (2026-10-18): PASS** — request `407bebfe-ed06-48cc-9034-9b98040f4651`; all 6 checks met; both forced stops
resumed in fresh sessions from the log only; tripwire stopped before B; fixture removed (0 rows, 0 files, 0 sign-ins left;
Stripe test objects deleted). Fixes folded in as rev 3.4 (marked "(3.4)").

**After.** Log the result in the handoff. Then remove the whole fixture (X, Y, Z, homes, leases, packets, files). Use a
cleanup script limited to rows tied to the three fixture profile ids. Fixes found by the dry run go into this runbook
before the first real request.

## 16. Backups
Supabase backups keep old copies until they age out. If a backup is ever restored, the restored request rows are open
again. Re-run this runbook for every request the log shows as finished after that backup's time.

## Appendix A — search query (A4, C3 check, D1 email check)
Returns, per `table.column` and kind of match, the hit count and row ids. Never the text.
```sql
with r as (select id, profile_id as pid, lower(email_at_request) as req_email
           from public.account_deletion_requests where id = '<rid>'),
n as (
  select distinct kind, val from (
              select 'email' as kind, r.req_email as val from r
    union all select 'email', lower(p.email) from public.profiles p join r on p.id = r.pid
    union all select 'email', lower(u.email) from auth.users u join r on u.id = r.pid
    union all select 'name', p.full_name from public.profiles p join r on p.id = r.pid
    union all select 'name', p.nickname from public.profiles p join r on p.id = r.pid
    union all select 'phone', right(regexp_replace(p.phone, '\D', '', 'g'), 10) from public.profiles p join r on p.id = r.pid
    union all select 'phone', right(regexp_replace(u.phone, '\D', '', 'g'), 10) from auth.users u join r on u.id = r.pid
  ) x
  where val is not null and val not like 'deleted+%' and val <> 'Deleted user'
    and ((kind = 'phone' and length(val) = 10) or (kind <> 'phone' and length(trim(val)) >= 5))
),
docs(src, id, txt) as (
            select 'inbox_messages.body', id, body from public.inbox_messages
  union all select 'inbox_messages.sender_email', id, sender_email from public.inbox_messages
  union all select 'inbox_threads.subject', id, subject from public.inbox_threads
  union all select 'maintenance_tickets.title', id, title from public.maintenance_tickets
  union all select 'maintenance_tickets.description', id, description from public.maintenance_tickets
  union all select 'maintenance_comments.body', id, body from public.maintenance_comments
  union all select 'maintenance_status_history.notes', id, notes from public.maintenance_status_history
  union all select 'maintenance_photos.caption', id, caption from public.maintenance_photos
  union all select 'maintenance_photos.file_name', id, file_name from public.maintenance_photos
  union all select 'rent_charges.notes', id, notes from public.rent_charges
  union all select 'rent_charge_lines.label', id, label from public.rent_charge_lines
  union all select 'payments.reference_note', id, reference_note from public.payments
  union all select 'charge_edit_history.old_value', id, old_value from public.charge_edit_history
  union all select 'charge_edit_history.new_value', id, new_value from public.charge_edit_history
  union all select 'charge_edit_history.reason', id, reason from public.charge_edit_history
  union all select 'rent_increase_history.reason', id, reason from public.rent_increase_history
  union all select 'manager_payments.description', id, description from public.manager_payments
  union all select 'manager_payments.notes', id, notes from public.manager_payments
  union all select 'partner_payments.note', id, note from public.partner_payments
  union all select 'withdrawal_requests.reason', id, reason from public.withdrawal_requests
  union all select 'tenant_activity_log.title', id, title from public.tenant_activity_log
  union all select 'tenant_activity_log.description', id, description from public.tenant_activity_log
  union all select 'audit_logs.metadata', id, metadata::text from public.audit_logs
  union all select 'application_events.message', id, message from public.application_events
  union all select 'application_events.metadata', id, metadata::text from public.application_events
  union all select 'feedback.message', id, message from public.feedback
  union all select 'feedback.email', id, email from public.feedback
  union all select 'notifications.title', id, title from public.notifications
  union all select 'notifications.body', id, body from public.notifications
  union all select 'announcements.title', id, title from public.announcements
  union all select 'announcements.body', id, body from public.announcements
  union all select 'communication_logs.subject', id, subject from public.communication_logs
  union all select 'communication_logs.body', id, body from public.communication_logs
  union all select 'invitations.email', id, email from public.invitations
  union all select 'invitations.full_name', id, full_name from public.invitations
  union all select 'llc_invitations.email', id, email from public.llc_invitations
  union all select 'document_signers.email', id, email from public.document_signers
  union all select 'document_signers.signature_text', id, signature_text from public.document_signers
  union all select 'rental_applications.applicant_email', id, applicant_email from public.rental_applications
  union all select 'rental_applications.applicant_name', id, applicant_name from public.rental_applications
  union all select 'rental_applications.applicant_phone', id, applicant_phone from public.rental_applications
  union all select 'rental_applications.notes', id, notes from public.rental_applications
  union all select 'screening_reports.summary', id, summary from public.screening_reports
  union all select 'screening_reports.raw_payload', id, raw_payload::text from public.screening_reports
  union all select 'inspections.notes', id, notes from public.inspections
  union all select 'inspection_items.notes', id, notes from public.inspection_items
  union all select 'vendors.name', id, name from public.vendors
  union all select 'vendors.email', id, email from public.vendors
  union all select 'vendors.phone', id, phone from public.vendors
  union all select 'account_partners.display_name', id, display_name from public.account_partners
  union all select 'ownership_accounts.display_name', id, display_name from public.ownership_accounts
  union all select 'ownership_accounts.client_contact_email', id, client_contact_email from public.ownership_accounts
  union all select 'account_rename_requests.proposed_name', id, proposed_name from public.account_rename_requests
  union all select 'account_rename_requests.current_name', id, current_name from public.account_rename_requests
  union all select 'account_tasks.title', id, title from public.account_tasks
  union all select 'property_files.file_name', id, file_name from public.property_files
  union all select 'property_files.description', id, description from public.property_files
  union all select 'property_expenses.description', id, description from public.property_expenses
  union all select 'bank_transactions.description', id, description from public.bank_transactions
  union all select 'bank_review_items.description', id, description from public.bank_review_items
  union all select 'bank_rules.match_text', id, match_text from public.bank_rules
  union all select 'bank_accounts.nickname', id, nickname from public.bank_accounts
  union all select 'properties.name', id, name from public.properties
  union all select 'rental_listings.description', id, description from public.rental_listings
  union all select 'preventive_maintenance_schedules.title', id, title from public.preventive_maintenance_schedules
  union all select 'preventive_maintenance_schedules.description', id, description
              from public.preventive_maintenance_schedules
  union all select 'document_templates.body_markdown', id, body_markdown from public.document_templates
  union all select 'message_deliveries.error_message', id, error_message from public.message_deliveries
  union all select 'notification_deliveries.error_message', id, error_message from public.notification_deliveries
  union all select 'automation_runs.error_message', id, error_message from public.automation_runs
)
select d.src, n.kind, count(distinct d.id) as hits, array_agg(distinct d.id) as ids
from docs d join n on d.txt is not null and (
     (n.kind <> 'phone' and strpos(lower(d.txt), lower(n.val)) > 0)
  or (n.kind = 'phone' and strpos(regexp_replace(d.txt, '\D', '', 'g'), n.val) > 0))
group by d.src, n.kind order by d.src, n.kind;
```
**First-name review (C3):** same `r` and `docs`, with `n` replaced by
`select 'first' as kind, split_part(full_name, ' ', 1) as val from public.profiles p join r on p.id = r.pid
where length(split_part(full_name, ' ', 1)) >= 3`. Keep only rows that the main query didn't list.

**D1 check:** run the main query again unchanged. After C9 and C10 its `n` holds only the request's email.

## Appendix B — cleaning confirmed rows (C3)
Use only row ids that C3's review confirmed mean this person. Swap `<ids>` for those ids, as `{id1,id2}`. Run only the
lines you need. A second run changes nothing.

**Part 1 — identity columns.** Placeholder emails hold the row's own id, because `invitations`, `document_signers` and
`llc_invitations` have unique keys that include the email.
```sql
-- invitations sent to them
update public.invitations set email = 'deleted+' || id || '@deleted.domusbase.invalid', full_name = 'Deleted user',
       status = case when status = 'pending' then 'expired' else status end
 where id = any('<ids>'::uuid[]);
-- LLC invitations sent to them
update public.llc_invitations set email = 'deleted+' || id || '@deleted.domusbase.invalid',
       status = case when status = 'pending' then 'cancelled' else status end
 where id = any('<ids>'::uuid[]);
-- lease signer rows matched by email only (a signed one is a tripwire, §13)
update public.document_signers set email = 'deleted+' || id || '@deleted.domusbase.invalid', ip_address = null,
       user_agent = null, signature_text = null
 where id = any('<ids>'::uuid[]);
-- feedback and message sender emails matched by email only
update public.feedback set email = null, user_agent = null, viewport = null where id = any('<ids>'::uuid[]);
update public.inbox_messages set sender_email = null where id = any('<ids>'::uuid[]);
-- their rental applications: screening reports first, then the application's identity (email can't be null)
delete from public.screening_reports where application_id = any('<ids>'::uuid[]);
update public.rental_applications set applicant_name = 'Deleted user',
       applicant_email = 'deleted+' || id || '@deleted.domusbase.invalid', applicant_phone = null
 where id = any('<ids>'::uuid[]);
-- vendor entries and client contact emails that are them
update public.vendors set name = 'Deleted user', email = null, phone = null where id = any('<ids>'::uuid[]);
update public.ownership_accounts set client_contact_email = null where id = any('<ids>'::uuid[]);
```

**Part 2 — free text.** Swap `<table>`, `<column>` and `<ids>`. Emails and phones become `[removed]`; names become
"Deleted user".
```sql
with r as (select profile_id as pid, lower(email_at_request) as req_email
           from public.account_deletion_requests where id = '<rid>'),
n as (<the n CTE from Appendix A>),
esc as (select kind, val, regexp_replace(val, '([.^$|?*+()\[\]{}\\-])', '\\\1', 'g') as v from n),
pat as (select
  (select string_agg(v, '|') from esc where kind = 'name') as name_re,
  (select string_agg(case kind when 'phone' then array_to_string(regexp_split_to_array(val, ''), '\D{0,3}') else v end, '|')
     from esc where kind in ('email', 'phone')) as contact_re)
update public.<table> x
   set <column> = regexp_replace(regexp_replace(x.<column>, coalesce(pat.contact_re, 'a^'), '[removed]', 'gi'),
                                 coalesce(pat.name_re, 'a^'), 'Deleted user', 'gi')
  from pat
 where x.id = any('<ids>'::uuid[]);
```
For a `jsonb` column (`audit_logs.metadata`, `application_events.metadata`, `screening_reports.raw_payload`), wrap it:
`set <column> = regexp_replace(regexp_replace(x.<column>::text, …), …)::jsonb`. If the cast fails, nothing changes.
Scrub that row by hand.
`'a^'` is a pattern that never matches. It stands in when the person has no name or no phone on file. The template was
tested on sample text on 2026-10-17: emails, names, three phone formats and JSON text came out right; empty text and
near-misses stayed as they were.

**Part 3 — one mention at a time** (a field that also names someone else). Use the same `r`, `n`, `esc` and `pat` CTEs
as Part 2. First list the mentions in one field of one row:
```sql
with r as (…), n as (…), esc as (…), pat as (…),   -- exactly as in Part 2
f as (select x.<column> as txt from public.<table> x where x.id = '<row id>'),
k(kind, re) as (select 'contact', contact_re from pat union all select 'name', name_re from pat)
select md5(f.txt) as field_hash, k.kind, g.n as mention, regexp_instr(f.txt, k.re, 1, g.n, 0, 'i') as at_char,
       length(regexp_substr(f.txt, k.re, 1, g.n, 'i')) as len
from f, k, generate_series(1, regexp_count(f.txt, k.re, 1, 'i')) as g(n)
where k.re is not null order by at_char;
```
Read the row and pick the mentions that mean this person. `field_hash` fingerprints the whole field exactly as you
reviewed it. Replace **one mention per statement**. `<replacement>` is `[removed]` for a contact mention and
`Deleted user` for a name mention; `<kind>_re` is `contact_re` or `name_re` to match.
```sql
with r as (…), n as (…), esc as (…), pat as (…)   -- exactly as in Part 2
update public.<table> x
   set <column> = overlay(x.<column> placing '<replacement>' from <at_char> for <len>)
  from pat
 where x.id = '<row id>'
   and md5(x.<column>) = '<field_hash>'
   and substring(x.<column> from <at_char> for <len>) ~* ('^(' || pat.<kind>_re || ')$');
```
The last two lines are guards. The row changes only if the whole field is still exactly the text you reviewed, and
that spot still holds the person's identifier. Each replacement changes the field, so **list the mentions again after
each one**. That gives a fresh `field_hash` and fresh positions for the next. A statement that changes 0 rows means the
field changed since your review: read the row again and redo its review. Tested on sample text on 2026-10-17: a
sentence naming two "Dana Drytest"s changed only the picked mention, and a second run changed nothing. A field
rewritten to put the same name at the same spot failed the `field_hash` check, as it should. For a `jsonb`
field that mixes people, change the one key by hand with `jsonb_set`, under the same whole-field check.
