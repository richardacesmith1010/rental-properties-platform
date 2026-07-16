# Domus Auth & Onboarding State Machine Specification

Version: 1.0 — 2026-03-27

## 1. State Table

### 1a. Stable Auth States

These are persistent, resting states. A user remains in one of these until an event triggers a transition.

| ID | State | `auth.users` | `profiles` | `onboarding_completed_at` | Description |
|----|-------|-------------|-----------|--------------------------|-------------|
| S1 | `anonymous` | no row | no row | n/a | No account exists. Not authenticated. |
| S2 | `email_unconfirmed` | row exists, `email_confirmed_at` = null, `invited_at` = null | no row | n/a | Signed up directly, confirmation email sent, not yet clicked. |
| S3 | `invited_tenant_pending` | row exists, `invited_at` set, `email_confirmed_at` = null | no row | n/a | Created by `admin.generateLink()`. Email sent via Resend. Link not clicked. |
| S4 | `invited_llc_pending` | no row (or existing row) | may or may not exist | n/a | Row in `llc_invitations` with `status: "pending"`. No Supabase auth user created by the invite itself. |
| S5 | `authenticated_no_profile` | row exists, session active | no row | n/a | **Invariant violation.** Should not persist. See §5. |
| S6 | `profile_no_password` | row exists, session active via magic link | row exists | null | Tenant invite accepted via magic link. User has session but hasn't set a password yet. On `/complete-profile`. |
| S7 | `onboarding_incomplete` | row exists, session active | row exists, `role` set | null | Profile exists but onboarding form not completed. On `/onboarding`. |
| S8 | `active` | row exists, `email_confirmed_at` set | row exists, `role` set | timestamp set | Fully operational. Routed to role home. |

### 1b. Role States (property of S8, not separate states)

| Role | Route | Guard |
|------|-------|-------|
| `owner` | `/owner` | `profiles.role = "owner"` |
| `manager` | `/manager` | `profiles.role = "manager"` |
| `tenant` | `/tenant` | `profiles.role = "tenant"` |

Role is a **property** of the active state, not a separate state. A user is always exactly one of these when in S8.

### 1c. LLC Membership Overlay (independent of auth state)

LLC membership is **layered on top** of the auth state. A user in S8 with role=owner may have zero or many LLC memberships.

| Overlay | Table | Condition | Effect |
|---------|-------|-----------|--------|
| `llc_member_active` | `ownership_account_members` | `active: true` | Can view/operate on LLC data |
| `llc_member_inactive` | `ownership_account_members` | `active: false` | Locked out of LLC data |
| `llc_none` | no row | — | Not a member of any LLC |

### 1d. Transient States (exist only during a request/flow, not resting states)

| ID | State | Duration | Where |
|----|-------|----------|-------|
| T1 | `callback_processing` | Milliseconds | `/auth/callback` — exchanging code or verifying OTP |
| T2 | `password_reset_in_progress` | Minutes | `/reset-password` — user has recovery session, hasn't submitted new password |
| T3 | `email_change_pending` | Hours | Confirmation email sent for new address, waiting for click |
| T4 | `llc_invite_accepting` | Milliseconds | `/join-llc` — logged-in user with matching email, `acceptLLCInvitation()` running |

### 1e. Error States (terminal, require user action to exit)

| ID | State | Route | Cause |
|----|-------|-------|-------|
| E1 | `invite_expired` | `/login?error=invite_expired` | Token older than 24h (tenant) or 7d (LLC) |
| E2 | `callback_failed` | `/login?error=auth_callback_failed` | OTP verification failed, malformed token, Supabase error |
| E3 | `pkce_wrong_browser` | `/login?error=reset_link_expired` | Recovery link opened in different browser than where it was requested |
| E4 | `llc_email_mismatch` | `/join-llc` (error UI) | Logged-in user's email doesn't match LLC invitation email |
| E5 | `llc_invite_invalid` | `/join-llc` (error UI) | Token missing, not found, already used, or expired |
| E6 | `session_expired` | Redirect to `/login` | Auth token expired, middleware couldn't refresh |

