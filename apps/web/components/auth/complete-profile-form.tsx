"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { mapAuthErrorMessage, validatePassword } from "@/lib/password-validation";

interface CompleteProfileFormProps {
  email: string;
}

const strengthBarColors = [
  "bg-red-500",
  "bg-orange-500",
  "bg-amber-400",
  "bg-emerald-500"
] as const;

export function CompleteProfileForm({ email }: CompleteProfileFormProps) {
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

      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(mapAuthErrorMessage(updateError.message));
        return;
      }

      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) {
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
        <label className="mb-1.5 block text-sm font-medium text-zinc-700" htmlFor="complete-profile-password">
          Password
        </label>
        <Input
          id="complete-profile-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Create a password"
          minLength={8}
          required
        />
        {passwordStrength.score > 0 ? (
          <div className="mt-2 space-y-2">
            <div className="grid grid-cols-4 gap-2" aria-hidden="true">
              {strengthBarColors.map((color, index) => (
                <div
                  key={color}
                  className={`h-1.5 rounded-full ${index < passwordStrength.score ? color : "bg-muted"}`}
                />
              ))}
            </div>
            <div className="flex items-start justify-between gap-3 text-xs">
              <span className="font-semibold text-foreground">{passwordStrength.label}</span>
              {passwordStrength.errors.length > 0 ? (
                <span className="text-right text-muted-foreground">{passwordStrength.errors.join(" · ")}</span>
              ) : (
                <span className="text-right text-emerald-600">Password looks good.</span>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-zinc-700" htmlFor="complete-profile-confirm-password">
          Confirm Password
        </label>
        <Input
          id="complete-profile-confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="Confirm your password"
          minLength={8}
          required
        />
        {confirmPassword.length > 0 && !passwordsMatch ? (
          <p className="mt-2 text-xs font-medium text-red-600">Passwords do not match yet.</p>
        ) : null}
      </div>

      {error ? (
        <Alert variant="error">
          {error}
        </Alert>
      ) : null}

      <Button type="submit" disabled={!canSubmit || loading} loading={loading} className="w-full" title={`Set a password for ${email}.`}>
        <Lock className="mr-2 h-4 w-4" />
        Complete Setup
      </Button>
    </form>
  );
}
