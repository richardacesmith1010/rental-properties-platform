# Sprint 35 — Codex Implementation Prompt

## 1. Objective

Remove the 3 blockers preventing real-world use: add password reset flow, surface email/Stripe env status, and add Stripe test-mode warning banner. No migration needed.

## 2. Context

- **Branch**: `main`
- **HEAD**: `8fbc14d`
- **Gate baseline**: 503/503 tests, lint clean, typecheck clean, build clean
- **No migration required** — all changes are auth flow + UI + env config
- **Key existing patterns**:
  - `createClient()` from `@/lib/supabase/server` — server-side Supabase client
  - `createClient()` from `@/lib/supabase/client` — browser-side Supabase client
  - `checkRateLimit()` from `@/lib/rate-limit` — in-memory rate limiter
  - `ActionState` return type from `@/app/actions` — `{ success: boolean; error?: string; message?: string }`
  - `useFormState` from `react-dom` — used for server action forms (NOT `useActionState`)
  - `Alert` from `@/components/ui/alert` — variants: `success`, `error`, `warning`, `info`
  - `Input` from `@/components/ui/input`
  - `Button` from `@/components/ui/button`
  - `SubmitButton` from `@/components/shared/submit-button`
  - `PasswordSettings` at `components/settings/password-settings.tsx` — exact pattern to follow for reset form
  - Auth callback at `app/auth/callback/route.ts` line 93 — handles `type === "recovery"` OTP
  - `LoginForm` at `components/auth/login-form.tsx` — has `signupComplete` success state pattern

## 3. In Scope

### Part A: Password Reset Flow
- New forgot-password server action
- "Forgot password?" link on login form
- New `/reset-password` page + form component
- Auth callback recovery redirect
- Login page success banner

### Part B: Env Status Visibility
- Add RESEND_API_KEY, RESEND_FROM_EMAIL, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY to `getEnvStatus()`

### Part C: Stripe Test Mode Banner
- New warning banner component
- Render on owner page

## 4. Out of Scope

- Supabase Auth email template customization
- Setting actual env var values (user responsibility)
- Stripe live mode switch
- Database migrations
- Test file modifications
- CLAUDE.md / AGENTS.md edits
- Deploying to Vercel

## 5. Exact Files Expected to Change

### New Files (4)
1. `apps/web/app/actions/forgot-password.ts`
2. `apps/web/app/reset-password/page.tsx`
3. `apps/web/components/auth/reset-password-form.tsx`
4. `apps/web/components/shared/stripe-test-mode-banner.tsx`

### Modified Files (5)
1. `apps/web/components/auth/login-form.tsx`
2. `apps/web/app/auth/callback/route.ts`
3. `apps/web/app/login/page.tsx`
4. `apps/web/lib/env.ts`
5. `apps/web/app/owner/page.tsx`

## 6. Implementation Requirements

### Part A.1: Forgot Password Server Action

**New file**: `apps/web/app/actions/forgot-password.ts`

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import type { ActionState } from "@/app/actions";

export async function forgotPasswordAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const email = formData.get("email");
  if (typeof email !== "string" || email.trim().length === 0) {
    return { success: false, error: "Email is required." };
  }

  const normalized = email.trim().toLowerCase();

  if (!checkRateLimit(`forgot-password:${normalized}`, 3, 15 * 60 * 1000).allowed) {
    return { success: false, error: "Too many requests. Please try again in 15 minutes." };
  }

  const supabase = createClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://domusbase.com";

  // Always return success to prevent email enumeration
  await supabase.auth.resetPasswordForEmail(normalized, {
    redirectTo: `${appUrl}/auth/callback?next=/reset-password`
  });

  return { success: true, message: "If an account exists with that email, a reset link has been sent." };
}
```

Also export this from `apps/web/app/actions/index.ts`:
```typescript
export { forgotPasswordAction } from "./forgot-password";
```

### Part A.2: Add "Forgot Password?" to Login Form

**Modified file**: `apps/web/components/auth/login-form.tsx`

Add a `forgotMode` boolean state alongside the existing states (line ~34-40):
```typescript
const [forgotMode, setForgotMode] = useState(false);
```

**When `mode === "signin"` and `!forgotMode`**: Add a "Forgot password?" text button below the password field. Style it as a small text link:
```typescript
<button
  type="button"
  className="text-sm text-violet-600 hover:text-violet-800"
  onClick={() => { setForgotMode(true); setError(null); }}
>
  Forgot password?
</button>
```

**When `forgotMode === true`**: Replace the entire form body with:
1. A heading: "Reset your password"
2. Email-only input field (reuse the existing email state)
3. Submit button calling `forgotPasswordAction` via `useFormState`
4. On `state.success`: show a success view (green CheckCircle + "Check your email for a reset link." message) — similar to the existing `signupComplete` pattern
5. "Back to sign in" link that resets `forgotMode` to false and clears state

Import `forgotPasswordAction` from `@/app/actions/forgot-password` and `useFormState` from `react-dom`.

**IMPORTANT**: The forgot password form must use `useFormState` + `<form action={formAction}>` pattern, NOT a manual `handleSubmit`. This matches the existing pattern used in other forms like `withdrawal-request-card.tsx`.

### Part A.3: Reset Password Page

**New file**: `apps/web/app/reset-password/page.tsx` (server component)

```typescript
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = {
  title: "Reset Password",
  description: "Set a new password for your Domus account."
};