---

## 2. Transition Table

### 2a. Primary Flows

| # | Source | Trigger | Guard | Destination | Route |
|---|--------|---------|-------|-------------|-------|
| 1 | S1 | User submits signup form | — | S2 | `/login` (shows "check email") |
| 2 | S2 | User clicks confirmation email link | `token_hash` valid, `type=email` | S7 | `/auth/callback` → `/onboarding` |
| 3 | S1 | Owner sends tenant invite | — | S3 | (no user-facing route, background) |
| 4 | S3 | Tenant clicks invite email link | `token_hash` valid, `type=invite` | S6 | `/auth/callback` → `/complete-profile` |
| 5 | S3 | Tenant clicks invite email link | `code` valid, PKCE | S6 | `/auth/callback` → `/complete-profile` |
| 6 | S6 | User sets password on complete-profile | — | S7 | `/complete-profile` → `/onboarding` |
| 7 | S7 | User submits onboarding form | — | S8 | `/onboarding` → role home |
| 8 | S1 | Owner sends LLC invite | — | S4 | (no user-facing route, background) |
| 9 | S4 | New user signs up on `/join-llc` | `createAccountToJoinLLC()` succeeds | S8 + `llc_member_active` | `/join-llc` → `/owner?account=...` |
| 10 | S4 | Existing user signs in on `/join-llc` | `signInToJoinLLC()` succeeds | S8 + `llc_member_active` | `/join-llc` → `/owner?account=...` |
| 11 | S8 | Logged-in user opens `/join-llc?token=...` | Email matches invitation | S8 + `llc_member_active` | `/join-llc` → `/owner?account=...` |
| 12 | S1 | User submits login form | Email+password valid | S8 | `/login` → role home |
| 13 | S8 | User clicks sign out | — | S1 | → `/` |

### 2b. Recovery Flows

| # | Source | Trigger | Guard | Destination | Route |
|---|--------|---------|-------|-------------|-------|
| 14 | S1/S8 | User submits forgot-password | Rate limit not exceeded | S1 (waiting) | `/login` (shows "check email") |
| 15 | S1 | User clicks recovery email link | `token_hash` valid, `type=recovery` | T2 | `/auth/callback` → `/reset-password` |
| 16 | T2 | User submits new password | — | S1 | `/reset-password` → sign out → `/login?password_reset=true` |

### 2c. Error Transitions

| # | Source | Trigger | Guard | Destination | Route |
|---|--------|---------|-------|-------------|-------|
| 17 | T1 | Token expired | Error contains "expired" or "otp_expired" | E1 | → `/login?error=invite_expired` |
| 18 | T1 | OTP verification fails | Any other error | E2 | → `/login?error=auth_callback_failed` |
| 19 | T1 | PKCE code verifier missing | `type=recovery` | E3 | → `/login?error=reset_link_expired` |
| 20 | T1 | PKCE code verifier missing | `type!=recovery` | S1 | → `/login?confirmed=true` |
| 21 | S8 | Opens `/join-llc` | Email mismatch | E4 | `/join-llc` (error UI + sign out option) |
| 22 | any | Opens `/join-llc` | Token missing/invalid/used/expired | E5 | `/join-llc` (error UI) |
| 23 | S8 | Session token expires | Middleware can't refresh | E6 | → `/login` |

### 2d. Edge Case Transitions

| # | Source | Trigger | Guard | Destination | Route |
|---|--------|---------|-------|-------------|-------|
| 24 | S8 | Visits `/login` | Already authenticated | S8 | Redirect to role home |
| 25 | S8 | Visits `/onboarding` | `onboarding_completed_at` set | S8 | Redirect to role home |
| 26 | S8 | Visits role page for wrong role | `requireAuth()` role check fails | S8 | Redirect to correct role home |
| 27 | S7 | Visits `/complete-profile` | Has session, no invite context | S7 | Renders generic form (no property details) |

---

## 3. Routing Rules

