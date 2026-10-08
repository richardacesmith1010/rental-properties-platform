# Sprint 201 — Safe "Copy link" for pending invites (L3: invites/auth) · Category 4 (Onboarding)

## 1. Objective
When an invite email lands in spam or never arrives, the owner (or manager) is stuck. Add a **Copy link** button on each pending invite. The link opens a public Domus **join page** that shows the invite and lets the invitee **get a fresh sign-in email** with clear "check spam" help.
**The link is NOT a sign-in credential** (user decision 2026-10-07): it can never sign anyone in, set a password or reveal the full email. Only the invitee's inbox can complete sign-in.

## 2. Context (verified live 2026-10-07)
- `public.invitations`: `id uuid default gen_random_uuid()`, `email`, `full_name`, `role` (tenant|manager|owner), `property_id`, `invited_by`, `status` (default `'pending'`; also `accepted`, `revoked`/`expired` per the UI), `invited_profile_id`, `created_at`, `accepted_at`, `ownership_account_id`. There is **no token column**. The invite `id` (random UUID v4) is the join-link key; no schema change.
- Invites are sent by Supabase: `admin.auth.admin.inviteUserByEmail` (`app/actions/invitations.ts` managers/owners) and, for tenants, a branded email via `createTenantInviteLink` / `sendTenantInviteEmail` with a Supabase fallback (`app/actions/tenant-invitations.ts`). Domus never stores the Supabase action link.
- `resendInvite(prev, formData)` (`app/actions/tenant-invitations.ts:276`): `requireAuth("owner","manager")`, rate limit `invite:resend:<userId>` 20/h, loads the invite **scoped by `invited_by = user.id`**, refuses `accepted`, re-sends by role (tenant branded path + fallbacks; others `inviteUserByEmail`), updates a resend timestamp, returns `"Invitation resent."`.
- Owner UI: `components/dashboard/invitations-panel.tsx` (pending rows; status labels incl. "Revoked").
- Notifications are OFF, but **invite emails are allowed** (the switch does not cover them).
- Plain-language rules; hardened auth helpers (S197); `checkRateLimit` is in-memory per server instance.

## 3. In scope
1. **Shared resend core.** Extract the email-sending part of `resendInvite` into a server-only module `apps/web/lib/invite-resend.ts` (`import "server-only"`): `resendInvitationEmail(invitation, inviterProfileId)` → `{ ok: true } | { ok: false }`. It is byte-for-byte the same logic, with `inviterProfileId` replacing `user.id` where the inviter is needed (e.g. `buildTenantResendPayload({ currentUserId })`). `resendInvite` keeps its auth, scoping, rate limit, messages and timestamp update, and calls the core. **Owner-path behavior must not change** (existing tests stay green).
2. **Join page** `apps/web/app/join/[inviteId]/page.tsx` (public, `export const dynamic = "force-dynamic"`, `robots: { index: false, follow: false }`):
   - Validate `inviteId` is a UUID; otherwise show the inactive state.
   - Load with the admin client and **explicit columns**: `id, email, role, status, created_at, property_id, invited_by`, plus the property name and the inviter's `full_name` (first word only).
   - **Active** = `status === "pending"` and `created_at` within **30 days**. Show:
     - title `You're invited to Domus`
     - `{Inviter first name} invited you to {Home name}.` (omit the home part if there is no property)
     - `We emailed a sign-in link to {masked email}.` Mask: first letter of the local part + `***@` + the first letter of the domain + `***` + the TLD, e.g. `j***@g***.com`.
     - button `Email me a new link`
     - help: `Check your spam or junk folder. The email comes from Domus.`
   - **Accepted:** `This invite was already used.` + link `Sign in` → `/login`.
   - **Anything else** (revoked, expired, older than 30 days, not found): `This invite is no longer active. Ask the person who invited you for a new one.` The same text for every case, so ids can't be probed.
   - Never render the full email, the invitee's name, ids, or anything else from the row.
3. **Public resend action** `apps/web/app/actions/join-invite.ts` (`"use server"`): `resendFromJoinLink(prev, formData)`:
   - Input: `inviteId` only (Zod UUID). The email is **never** taken from input.
   - Rate limits: `join-resend:invite:<inviteId>` **3 per hour** and `join-resend:ip:<ip>` **10 per hour** (IP from `headers()` `x-forwarded-for` first value; if missing, use `"unknown"`). Over either → `{ success: false, error: "Too many emails. Try again in an hour." }`.
   - Re-load the invite (explicit columns); require active per §3.2; otherwise return the generic inactive message (no details).
   - Call `resendInvitationEmail(invitation, invitation.invited_by)`; on success update the same resend timestamp column `resendInvite` updates (check the error, L-002) and return `{ success: true, message: "Sent. Check your email in a few minutes." }`; on failure `{ success: false, error: "Could not send. Please try again." }`.
   - Every return string is listed here (L-020). No other strings reach the UI.
