# Runbook — App Review demo seed (Sprint 238g)

Claude runs this. Codex never runs the seed. Nothing here sends email or notifications.

## Before the first run
1. The owner picks two demo emails that contain `appreview` and sets `APPREVIEW_OWNER_EMAIL` and
   `APPREVIEW_TENANT_EMAIL` in `apps/web/.env.local` (one owner step).
2. `apps/web/.env.local` must be mode 600 (`stat -f %Sp apps/web/.env.local` → `-rw-------`). Set 2026-10-16.
3. Dry run: `node scripts/seed-appreview-accounts.mjs --dry-run` with the env loaded. Read the plan; it writes nothing.

## Run
1. `set -a; . apps/web/.env.local; set +a; node scripts/seed-appreview-accounts.mjs`.
2. Expect `[appreview-seed]` created/updated/existing lines and `<role> password: saved … (not shown)`.
3. Second run must print only `existing` lines.

## After the run (before giving App Review anything)
1. Sign-in check without printing secrets: a short Node script calls `signInWithPassword` for each demo user with the
   env values and prints only `ok`/`failed` and the role.
2. SQL check (read-only): each demo user has exactly the demo graph — one account membership (owner), one active lease
   (tenant), no `property_managers` rows, no accepted invitations.
3. Simulator walk as each demo user over every path in `docs/app-store/app-review-notes.md` 1c and 2c.

## If the seed refuses with "unexpected access for <role>"
The sign-up trigger accepted a real pending invitation in the moment between the seed's check and user creation.
1. Do not rerun. Record the printed ids (auth user id, invitation ids, membership/assignment/lease ids).
2. Read those rows. Confirm each invitation row's `invited_by`, `property_id`/`ownership_account_id` and the real person
   it was meant for.
3. Remove only the access rows that point at the demo user id (memberships, `property_managers`, leases created for it).
4. Set each affected invitation back to `pending` with `accepted_at` and `invited_profile_id` null, so the real person
   can still accept it.
5. Delete the demo auth user and its profile. Re-check that no row anywhere references the demo user id.
6. Write a handoff entry with what changed. Rerun the seed only after the inviter's invitation is accepted or revoked.
