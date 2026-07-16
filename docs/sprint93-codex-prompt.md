# Sprint 93 — Auth Hardening

## Objective

Harden authentication: stronger passwords, login lockout, session expiry messaging, email prefetch protection, and plain-English error messages. After this sprint, auth flows are resilient to brute force, expired sessions, and email scanner edge cases.

## Context

- **Branch:** `main`
- **HEAD:** `05f57a4`
- **What's already done (do NOT redo):**
  - Auth callback handles all 5 token types (`email`, `recovery`, `invite`, `magiclink`, `email_change`) — Sprint 94
  - Auth callback uses `resolveAuthRoute()` for post-auth routing — Sprint 95
  - Catch-all redirect replaced with explicit error — Sprint 95
  - `/complete-profile` has a state guard — Sprint 95
- **Current state:**
  - Password minimum is 6 characters across all 3 auth forms
  - Login is client-side via `supabase.auth.signInWithPassword()`
  - `lib/rate-limit.ts` exists with `checkRateLimit(key, maxRequests, windowMs)` returning `{allowed, remaining}`
  - Middleware refreshes tokens but does not detect expired sessions
  - Login page shows alerts for `password_reset=true` and `error` params but not session expiry

## In Scope

1. Shared password strength validation utility + visual indicator
2. Login server action with rate limiting
3. Session expiry messaging (middleware + login page)
4. Email prefetch protection landing page
5. Plain-English error messages on login form

## Out of Scope

- Auth callback changes (already hardened in Sprints 94-95)
- `resolveAuthRoute()` or `getAuthState()` changes
- Google OAuth / Apple Sign-In
- Database migrations (none needed)
- Supabase email template changes
- E2E tests

## Exact Files Expected to Change

### New Files (3)
1. `apps/web/lib/password-validation.ts` — shared password strength utility
2. `apps/web/app/auth/confirm/page.tsx` — email prefetch protection landing page
3. `apps/web/app/actions/login.ts` — server action for login with rate limiting

### Modified Files (5)
4. `apps/web/components/auth/login-form.tsx` — password strength (signup mode), use server action (signin mode), error messages
5. `apps/web/components/auth/reset-password-form.tsx` — password strength rules
6. `apps/web/components/auth/complete-profile-form.tsx` — password strength rules
7. `apps/web/middleware.ts` — detect expired session, set cookie
8. `apps/web/app/login/page.tsx` — read session expiry cookie, show message

## Implementation Requirements

### 1. Shared Password Validation (`lib/password-validation.ts`)

```typescript
export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;  // 0=empty, 1=weak, 2=fair, 3=good, 4=strong
  label: string;               // "Weak", "Fair", "Good", "Strong"
  errors: string[];            // Human-readable issues
  isValid: boolean;            // true if meets minimum requirements
}

export function validatePassword(password: string): PasswordStrength;
```

**Rules:**
- Minimum 8 characters
- At least 1 uppercase letter
- At least 1 number
- Score 1 = meets length only. Score 2 = length + 1 rule. Score 3 = length + both rules. Score 4 = 12+ chars + both rules.
- Error messages in plain English: "Use at least 8 characters", "Add a capital letter", "Add a number"
- This function must be pure — no side effects, no imports

### 2. Password Strength UI

Add inline to each password form (not a separate component file). Below the password input, show:
- A 4-segment progress bar (red → orange → yellow → green)
- The label text ("Weak", "Fair", "Good", "Strong")
- Only visible after user starts typing (score > 0)
- Submit button disabled until `isValid === true`

Apply to:
- `login-form.tsx` (signup mode ONLY — not signin mode)
- `reset-password-form.tsx`
- `complete-profile-form.tsx`

Use Tailwind classes only — no external UI library.

### 3. Login Server Action (`app/actions/login.ts`)

```typescript
"use server"
export async function loginAction(
  prevState: { error?: string; blocked?: boolean },
  formData: FormData
): Promise<{ error?: string; blocked?: boolean }>;
```

**Steps:**
1. Extract email and password from formData
2. Call `checkRateLimit(`login:${email.toLowerCase()}`, 5, 900_000)` — 5 attempts per 15 min
3. If `!allowed`: return `{ error: "Too many sign-in attempts. Wait 15 minutes or reset your password.", blocked: true }`
4. Create Supabase server client, call `signInWithPassword({ email, password })`
5. If auth error: return `{ error: mapAuthError(error.message) }`
6. If success: `redirect` to `/` (middleware + resolveAuthRoute handles final destination)

**In `login-form.tsx` (signin mode only):**
- Replace client-side `signInWithPassword` with the server action
- Use `useFormState` (NOT `useActionState`) to match existing patterns
- When `blocked === true`, show error AND a prominent "Reset your password" link
- Keep signup flow client-side (it needs `signUp` return data to check `identities`)

### 4. Error Message Mapping

**In `login-form.tsx`, update or create `mapAuthError()`:**

