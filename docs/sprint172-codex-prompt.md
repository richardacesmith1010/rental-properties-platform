# Sprint 172 — Honest invites, manager first screen, sign-up email resend (L3)

Revision 2 — ChatGPT verdict on rev 1: REJECT; on rev 2: APPROVE. All 3 blocking items and the optional item are adopted:
- the resend UI is identical for every auth response;
- the sign-up screen no longer reveals an existing account;
- manager delivery distinguishes "already" from "added";
- tests prove the auth/rate-limit order.

## 1. Objective
Fix the invite and sign-up items from `docs/launch-review-2026-10-05.md`:
- The app must say exactly what happened when an owner invites someone (email sent, or person added with no email).
- Every invite email must land back in Domus correctly.
- A brand-new manager must never hit a dead end.
- An owner who never received the sign-up confirmation email can request it again.
- An invited person who tries "Sign up" is told what to do.

## 2. Context
- Branch `main`, HEAD `aad4d52` or a later docs-only commit. Invite, confirmation and reset emails send even while notifications are off. That is expected, because the owner asked for them.
- **Manager invite:** `apps/web/app/actions/invitations.ts`.
  - `inviteManager` (~40–110): if a profile with that email exists with role `manager`, it only upserts `property_managers` and returns `{ success: true }`, with no email. Otherwise it calls `inviteUserByEmail(email, { data })` **without `redirectTo`** (~97).
  - A second `inviteUserByEmail` (~250) also lacks `redirectTo`.
  - The UI `apps/web/components/dashboard/invitations/invite-manager-form.tsx` shows "Invitation sent!" (~59) in both cases, and has a "Skip for now" button (~65) that skips required fields.
- **Tenant invite:** `apps/web/app/actions/tenant-invitations.ts`.
  - Linking an existing tenant returns `message: "Tenant linked to property. Continue to lease setup."` (~146–150), with no email.
  - New invites use the branded Resend email (`createTenantInviteLink` in `tenant-invitation-support.ts`, which has `redirectTo`), or fall back to `fallbackToSupabaseInvite` (has `redirectTo`).
  - The resend path's non-tenant branch (~352) and its else-branch (~368) call `inviteUserByEmail` **without `redirectTo`**.
  - The wizard success screen `apps/web/components/dashboard/tenant-invite-wizard-support.tsx` (~348–350) always says "Invitation sent to {email}" and "will receive a branded Domus email".
  - Other wizard text:
    - ~181: "All units are rented. Add a unit first." even with zero units, and with no button for managers;
    - ~191: "…which home they were invited to manage".
- **App URL:** `process.env.NEXT_PUBLIC_APP_URL ?? "https://domusbase.com"` (as used in `tenant-invitation-support.ts`).
- **Manager screens:**
  - `components/dashboard/dashboard-section-loaders.ts`: `activeSectionLabel` falls back to "Section not found" for the manager "operations" view, the "Add" screen.
  - `components/dashboard/portfolio-section.tsx` (~120–121): a manager with 0 homes sees "No properties yet / Add your first property to start managing your homes."
  - `components/dashboard/section-renderer-support.tsx` (~82): a manager sees "Your homes".
- **Sign-up:** `apps/web/components/auth/login-form.tsx`.
  - After sign-up, "Check your email" (~273) offers no resend.
  - An existing email shows "This email already has an account. Try signing in instead." (~255).

## 3. In scope
1. **Truthful delivery result:**
   - `inviteManager` returns `delivery: "email" | "added" | "already"`:
     - **before** the upsert, read whether an active `property_managers` row already exists for that manager and property;
     - `"already"` when it does;
     - `"added"` when the upsert creates or reactivates the link;
     - `"email"` after a successful `inviteUserByEmail`;
     - include `name` when known.
   - `invite-manager-form.tsx` shows:
     - for `"email"`: "Invite sent to {email}. They'll get an email from Domus.";
     - for `"added"`: "Added {name or email} to this home. They'll see it next time they sign in.";
     - for `"already"`: "{name or email} already has access to this home. No email was sent."
   - The tenant invite action returns `delivery: "email_branded" | "email_basic" | "linked"`, and the wizard success screen shows:
     - **branded:** "Invite sent to {email}." and "They'll get an email from Domus with a link to join.";
     - **basic:** "Invite sent to {email}." and "They'll get a sign-in email. Ask them to check spam if it doesn't come.";
     - **linked:** "{name or email} already has a Domus account. We added them to this home. No email was sent."
2. **`redirectTo` everywhere:** add `redirectTo: ${appUrl}/auth/callback` to both `inviteUserByEmail` calls in `invitations.ts` and to both resend calls in `tenant-invitations.ts` (~352, ~368). Use the same app URL expression already used in `tenant-invitation-support.ts`; do not add a new env var.
3. **Manager first screen:**
   - The "operations" view label is "Add" for managers (and for owners, if it falls through there too).
   - In `portfolio-section.tsx`, a **manager** with 0 homes sees "No homes yet" and "An owner will add you to their home. Ask them to send you an invite."
     - Keep the add-home button for managers only if it exists today; do not add new abilities.
     - The owner's empty state is unchanged.
   - In `section-renderer-support.tsx`, managers see "Homes you manage". Owners still see "Your homes".
   - Remove the "Skip for now" button from `invite-manager-form.tsx`.
   - Tenant wizard:
     - zero units → "Add a unit to this home first." plus an "Add a unit" button when `onAddUnit` exists; otherwise "Ask the owner to add a unit.";
     - all units rented → "Every unit has a tenant. Add a unit first.";
     - ~191 → "Tenants will see which home they rent."