export default async function ResetPasswordPage() {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect("/login");
  }

  return (
    <div className="app-surface flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
            Reset Your Password
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Enter a new password for your Domus account.
          </p>
        </div>
        <ResetPasswordForm />
      </div>
    </div>
  );
}
```

**New file**: `apps/web/components/auth/reset-password-form.tsx` (client component)

Follow the exact pattern from `PasswordSettings` (`components/settings/password-settings.tsx`):

```typescript
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import { Alert } from "@/components/ui/alert";

export function ResetPasswordForm() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (newPassword.length < 6) {
        setError("Password should be at least 6 characters.");
        return;
      }
      if (newPassword !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }

      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        setError(updateError.message);
        return;
      }

      // Sign out and redirect to login with success
      await supabase.auth.signOut();
      window.location.href = "/login?password_reset=true";
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to update password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Same layout as PasswordSettings: two fields in a grid, error/success alerts, submit button */}
      {/* Use the same Input, Button, Alert components */}
      {/* After success: signOut() then window.location.href = "/login?password_reset=true" */}
    </form>
  );
}
```

### Part A.4: Auth Callback Recovery Redirect

**Modified file**: `apps/web/app/auth/callback/route.ts`

After line 126 (`if (type === "invite") { return NextResponse.redirect(\`${origin}/complete-profile\`); }`), add:

```typescript
if (type === "recovery") {
  return NextResponse.redirect(`${origin}/reset-password`);
}
```

This must go BEFORE line 129 (the `if (authenticatedUserId)` block). The recovery token has already been verified by `verifyOtp()` at line 94, so the user is now authenticated. Redirecting to `/reset-password` lets them set a new password.

### Part A.5: Login Page Success Banner

**Modified file**: `apps/web/app/login/page.tsx`

1. Add `password_reset` to the `searchParams` interface (line 11):
```typescript
interface LoginPageProps {
  searchParams?: {
    error?: string;
    error_description?: string;
    confirmed?: string;
    password_reset?: string;  // ← add this
  };
}
```

2. Add a variable after `emailConfirmed` (line 27):
```typescript
const passwordReset = searchParams?.password_reset === "true";
```

3. Add an Alert after the `emailConfirmed` block (after line 52):
```typescript
{passwordReset && (
  <Alert variant="success" className="mb-6 w-full max-w-3xl px-4 py-3">
    <p className="font-medium">Password updated!</p>
    <p className="mt-1">Sign in below with your new password.</p>
  </Alert>
)}
```

### Part B: Env Status Additions

**Modified file**: `apps/web/lib/env.ts`

Add three keys to the return object in `getEnvStatus()`:
```typescript
export function getEnvStatus() {
  return {
    // ... existing keys ...
    RESEND_API_KEY: Boolean(process.env.RESEND_API_KEY),
    RESEND_FROM_EMAIL: Boolean(process.env.RESEND_FROM_EMAIL),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  };
}
```

### Part C: Stripe Test Mode Warning Banner

**New file**: `apps/web/components/shared/stripe-test-mode-banner.tsx`

```typescript
"use client";

import { Alert } from "@/components/ui/alert";

export function StripeTestModeBanner() {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
  if (!key.startsWith("pk_test_")) return null;

  return (
    <Alert variant="warning" className="mb-4">
      Stripe is in test mode. Payments will not be processed with real money.
    </Alert>
  );
}
```

**Modified file**: `apps/web/app/owner/page.tsx`

Import the banner and render it near the top of the page, before the Dashboard component:
```typescript
import { StripeTestModeBanner } from "@/components/shared/stripe-test-mode-banner";

// In the JSX, before the Dashboard:
<StripeTestModeBanner />
```

Also render it on `apps/web/app/tenant/page.tsx` (tenants also see payments).

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] `forgotPasswordAction` exists, rate-limits at 3/15min, always returns success message
2. [ ] Login form shows "Forgot password?" link in signin mode
3. [ ] Clicking "Forgot password?" shows email-only form that calls `forgotPasswordAction`
4. [ ] On success, shows "Check your email for a reset link" confirmation
5. [ ] "Back to sign in" link returns to normal login form
6. [ ] Auth callback redirects `type === "recovery"` to `/reset-password`
7. [ ] `/reset-password` page exists, checks auth, shows password form
8. [ ] Reset form validates 6-char min + matching passwords
9. [ ] Reset form calls `updateUser({ password })`, signs out, redirects to `/login?password_reset=true`
10. [ ] Login page shows "Password updated!" success banner when `?password_reset=true`
11. [ ] `getEnvStatus()` includes RESEND_API_KEY, RESEND_FROM_EMAIL, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
12. [ ] `StripeTestModeBanner` renders warning when publishable key starts with `pk_test_`
13. [ ] `StripeTestModeBanner` renders nothing when key is live or missing
14. [ ] Banner appears on owner page (and optionally tenant page)
15. [ ] `npm run gate:web` passes — all tests, lint, typecheck, build clean

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
NEW_FILES: [list]
TESTS: xxx/xxx
LINT: clean | [errors]
TYPECHECK: clean | [errors]
BUILD: clean | [errors]
NOTES: [any issues encountered]
```

## 10. Constraints

- Do NOT apply any database migrations
- Do NOT deploy to Vercel
- Do NOT modify test files, CLAUDE.md, or AGENTS.md
- Do NOT install new npm dependencies
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections — report compact status only
- Use `useFormState` from `react-dom` (NOT `useActionState`) for the forgot password form
- The `forgotPasswordAction` MUST always return success to prevent email enumeration
- Use `checkRateLimit()` for the forgot password action
- Follow existing component patterns (Alert, Input, Button, SubmitButton)
- Use `app-surface` class for page backgrounds (matches existing pages)