4. **Copy link button** in `invitations-panel.tsx` on **pending** rows only: label `Copy link`, title `Copy a join link you can text.` Copies `${NEXT_PUBLIC_APP_URL ?? "https://domusbase.com"}/join/${invitation.id}` via `navigator.clipboard.writeText`; success toast `Link copied. Text it to them.`; failure toast `Could not copy. Try again.` Only render it when the row's inviter is the current user. If the panel's data isn't already scoped to `invited_by = current user`, scope the button by an `invitedBy` field instead; say which.
5. **Tests** (real assertions):
   - core extraction: existing `resendInvite` tests unchanged and green; a test that `resendInvite` still refuses another inviter's invite (scoped by `invited_by`).
   - join page: active shows masked email + inviter first name + home; full email/name never in output; accepted state; revoked/expired/>30 days/not found/bad UUID all show the **same** inactive text; `noindex` metadata.
   - mask function: `john@gmail.com` → `j***@g***.com`; `a@b.co` → `a***@b***.co`; subdomains `x@mail.example.org` → `x***@m***.org`.
   - public action: email never read from input (an extra `email` field is ignored); invite rate limit (4th within the hour → error, core not called); IP rate limit; inactive invite → generic message, core not called; success → core called with `invited_by` and the timestamp updated; core failure → error.
   - panel: `Copy link` only on pending rows created by the viewer; clipboard called with the exact URL; both toasts.

## 4. Out of scope
Schema changes; owner-role (co-owner) invites (button only for tenant and manager rows); LLC invites (`/join-llc`); SMS; changing the email templates; notifications (OFF); generating or exposing Supabase action links anywhere.

## 5. Exact files expected to change
New: `apps/web/lib/invite-resend.ts`, `apps/web/app/join/[inviteId]/page.tsx`, `apps/web/app/actions/join-invite.ts`, a small mask helper (e.g. `apps/web/lib/mask-email.ts`), and tests. Changed: `apps/web/app/actions/tenant-invitations.ts` (call the core), `apps/web/components/dashboard/invitations-panel.tsx`, the validations module for the Zod schema, and `apps/web/middleware.ts` **only if** `/join` is treated as protected (it must be public; say what you found).

## 6. Implementation requirements
Exact copy; sentences ≤ 12 words; plain-language guard passes. Lines ≤ 140; files ≤ 500; no new dependencies; no `eslint-disable`. Every Supabase result checked. The user should never need to read instructions to complete this flow. Every step must be self-explanatory.

## 7. Validation commands to run
`npm run lint:web`; `npx tsc --noEmit -p apps/web/tsconfig.json`; the new tests + every test importing changed files; `lib/__tests__/plain-language.test.ts`; `npm run build --workspace @domus/web`.

## 8. Acceptance criteria (binary)
1. The join link never signs anyone in and never reveals the full email, name or ids; only the stored email receives the new link.
2. Active/accepted/inactive states and the 30-day limit behave as in §3.2; inactive cases are indistinguishable.
3. Public resend is rate-limited per invite (3/h) and per IP (10/h), takes only the invite id, and its strings are exactly §3.3.
4. Owner `resendInvite` behavior is unchanged (tests green); `Copy link` appears only on the viewer's pending tenant/manager invites and copies the exact URL.
5. All §3.5 tests are real assertions; lint, typecheck, guard and build pass; only §5 files changed.

## 8b. Post-deploy verification (Claude only; creates no new real accounts)
Use an existing pending smoke invite if one exists (check SQL); otherwise verify with a non-existent UUID (inactive) and an accepted one (accepted state) only. Check the masked email display, noindex, phone 375 + desktop light/dark, `Copy link` on the owner panel, 0 console errors, smoke, Sentry, CI. Do not press "Email me a new link" against a real person's address.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Say whether the panel was already scoped by inviter and what middleware does for `/join`. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB access or migration, no deploy, commit or push. Never touch `.claude/launch.json`. Notifications stay OFF.