4. **Sign-up email resend** (`login-form.tsx`, on the "Check your email" screen after sign-up):
   - Add a "Send it again" button that calls `supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: ${location.origin}/auth/callback } })`.
   - **No account-existence signal:** every response from `auth.resend`, success or any Supabase/auth error, shows the same message and cooldown:
     "If this email needs confirming, we sent a new link. Check your inbox." The button is then disabled for 60 seconds ("Try again in {n}s").
   - Only a client or network failure, where the request never reached Supabase (for example a thrown `TypeError` from fetch), may show
     "Check your connection and try again." This must not depend on any Supabase response field.
5. **Invited person tries Sign up, with no account-existence signal:**
   - Remove the branch that shows "This email already has an account…" (~254–256). When sign-up returns an existing-user result, show the **same** "Check your email" screen as a new sign-up.
   - The "Check your email" screen, for everyone, adds the line "Used this email with Domus before? Use the link in your invite email, or tap Forgot password." with the existing Forgot password link.

## 4. Out of scope
- **A "Copy invite link" button. Deliberately excluded:** the invite link lets whoever holds it set the invitee's password. That would let an owner take over a tenant account. It is revisited with a safer design later.
- LLC invites, email template wording, owner sign-up entry (Sprint 173), auth callback logic, roles and permissions, schema.
- `.claude/launch.json`, `docs/`, `CLAUDE.md`, `AGENTS.md`.

## 5. Exact files expected to change
- `apps/web/app/actions/invitations.ts`
- `apps/web/app/actions/tenant-invitations.ts`
- `apps/web/components/dashboard/invitations/invite-manager-form.tsx`
- `apps/web/components/dashboard/tenant-invite-wizard-support.tsx`
- `apps/web/components/dashboard/dashboard-section-loaders.ts`
- `apps/web/components/dashboard/portfolio-section.tsx`
- `apps/web/components/dashboard/section-renderer-support.tsx`
- `apps/web/components/auth/login-form.tsx`
- tests: the existing test files for these modules (update, never delete cases) plus new ones as needed:
  - `apps/web/app/actions/__tests__/invitations.test.ts`
  - `apps/web/app/actions/__tests__/tenant-invitations.test.ts`
  - `apps/web/components/__tests__/invite-manager-form.test.tsx`
  - `apps/web/components/__tests__/login-form.test.tsx`
  - `apps/web/components/__tests__/portfolio-section.test.tsx`

Each line at most 140 characters. Do not compact code (L-015). Files already over 400 lines must not grow by more than 40 lines.

## 6. Implementation requirements
- **Auth and roles unchanged:** every action keeps its existing auth, role, rate-limit and property-access checks, in the same order. Adding `delivery` must not change which path runs.
- Check every Supabase error result you touch.
- Plain-language rules: no "charge", "submit", "onboard", "branded" or "context" in user-facing text you write or touch.
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory.

## 7. Validation commands to run
- `npx vitest run` from `apps/web` on all changed or added test files, plus every existing test that imports a changed file
- `npx tsc -p apps/web/tsconfig.json --noEmit`
- `npm run lint:web`

## 8. Acceptance criteria (binary). Each case needs a real test that calls the code (L-017)
1. **`inviteManager`:**
   - an existing manager not yet on the property → `{ success:true, delivery:"added" }` and **no** `inviteUserByEmail` call;
   - an existing manager already active on the property → `delivery:"already"`, with no email;
   - auth, role and property-access checks and the rate limit run **before** any profile lookup, upsert or invite call. Prove it: a rejected caller causes zero calls to those;
   - a new email → `delivery:"email"`, and `inviteUserByEmail` is called with `redirectTo` ending in `/auth/callback`;
   - a non-admin of the property is still rejected with no writes.
2. **Tenant invite:**
   - an existing tenant → `delivery:"linked"`, with no email sent;
   - Resend configured → `"email_branded"`;
   - Resend missing or failing → `"email_basic"`;
   - both resend branches pass `redirectTo` ending in `/auth/callback`;
   - a rejected caller (not an admin of the property) causes zero profile lookups or invite calls.
3. **`invite-manager-form`:**
   - renders the "Invite sent to…", "Added … to this home" and "already has access" messages for the three results;
   - has no "Skip for now".
4. **Tenant wizard success:** renders the three delivery messages. The zero-unit and all-rented messages are distinct. The "Add a unit" button shows only when `onAddUnit` exists.
5. **Manager screens:**
   - the "operations" label is "Add";
   - a manager with 0 homes sees the "An owner will add you…" text;
   - the owner's empty state is unchanged;
   - managers see "Homes you manage".
6. **Login form:**
   - after sign-up, "Send it again" calls `auth.resend` with type `signup`;
   - a resend success, a resend Supabase error such as rate-limited, and a user-not-found style error all render the **identical** message and countdown (assert identical text);
   - a thrown network error shows "Check your connection and try again.";
   - a sign-up that returns an existing-user result renders the **same** "Check your email" screen as a new sign-up, including the "Used this email with Domus before?…" line and the Forgot password link;
   - the text "already has an account" never renders.
7. A grep of §5 files finds none of "Invitation sent!", "branded Domus email", "invited to manage", "Skip for now", "Try signing in instead", or "already has an account".
8. Typecheck and lint pass. Only §5 files changed.

## 9. Report format
JSON per `docs/codex-report-schema.json`. In `self_verification.findings`, list each test file with its number of cases. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB writes, deploy, commit or push. No emails sent during tests: mock every Supabase and Resend call. Never modify or revert files outside §5. No new dependencies. Do not invent URLs or emails.