```
IF not authenticated:
  → /login

IF authenticated AND no profile row:
  → /onboarding                          # S5 invariant — should not happen

IF authenticated AND profile exists AND onboarding_completed_at = null:
  IF came from invite (type=invite OR hasInvitedSession=true):
    → /complete-profile                  # S6
  ELSE:
    → /onboarding                        # S7

IF authenticated AND onboarding_completed_at set:
  → /{role}                              # S8 — /owner, /manager, or /tenant

IF on /join-llc with valid token AND logged in AND email matches:
  → auto-accept → /owner?account=...     # bypass normal routing

IF on /join-llc with valid token AND not logged in:
  → show signin/signup form on /join-llc  # self-contained flow
```

### Routing Decision Points by Page

| Page | Auth required? | Decision logic |
|------|---------------|----------------|
| `/login` | No | If authed → redirect to role home |
| `/auth/callback` | No (creates session) | Token type + invite status → route to next page |
| `/complete-profile` | Yes | Always renders. `getAuthenticatedUser()` or → `/login` |
| `/onboarding` | Yes | If already onboarded → redirect to role home |
| `/join-llc` | No | Self-contained: checks token, handles auth inline |
| `/owner` | Yes, role=owner | `requireAuth("owner")` or → role home |
| `/manager` | Yes, role=manager | `requireAuth("manager")` or → role home |
| `/tenant` | Yes, role=tenant | `requireAuth("tenant")` or → role home |
| `/reset-password` | Yes (recovery session) | `getAuthenticatedUser()` or → `/login` |

---

## 4. Invariant Violations

These states should never persist in a healthy system. If observed, they indicate a bug.

| # | Condition | Why it's wrong | Likely cause |
|---|-----------|---------------|--------------|
| V1 | `auth.users` row exists, session active, no `profiles` row | Every authenticated user must have a profile. The callback and invite flows create profiles. | Race condition, failed `finalizeInvitationAcceptance()`, or direct signup without profile creation trigger. |
| V2 | `profiles.role` is null or missing | Role is required for routing. `getCurrentUserRole()` defaults to `"tenant"` to mask this, but it's still wrong. | Profile created manually or by a code path that doesn't set role. |
| V3 | `profiles.onboarding_completed_at` set but no `full_name` | Onboarding form collects name. Completion without name means form was bypassed. | Direct DB edit or API call skipping validation. |
| V4 | `llc_invitations.status = "accepted"` but no `ownership_account_members` row | Acceptance should atomically create membership. | `finalizeInvitationAcceptance()` partially failed. |
| V5 | `llc_invitations.status = "pending"` AND created > 7 days ago | Should be auto-expired. The `/join-llc` page does this on load, but the row stays pending if nobody visits the link. | No background job for expiration. Stale data, not a bug per se. |
| V6 | Two `profiles` rows for the same `auth.users.id` | Primary key constraint should prevent this. | Should be impossible unless PK constraint is missing. |

---

## 5. Where the Codebase Mixes State Types

| Issue | Location | Problem |
|-------|----------|---------|
| **`hasInvitedSession()` conflates invite type with user metadata** | `auth/callback/route.ts` lines 15-31 | Returns true if `type === "invite"` OR if `invited_at` + `role` exist without `next` param. This means a user who was invited months ago and is just refreshing a session could be re-routed to `/complete-profile`. |
| **`getCurrentUserRole()` silently defaults to tenant** | `lib/auth.ts` | If profile query fails or role is null, returns `"tenant"`. This masks invariant V2 and sends owners/managers to the wrong dashboard. |
| **LLC invite acceptance skips onboarding** | `llc-invitations.ts` `finalizeInvitationAcceptance()` | Sets `onboarding_completed_at = now` during invite acceptance. This means LLC-invited users never see the onboarding form — acceptable if intentional, but creates a different path than tenant invites. |
| **Token type allowlist is incomplete** | `auth/callback/route.ts` line 105 | Only handles `email`, `recovery`, `invite`. Templates now use `magiclink` and `email_change`, which fall through to the final `redirect(next)` with no session — effectively a silent failure. |
| **`/complete-profile` doesn't verify the user actually needs a password** | `complete-profile/page.tsx` | Renders the password form unconditionally for any authenticated user. A user who already has a password and visits this URL will see the form and can "re-set" their password unnecessarily. |

