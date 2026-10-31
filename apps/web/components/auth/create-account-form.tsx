"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { CheckEmail } from "@/components/auth/check-email";
import { SignInForm } from "@/components/auth/sign-in-form";
import { PasswordStrengthMeter } from "@/components/auth/password-strength-meter";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { validatePassword } from "@/lib/password-validation";
import type { signUpAction } from "@/app/actions/sign-up";
import { SubmitButton } from "@/components/shared/submit-button";
import { LegalAgreementCheckbox } from "@/components/legal/legal-agreement-checkbox";
import { LEGAL_DOCUMENTS } from "@/lib/legal-versions";

type Role = "owner" | "manager" | "tenant";
const roles: { id: Role; label: string; note: string }[] = [
  { id: "owner", label: "I own rentals", note: "Track rent, bills and taxes" },
  { id: "manager", label: "I manage rentals for others", note: "Run homes for owners" },
  { id: "tenant", label: "I rent a home", note: "Pay rent and report problems" }
];
const fieldClass = "h-[52px] rounded-xl";
function allowedRole(value?: string): Role {
  return roles.find((role) => role.id === value)?.id ?? "owner";
}

export function CreateAccountForm({ initialRole, action }: { initialRole?: string; action: typeof signUpAction }) {
  const [state, formAction] = useActionState(action, null);
  const [agreed, setAgreed] = useState(false);
  const [role, setRole] = useState<Role>(() => allowedRole(initialRole));
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showForgot, setShowForgot] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordStrength = validatePassword(password);
  const passwordsMatch = confirmPassword.length === 0 || password === confirmPassword;
  const canSubmit = passwordStrength.isValid && confirmPassword.length > 0 && password === confirmPassword;

  useEffect(() => {
    if (state?.error) {
      setError(state.error);
      if (state.error === "Check the box to agree first.") document.getElementById("signup-agree")?.focus();
    }
  }, [state]);
  function handleSignupSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (!canSubmit) {
      event.preventDefault();
      setError(passwordStrength.isValid ? "Passwords do not match yet." : passwordStrength.errors[0]);
      return;
    }
    if (!agreed) {
      event.preventDefault();
      setError("Check the box to agree first.");
      document.getElementById("signup-agree")?.focus();
    }
  }

  if (showForgot) return <SignInForm initialForgot initialEmail={email} />;
  if (state?.success) return <CheckEmail email={email} onForgot={() => setShowForgot(true)}
    onBack={() => { window.location.assign("/login"); }} />;

  return <>
    <Link href="/login" className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--accent)]"
      title="Return to sign in.">‹ Sign in</Link>
    <h1 className="mt-4 text-[34px] font-display font-semibold leading-tight text-[var(--ink)]">Create your account</h1>
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
      <Button type="button" className="h-[54px] w-full rounded-xl bg-[var(--action)] text-[var(--action-contrast)]
        hover:bg-[var(--action-strong)]" onClick={() => setStep(2)}
        title="Continue to account details.">Continue</Button>
    </div> : <div className="mt-8">
      <button type="button" className="mb-5 min-h-11 text-sm font-semibold text-[var(--accent)]"
        onClick={() => setStep(1)} title="Change account type.">‹ Change</button>
      <form action={formAction} onSubmit={handleSignupSubmit} className="space-y-4">
        <input type="hidden" name="role" value={role} />
        <input type="hidden" name="termsVersion" value={LEGAL_DOCUMENTS.terms.current} />
        <input type="hidden" name="privacyVersion" value={LEGAL_DOCUMENTS.privacy.current} />
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
        {error ? <Alert id="signup-error" variant="error" role="alert">{error}</Alert> : null}
        <LegalAgreementCheckbox id="signup-agree" checked={agreed} onCheckedChange={(value) => {
          setAgreed(value); setError(null);
        }} invalid={error === "Check the box to agree first."}
          describedBy={error === "Check the box to agree first." ? "signup-error" : undefined} />
        <SubmitButton disabled={!canSubmit}
          className="h-[54px] w-full rounded-xl bg-[var(--action)] text-[var(--action-contrast)] hover:bg-[var(--action-strong)]"
          title="Create your Domus account.">Create account</SubmitButton>

      </form>
    </div>}
  </>;
}
