"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { mapAuthErrorMessage, validatePassword } from "@/lib/password-validation";

const strengthBarColors = [
  "bg-red-500",
  "bg-orange-500",
  "bg-amber-400",
  "bg-emerald-500"
] as const;

export function ResetPasswordForm() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordStrength = validatePassword(newPassword);
  const passwordsMatch = confirmPassword.length === 0 || newPassword === confirmPassword;
  const canSubmit = passwordStrength.isValid && confirmPassword.length > 0 && newPassword === confirmPassword;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!passwordStrength.isValid) {
        setError(passwordStrength.errors[0] ?? "Use at least 8 characters with a capital letter and a number.");
        return;
      }

      if (newPassword !== confirmPassword) {
        setError("Passwords do not match yet.");
        return;
      }

      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        setError(mapAuthErrorMessage(updateError.message));
        return;
      }

      await supabase.auth.signOut();
      window.location.href = "/login?password_reset=true";
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
      <p className="text-sm text-zinc-600">
        Set a new password for your Domus account.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-700" htmlFor="reset-new-password">
            New Password
          </label>
          <Input
            id="reset-new-password"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="Create a new password"
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
          <label className="mb-1.5 block text-sm font-medium text-zinc-700" htmlFor="reset-confirm-password">
            Confirm Password
          </label>
          <Input
            id="reset-confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Confirm your new password"
            minLength={8}
            required
          />
          {confirmPassword.length > 0 && !passwordsMatch ? (
            <p className="mt-2 text-xs font-medium text-red-600">Passwords do not match yet.</p>
          ) : null}
        </div>
      </div>

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Button type="submit" disabled={!canSubmit || loading} loading={loading} title="Update your account password.">
        <Lock className="mr-2 h-4 w-4" />
        Update Password
      </Button>
    </form>
  );
}