---

## 6. Edge Cases

| # | Scenario | Current behavior | Correct? |
|---|----------|-----------------|----------|
| EC1 | User clicks tenant invite link in a different browser | PKCE code verifier missing. If `type=recovery`: error E3. If other type: redirects to `/login?confirmed=true`. | Partially correct. For `type=invite`, the user is told "confirmed" but is NOT actually in `/complete-profile`. They must sign in manually, and then may or may not route correctly. |
| EC2 | User clicks expired tenant invite link | Callback catches "expired" error → E1. User sees "ask your landlord to resend." | Correct. |
| EC3 | User clicks LLC invite link while logged in as different user | `/join-llc` detects email mismatch → E4. Offers sign out. | Correct. |
| EC4 | User clicks LLC invite link after it's already accepted | `/join-llc` checks `status !== "pending"` → E5 "already used." | Correct. |
| EC5 | User completes onboarding, then navigates back to `/onboarding` | `onboarding_completed_at` check → redirect to role home. | Correct. |
| EC6 | Authenticated user visits `/login` | Auth check → redirect to role home. | Correct. |
| EC7 | User receives both a tenant invite and an LLC invite | Two independent flows. Tenant invite creates an auth user with `role=tenant`. LLC invite expects `role=owner`. If tenant invite is accepted first, the user has `role=tenant` and the LLC flow will set `role=owner` via `finalizeInvitationAcceptance()`. | Works but role gets silently overwritten. Could confuse the user. |
| EC8 | `magiclink` type token arrives at callback | Falls through all conditionals. `authenticatedUserId` stays null. Redirects to `/{next}` with no session. | **Broken.** Silent failure. |
| EC9 | `email_change` type token arrives at callback | Same as EC8. Falls through. No session established. | **Broken.** Silent failure. |
| EC10 | Network error during `finalizeInvitationAcceptance()` | Profile or membership creation fails. User may be authenticated but stuck in S5 (no profile). | Partially handled — errors are caught but the user may end up in an invariant-violating state. |

---

## 7. Mermaid State Diagram

```mermaid
stateDiagram-v2
    [*] --> S1_Anonymous

    S1_Anonymous --> S2_EmailUnconfirmed : Direct signup
    S1_Anonymous --> S3_InvitedTenant : Owner sends tenant invite
    S1_Anonymous --> S4_InvitedLLC : Owner sends LLC invite
    S1_Anonymous --> S8_Active : Password sign-in (valid)

    S2_EmailUnconfirmed --> S7_OnboardingIncomplete : Clicks confirm email

    S3_InvitedTenant --> S6_NoPassword : Clicks invite link
    S3_InvitedTenant --> E1_InviteExpired : Link expired

    S4_InvitedLLC --> S8_Active : Signs up/in on /join-llc
    S4_InvitedLLC --> E5_LLCInvalid : Token expired/used

    S6_NoPassword --> S7_OnboardingIncomplete : Sets password

    S7_OnboardingIncomplete --> S8_Active : Completes onboarding

    S8_Active --> S1_Anonymous : Signs out
    S8_Active --> T2_PasswordReset : Clicks recovery link
    S8_Active --> E4_LLCMismatch : Opens /join-llc wrong email

    T2_PasswordReset --> S1_Anonymous : Submits new password + sign out

    E1_InviteExpired --> S1_Anonymous : User requests new invite
    E3_WrongBrowser --> S1_Anonymous : User requests new link

    state S8_Active {
        [*] --> RoleRouting
        RoleRouting --> Owner : role=owner
        RoleRouting --> Manager : role=manager
        RoleRouting --> Tenant : role=tenant
    }

    note right of S5_NoProfile : INVARIANT VIOLATION\nShould not persist
```