```typescript
function mapAuthError(message: string): string {
  if (message.includes("Invalid login credentials")) {
    return "Wrong email or password. Try again or reset your password.";
  }
  if (message.includes("User already registered")) {
    return "This email already has an account. Try signing in instead.";
  }
  if (message.includes("Email not confirmed")) {
    return "Check your email and click the link we sent to finish signing up.";
  }
  if (message.includes("Password should be at least")) {
    return "Use at least 8 characters with a capital letter and a number.";
  }
  if (message.includes("rate limit") || message.includes("too many")) {
    return "Too many attempts. Wait a few minutes and try again.";
  }
  return message;
}
```

Export this function from `login-form.tsx` or move it to a shared location if the server action also needs it. The server action in `actions/login.ts` must use the same mapping.

### 5. Session Expiry Messaging

**In `middleware.ts`:**
- After `await supabase.auth.getUser()`, check if no user was returned
- Check if the request path is a protected route (starts with `/owner`, `/manager`, `/tenant`, `/onboarding`, `/complete-profile`, `/reset-password`, `/settings`, `/achievements`)
- If no user AND protected route: set a response cookie `x-session-expired=1` with `maxAge: 10` (expires after 10 seconds — shows once)
- Let the existing redirect flow handle sending them to `/login`

**In `app/login/page.tsx`:**
- Import `cookies` from `next/headers`
- Check for `x-session-expired` cookie
- If present, show: `<Alert variant="warning">Your session expired. Please sign in again.</Alert>`
- Place alongside existing alert logic (confirmed email, password reset, error params)

### 6. Email Prefetch Protection (`app/auth/confirm/page.tsx`)

Client component that prevents email scanners from consuming single-use tokens.

**Requirements:**
- `"use client"` — reads URL params via `useSearchParams()`
- Reads `token_hash` and `type` from search params
- Shows a branded Domus card with:
  - Dom mascot (use `<DomMascot size="lg" mood="waving" />`)
  - Heading based on type:
    - `email` → "Confirm your email"
    - `recovery` → "Reset your password"
    - `invite` → "Accept your invitation"
    - `magiclink` → "Sign in to Domus"
    - `email_change` → "Confirm email change"
    - unknown/missing → "Continue to Domus"
  - A single button: "Continue" styled with Domus primary button classes
- On button click: `window.location.href = \`/auth/callback?token_hash=${tokenHash}&type=${type}\``
- If `token_hash` is missing: show "This link looks broken. Try signing in again." with a link to `/login`
- Disable button after click (prevent double-click)
- Wrap in `<Suspense>` at the page level since `useSearchParams()` requires it

**NOTE:** Supabase email templates currently point to `/auth/callback`. We will update them to `/auth/confirm` in a separate step after this sprint is verified. For now, just create the page so it's ready.

## Validation Commands

```bash
npm run gate:web
```

## Acceptance Criteria

| # | Criterion | Pass/Fail |
|---|-----------|-----------|
| 1 | `validatePassword("short")` returns `isValid: false` with appropriate errors | |
| 2 | `validatePassword("MyPassword1")` returns `isValid: true, score: 3` | |
| 3 | `validatePassword("MyStrongPassword123")` returns `score: 4` | |
| 4 | Password strength bar appears in signup, reset-password, and complete-profile forms | |
| 5 | Password strength bar does NOT appear in signin mode on login form | |
| 6 | Submit button is disabled until password `isValid === true` (all 3 forms) | |
| 7 | Login signin mode uses server action, not client-side Supabase call | |
| 8 | After 5 failed logins for same email, 6th attempt returns blocked error | |
| 9 | Blocked error shows "Reset your password" link | |
| 10 | Expired session on `/owner` redirects to `/login` with "Your session expired" message | |
| 11 | `/auth/confirm?token_hash=abc&type=recovery` renders "Reset your password" heading + Continue button | |
| 12 | Continue button on confirm page navigates to `/auth/callback?token_hash=abc&type=recovery` | |
| 13 | `/auth/confirm` with no params shows error message + link to login | |
| 14 | All error messages are plain English — no Supabase error strings exposed to users | |
| 15 | `npm run gate:web` passes | |

## Report Format

```
gate_passed: true/false
lint_passed: true/false
typecheck_passed: true/false
build_passed: true/false
tests_passed: true/false
files_created: [list]
files_modified: [list]
```

## Constraints

- Do NOT modify `app/auth/callback/route.ts` — it was hardened in Sprints 94-95 and is stable
- Do NOT modify `lib/auth.ts` or `lib/route-resolver.ts`
- Do NOT apply database migrations (none needed)
- Do NOT deploy to Vercel
- Do NOT modify test files, CLAUDE.md, or AGENTS.md
- Do NOT install new npm dependencies
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections — report compact status only
- Use `useFormState` (not `useActionState`) for server action forms — match existing patterns
- The user should never need to read instructions to complete any auth flow. Every step must be self-explanatory.
- All user-facing text must be 6th grade reading level (see CLAUDE.md §18)
- Every `.update()`, `.insert()`, `.delete()` call must have its error result checked
