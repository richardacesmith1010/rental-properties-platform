# Sprint 95 — Auth Routing Determinism

## Objective

Remove hidden routing logic from the auth system. After this sprint, every routing decision is a pure function of explicit user state — no token-type heuristics, no historical metadata checks, no silent fallbacks.

## Context

- **Branch:** `main`
- **HEAD:** `dc2e8df`
- The auth callback (`app/auth/callback/route.ts`) was just updated to handle all 5 Supabase token types (`email`, `recovery`, `invite`, `magiclink`, `email_change`).
- Routing currently depends on a mix of: token type from URL params, `invited_at` user metadata, `next` query param presence, and profile state. This sprint makes routing depend ONLY on profile state.
- The state machine spec is at `docs/auth-state-machine.md` for reference.

## In Scope

1. Restrict `hasInvitedSession()` to callback-only use
2. Replace catch-all redirect with explicit error
3. Add state guard to `/complete-profile`
4. Create a shared `resolveAuthRoute()` utility
5. Use `resolveAuthRoute()` in the callback's post-auth routing

## Out of Scope

- New features, pages, or UX flows
- Merging the two invite systems (tenant vs LLC)
- Password strength, login lockout, session expiry (Sprint 93)
- Email template changes
- Database migrations
- Middleware rewrite (middleware stays as token-refresh only)

## Exact Files Expected to Change

### New Files (1)
1. `apps/web/lib/route-resolver.ts` — shared route resolution utility

### Modified Files (3)
2. `apps/web/app/auth/callback/route.ts` — use `resolveAuthRoute()` for post-auth routing, replace catch-all redirect
3. `apps/web/app/complete-profile/page.tsx` — add state guard
4. `apps/web/lib/auth.ts` — export a `getAuthState()` helper used by the route resolver

## Implementation Requirements

### 1. Shared Route Resolver (`lib/route-resolver.ts`)

```typescript
export interface AuthState {
  hasSession: boolean;
  hasProfile: boolean;
  onboardingComplete: boolean;
  role: "owner" | "manager" | "tenant" | null;
  needsPasswordSet: boolean;
}

/**
 * Pure function. Given explicit auth state, returns the correct route.
 * No side effects, no database calls, no URL param inspection.
 */
export function resolveAuthRoute(state: AuthState): string {
  if (!state.hasSession) return "/login";
  if (!state.hasProfile) return "/onboarding";
  if (state.needsPasswordSet) return "/complete-profile";
  if (!state.onboardingComplete) return "/onboarding";

  // role should never be null here (hasProfile + onboardingComplete both true).
  // If it is, this is invariant violation V2 — default to tenant to avoid crash,
  // but this masks a bug. getCurrentUserRole() has the same fallback.
  const role = state.role ?? "tenant";
  if (role === "owner") return "/owner";
  if (role === "manager") return "/manager";
  return "/tenant";
}
```

**Rules:**
- This function must be pure — no `await`, no imports, no side effects
- It is the single source of truth for "given this user state, where should they go?"
- `needsPasswordSet` is `true` when the user was created via invite (`invited_at` is set on the Supabase user object) AND `onboarding_completed_at` is null. Do NOT use `role === "tenant"` as a proxy — that incorrectly matches direct-signup tenants who already have a password

### 2. Auth State Helper (`lib/auth.ts`)

Add a new exported function:

```typescript
export async function getAuthState(
  userId: string,
  opts?: { invitedAt?: string | null }
): Promise<{
  hasProfile: boolean;
  onboardingComplete: boolean;
  role: "owner" | "manager" | "tenant" | null;
  needsPasswordSet: boolean;
}> {
  const supabase = createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, onboarding_completed_at")
    .eq("id", userId)
    .maybeSingle();

  const hasProfile = profile !== null;
  const onboardingComplete = Boolean(profile?.onboarding_completed_at);
  const role =
    profile?.role === "owner" || profile?.role === "manager" || profile?.role === "tenant"
      ? profile.role
      : null;

  // A user needs to set a password if:
  // 1. They were created via admin.generateLink() (invited_at is set)
  // 2. They haven't completed onboarding yet
  //
  // invited_at is the definitive signal — it means the user was created
  // via invite and authenticated via magic link, not via password.
  // DO NOT use role === "tenant" as a proxy — that incorrectly matches
  // direct-signup tenants who already have a password.
  //
  // The caller must pass invitedAt from the Supabase user object.
  // If opts is not provided (e.g., from a page guard), fall back to
  // fetching the user to check invited_at.
  let invitedAt = opts?.invitedAt;
  if (invitedAt === undefined) {
    const { data: { user } } = await supabase.auth.getUser();
    invitedAt = typeof user?.invited_at === "string" ? user.invited_at : null;
  }

  const needsPasswordSet = Boolean(invitedAt) && !onboardingComplete;

  return { hasProfile, onboardingComplete, role, needsPasswordSet };
}
```

