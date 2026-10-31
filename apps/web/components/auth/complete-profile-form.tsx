"use client";

import type { recordInviteAgreement } from "@/app/actions/legal-acceptance";
import { LegalAgreementCheckbox } from "@/components/legal/legal-agreement-checkbox";
import { LEGAL_DOCUMENTS } from "@/lib/legal-versions";

import { useState } from "react";
import { Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PasswordStrengthMeter } from "@/components/auth/password-strength-meter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { mapAuthErrorMessage, validatePassword } from "@/lib/password-validation";

interface CompleteProfileFormProps {
  email: string;
  needsAgreement: boolean;
  recordAgreement: typeof recordInviteAgreement;
}

export function CompleteProfileForm({ email, needsAgreement, recordAgreement }: CompleteProfileFormProps) {
  const [agreed, setAgreed] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordStrength = validatePassword(password);
  const passwordsMatch = confirmPassword.length === 0 || password === confirmPassword;
  const canSubmit = passwordStrength.isValid && confirmPassword.length > 0 && password === confirmPassword;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
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

      if (needsAgreement) {
        if (!agreed) {
          setError("Check the box to agree first.");
          document.getElementById("invite-agree")?.focus();
          return;
        }
        const result = await recordAgreement({ agreed, termsVersion: LEGAL_DOCUMENTS.terms.current,
          privacyVersion: LEGAL_DOCUMENTS.privacy.current });
        if (!result.success) { setError(result.error ?? null); return; }
      }
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(mapAuthErrorMessage(updateError.message));
        return;
      }

      const {
        data: { user }, error: userError
      } = await supabase.auth.getUser();
      if (userError || !user) {
        setError("Your session expired. Please sign in again.");
        return;
      }

      window.location.href = "/onboarding";
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? mapAuthErrorMessage(caughtError.message) : "Something went wrong. Try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]" htmlFor="complete-profile-password">
          Password
        </label>
        <Input
          className="rounded-xl"
          id="complete-profile-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Create a password"
          minLength={8}
          required
        />
        <PasswordStrengthMeter password={password} />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]" htmlFor="complete-profile-confirm-password">
          Confirm Password
        </label>
        <Input
          className="rounded-xl"
          id="complete-profile-confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="Confirm your password"
          minLength={8}
          required
        />
        {confirmPassword.length > 0 && !passwordsMatch ? (
          <p className="mt-2 text-xs font-medium text-[var(--crit)]">Passwords do not match yet.</p>
        ) : null}
      </div>

      {error ? (
        <Alert id="invite-error" variant="error" role="alert">
          {error}
        </Alert>
      ) : null}

      {needsAgreement ? <LegalAgreementCheckbox id="invite-agree" checked={agreed} onCheckedChange={setAgreed}
        invalid={Boolean(error)} describedBy={error ? "invite-error" : undefined} /> : null}
      <Button type="submit" disabled={!canSubmit || loading} loading={loading} className="w-full rounded-xl"
        title={`Set a password for ${email}.`}>
        <Lock className="mr-2 h-4 w-4" />
        Complete Setup
      </Button>
    </form>
  );
}
