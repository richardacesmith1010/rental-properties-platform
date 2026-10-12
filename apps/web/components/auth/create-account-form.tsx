"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckEmail } from "@/components/auth/check-email";
import { SignInForm } from "@/components/auth/sign-in-form";
import { PasswordStrengthMeter } from "@/components/auth/password-strength-meter";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mapAuthErrorMessage, validatePassword } from "@/lib/password-validation";
import { createClient } from "@/lib/supabase/client";

type Role = "owner" | "manager" | "tenant";
const roles: { id: Role; label: string; note: string }[] = [
  { id: "owner", label: "I own rentals", note: "Track rent, bills and taxes" },
  { id: "manager", label: "I manage rentals for others", note: "Run homes for owners" },
  { id: "tenant", label: "I rent a home", note: "Pay rent and report problems" }
];
const fieldClass = "h-[52px] rounded-[14px]";
function allowedRole(value?: string): Role {
  return roles.find((role) => role.id === value)?.id ?? "owner";
}

export function CreateAccountForm({ initialRole }: { initialRole?: string }) {
  const [role, setRole] = useState<Role>(() => allowedRole(initialRole));
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [signupComplete, setSignupComplete] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordStrength = validatePassword(password);
  const passwordsMatch = confirmPassword.length === 0 || password === confirmPassword;
  const canSubmit = passwordStrength.isValid && confirmPassword.length > 0 && password === confirmPassword;

  async function handleSignupSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (!passwordStrength.isValid) {
        setError(passwordStrength.errors[0] ?? "Use at least 8 characters with a capital letter and a number.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match yet.");
        return;
      }
      // Validate again at the call boundary, including the callback destination.
      const selectedRole = allowedRole(role);
      const rolePath = `/${selectedRole}`;
      const emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(rolePath)}`;
      const supabase = createClient();
      const { error: signUpError } = await supabase.auth.signUp({
        email, password, options: { emailRedirectTo, data: { role: selectedRole } }
      });
      if (signUpError) {
        if (signUpError.code === "user_already_exists" || /already registered/i.test(signUpError.message)) {
          setSignupComplete(true);
          return;
        }
        setError(mapAuthErrorMessage(signUpError.message));
        return;
      }
      setSignupComplete(true);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? mapAuthErrorMessage(caughtError.message) : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  if (showForgot) return <SignInForm initialForgot initialEmail={email} />;
  if (signupComplete) return <CheckEmail email={email} onForgot={() => setShowForgot(true)}
    onBack={() => { window.location.assign("/login"); }} />;

  return <>
    <Link href="/login" className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--accent)]"
      title="Return to sign in.">‹ Sign in</Link>
    <h1 className="mt-4 text-[34px] font-bold leading-tight text-[var(--ink)]">Create your account</h1>
    <p className="mt-2 text-[17px] text-[var(--muted)]">First, what brings you to Domus?</p>
    {step === 1 ? <div className="mt-8 space-y-5">
      <div role="radiogroup" aria-label="I am" className="space-y-3">
        {roles.map((option) => <label key={option.id} title={`Select ${option.label}.`}
          className={`flex h-[72px] cursor-pointer items-center gap-4 rounded-2xl border-2 bg-[var(--surface)] px-4
            ${role === option.id ? "border-[var(--accent)]" : "border-[var(--line)]"}`}>
          <input type="radio" name="role" value={option.id} checked={role === option.id}
            onChange={() => setRole(option.id)} className="h-5 w-5 accent-[var(--accent)]" />
          <span><span className="block text-sm font-semibold text-[var(--ink)]">{option.label}</span>
            <span className="block text-xs text-[var(--muted)]">{option.note}</span></span>
        </label>)}
      </div>
      <p className="text-center text-[13px] text-[var(--muted)]">
        Renting from someone on Domus? Use the link they sent you.
      </p>
      <Button type="button" className="h-[54px] w-full rounded-2xl text-[var(--accent-contrast)]" onClick={() => setStep(2)}
        title="Continue to account details.">Continue</Button>
    </div> : <div className="mt-8">
      <button type="button" className="mb-5 min-h-11 text-sm font-semibold text-[var(--accent)]"
        onClick={() => setStep(1)} title="Change account type.">‹ Change</button>
      <form onSubmit={handleSignupSubmit} className="space-y-4">
        <div><label htmlFor="signup-email" className="mb-2 block text-sm font-medium text-[var(--ink)]">Email</label>
          <Input id="signup-email" name="email" type="email" autoComplete="email" required className={fieldClass}
            value={email} onChange={(event) => setEmail(event.target.value)} /></div>
        <div><label htmlFor="signup-password" className="mb-2 block text-sm font-medium text-[var(--ink)]">Password</label>
          <Input id="signup-password" name="password" type="password" autoComplete="new-password" minLength={8}
            required className={fieldClass} value={password} onChange={(event) => setPassword(event.target.value)} />
          <PasswordStrengthMeter password={password} /></div>
        <div><label htmlFor="signup-confirm" className="mb-2 block text-sm font-medium text-[var(--ink)]">
          Confirm password</label>
          <Input id="signup-confirm" name="confirmPassword" type="password" autoComplete="new-password" minLength={8}
            required className={fieldClass} value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)} />
          {confirmPassword.length > 0 && !passwordsMatch ? <p className="mt-2 text-xs font-medium text-[var(--crit)]">
            Passwords do not match yet.</p> : null}</div>
        {error ? <Alert variant="error" role="alert">{error}</Alert> : null}
        <Button type="submit" loading={loading} disabled={!canSubmit || loading}
          className="h-[54px] w-full rounded-2xl text-[var(--accent-contrast)]"
          title="Create your Domus account.">Create account</Button>
      </form>
    </div>}
  </>;
}