**Why `invitedAt` instead of role-based heuristic:**
- `role === "tenant"` would incorrectly match direct-signup tenants who already set a password during registration
- `invited_at` is set by Supabase only when `admin.generateLink()` creates the user — this is the definitive signal for "created without a password"
- In the callback, the user object is already available — pass `user.invited_at` to avoid an extra query
- In page guards, `getAuthState()` will call `getUser()` internally as a fallback

Do NOT change `getCurrentUserRole()`, `getRoleHomePath()`, `requireRole()`, or `getUserProfileSummary()`. They remain as-is.

### 3. Auth Callback Changes (`app/auth/callback/route.ts`)

#### 3a. Replace post-auth routing with `resolveAuthRoute()`

After each authentication branch (PKCE code exchange, OTP verification, session set), the callback currently has inline routing logic that checks `hasInvitedSession()`, `onboarding_completed_at`, and role. Replace ALL of this with:

```typescript
import { resolveAuthRoute } from "@/lib/route-resolver";
import { getAuthState } from "@/lib/auth";
```

The current post-auth routing block (lines 217-236) is:

```typescript
if (authenticatedUserId) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, onboarding_completed_at")
    .eq("id", authenticatedUserId)
    .maybeSingle();

  if (!profile?.onboarding_completed_at) {
    return NextResponse.redirect(`${origin}/onboarding`);
  }

  const role = ...
  const roleHomePath = getRoleHomePath(role);
  if (next === "/" || next === roleHomePath) {
    return NextResponse.redirect(`${origin}${roleHomePath}`);
  }
}
```

Replace it with:

```typescript
if (authenticatedUserId) {
  const { data: { user: freshUser } } = await supabase.auth.getUser();
  const authState = await getAuthState(authenticatedUserId, {
    invitedAt: typeof freshUser?.invited_at === "string" ? freshUser.invited_at : null
  });
  const destination = resolveAuthRoute({
    hasSession: true,
    ...authState
  });
  return NextResponse.redirect(`${origin}${destination}`);
}
```

Note: We already have the user from `supabase.auth.getUser()` earlier in each branch. To avoid a redundant call, Codex may reuse the user variable from the branch that set `authenticatedUserId`, as long as it has `invited_at`. This is an optimization, not a requirement.

#### 3b. Keep `hasInvitedSession()` for callback-internal use ONLY

`hasInvitedSession()` is still needed inside the callback to decide whether to call `markTenantInvitationAccepted()` and for the special invite-type routing within the PKCE code exchange branch. But it must NOT be used for the final routing decision.

Specifically:
- **Keep:** `if (hasInvitedSession(type, rawNext, user)) { await markTenantInvitationAccepted(user.id); }` inside `trackAuthenticatedUser()`
- **Remove:** The three `if (hasInvitedSession(...)) return redirect(/complete-profile)` calls on lines 170, 212 — these are now handled by `resolveAuthRoute()` via `needsPasswordSet`
- **Keep:** `if (type === "invite") return redirect(/complete-profile)` on line 187 inside the OTP branch — this is fine because for `type=invite`, the user literally just clicked an invite link and needs to complete their profile. But change it to use `resolveAuthRoute()` too for consistency:

```typescript
if (type === "invite") {
  const authState = await getAuthState(authenticatedUserId!, {
    invitedAt: user?.invited_at ?? null
  });
  const destination = resolveAuthRoute({ hasSession: true, ...authState });
  return NextResponse.redirect(`${origin}${destination}`);
}
```

