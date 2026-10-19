"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { forgotPasswordAction } from "@/app/actions/forgot-password";
import { loginAction, type LoginActionState } from "@/app/actions/login";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const emptyLoginState: LoginActionState = {};
const fieldClass = "h-[52px] rounded-xl";

function SignInButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending} title="Sign in to your Domus account."
    className="h-[54px] w-full rounded-xl bg-[var(--action)] text-[var(--action-contrast)] hover:bg-[var(--action-strong)]">
    {pending ? "Signing in…" : "Sign in"}
  </Button>;
}

function ForgotPasswordView({ email, setEmail, onBack }: {
  email: string; setEmail: (value: string) => void; onBack: () => void;
}) {
  const [state, formAction] = useFormState(forgotPasswordAction, null);
  if (state?.success) return <div className="text-center">
    <h2 className="text-lg font-display font-semibold text-[var(--ink)]">Check your email</h2>
    <p className="mt-2 text-sm text-[var(--muted)]">
      If an account exists for <span className="font-medium text-[var(--ink)]">{email}</span>, a reset link has been sent.
    </p>
    <button type="button" className="mt-6 min-h-11 text-[var(--accent)]" onClick={onBack} title="Return to sign in.">
      Back to sign in
    </button>
  </div>;
  return <div className="space-y-4">
    <h2 className="text-lg font-display font-semibold text-[var(--ink)]">Reset your password</h2>
    <p className="text-sm text-[var(--muted)]">Enter your email and we&apos;ll send you a reset link.</p>
    <form action={formAction} className="space-y-3">
      <label htmlFor="forgot-email" className="block text-sm font-medium text-[var(--ink)]">Email</label>
      <Input id="forgot-email" name="email" type="email" autoComplete="email" className={fieldClass}
        value={email} onChange={(event) => setEmail(event.target.value)} required />
      {state?.error ? <Alert variant="error" role="alert">{state.error}</Alert> : null}
      <SubmitButton className="h-[54px] w-full rounded-xl" title="Send a reset link to this email address.">
        Send reset link
      </SubmitButton>
    </form>
    <button type="button" className="min-h-11 text-sm font-semibold text-[var(--accent)]"
      onClick={onBack} title="Return to sign in.">Back to sign in</button>
  </div>;
}

export function SignInForm({ initialForgot = false, initialEmail = "" }: {
  initialForgot?: boolean; initialEmail?: string;
}) {
  const [state, formAction] = useFormState(loginAction, emptyLoginState);
  const [forgotMode, setForgotMode] = useState(initialForgot);
  const [email, setEmail] = useState(initialEmail);
  if (forgotMode) return <ForgotPasswordView email={email} setEmail={setEmail} onBack={() => setForgotMode(false)} />;
  return <>
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="sign-in-email" className="mb-2 block text-sm font-medium text-[var(--ink)]">Email</label>
        <Input id="sign-in-email" name="email" type="email" autoComplete="email" required className={fieldClass}
          value={email} onChange={(event) => setEmail(event.target.value)} />
      </div>
      <div>
        <label htmlFor="sign-in-password" className="mb-2 block text-sm font-medium text-[var(--ink)]">Password</label>
        <Input id="sign-in-password" name="password" type="password" autoComplete="current-password"
          required className={fieldClass} />
      </div>
      <div className="flex justify-end">
        <button type="button" className="min-h-11 text-sm font-semibold text-[var(--accent)]"
          onClick={() => setForgotMode(true)} title="Reset your password.">Forgot password?</button>
      </div>
      {state.error ? <Alert variant="error" role="alert">{state.error}</Alert> : null}
      {state.blocked ? <div className="rounded-xl border border-[var(--warn)] bg-[var(--warn-bg)] p-3 text-sm text-[var(--warn)]">
        <p className="font-semibold">Need help getting back in?</p>
        <button type="button" className="mt-2 min-h-11 font-semibold underline" onClick={() => setForgotMode(true)}
          title="Reset your password.">Reset your password</button>
      </div> : null}
      <SignInButton />
    </form>
    <div className="mt-8 space-y-3 text-center">
      <p className="text-sm text-[var(--muted)]">New to Domus?</p>
      <Link href="/login?mode=signup" title="Create a Domus account."
        className="flex h-[52px] w-full items-center justify-center rounded-xl border border-[var(--line)]
          bg-[var(--surface)] font-semibold text-[var(--ink)]">Create an account</Link>
    </div>
  </>;
}