#### 3c. Replace catch-all redirect

The final line of the function is currently:

```typescript
return NextResponse.redirect(`${origin}${next}`);
```

This is the silent fallback — if no branch matched, the user gets redirected with no session. Replace with:

```typescript
const params = new URLSearchParams();
params.set("error", "auth_callback_failed");
params.set("error_description", "Something went wrong. Try signing in again or request a new link.");
return NextResponse.redirect(`${origin}/login?${params.toString()}`);
```

#### 3d. Remove `type === "recovery"` redirects from OTP and session branches

The OTP verification branch (around line 191) and the accessToken/refreshToken branch (around line 208) both have:

```typescript
if (type === "recovery") {
  return NextResponse.redirect(`${origin}/reset-password`);
}
```

These are still correct and necessary — recovery tokens should always go to `/reset-password` before the general routing logic runs. **Keep these as-is.** They are type-specific callback routing, not post-auth state routing. Same for `type === "invite"` redirects.

**Summary of what stays vs what changes in the callback:**

| Pattern | Keep or Remove | Reason |
|---------|---------------|--------|
| `type === "recovery"` → `/reset-password` | **Keep** | Correct callback-internal routing |
| `type === "invite"` → `/complete-profile` | **Change** to use `resolveAuthRoute()` | Should resolve from state, not token type |
| `hasInvitedSession()` → `/complete-profile` (lines 170, 212) | **Remove** | Now handled by `resolveAuthRoute()` |
| `hasInvitedSession()` in `trackAuthenticatedUser()` | **Keep** | Used for side effect (marking invite accepted), not routing |
| Post-auth profile query + inline routing (lines 217-236) | **Replace** with `resolveAuthRoute()` | Centralizes routing |
| Catch-all `redirect(next)` (line 257) | **Replace** with error redirect | No silent success allowed |

### 4. State Guard for `/complete-profile` (`app/complete-profile/page.tsx`)

Add a guard at the top of the page component, after `getAuthenticatedUser()`:

```typescript
import { getAuthState } from "@/lib/auth";
import { resolveAuthRoute } from "@/lib/route-resolver";

export default async function CompleteProfilePage() {
  const user = await getAuthenticatedUser();

  // Guard: only allow access if user actually needs to set a password
  const authState = await getAuthState(user.id);
  if (!authState.needsPasswordSet) {
    const destination = resolveAuthRoute({ hasSession: true, ...authState });
    redirect(destination);
  }

  // ... rest of existing page code unchanged ...
}
```

Add `import { redirect } from "next/navigation"` at the top if not already present.

Do NOT change the rest of the page (form, invite context, UI). Only add the guard.

## Validation Commands

```bash
npm run gate:web
```

## Acceptance Criteria

| # | Criterion | Pass/Fail |
|---|-----------|-----------|
| 1 | `resolveAuthRoute()` is a pure function with no imports, no async, no side effects | |
| 2 | `getAuthState()` returns `{ hasProfile, onboardingComplete, role, needsPasswordSet }` | |
| 3 | Auth callback uses `resolveAuthRoute()` for ALL post-auth routing (except recovery → `/reset-password`) | |
| 4 | No `hasInvitedSession()` calls influence the final redirect destination | |
| 5 | Catch-all redirect at end of callback is `→ /login?error=auth_callback_failed` | |
| 6 | `/complete-profile` redirects to role home if user doesn't need to set password | |
| 7 | All existing auth flows still work (invite, signup, login, recovery, magiclink, email_change) | |
| 8 | `npm run gate:web` passes (lint + typecheck + build + all tests) | |

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

- Do NOT apply any database migrations
- Do NOT deploy to Vercel
- Do NOT modify test files, CLAUDE.md, or AGENTS.md
- Do NOT install new npm dependencies
- Do NOT add password strength, lockout, or session expiry logic (Sprint 93)
- Do NOT change the middleware (it stays as token-refresh only)
- Do NOT merge the two invite systems
- Do NOT change any UI copy, styling, or components beyond the `/complete-profile` guard
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections — report compact status only
- Every `.update()`, `.insert()`, `.delete()` call must have its error result checked
