"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import { Alert } from "@/components/ui/alert";

export function PasswordSettings() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

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

      setNewPassword("");
      setConfirmPassword("");
      setSuccess("Password updated successfully.");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to update password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-zinc-600">
        Set a new password for your Domus account. Use at least 6 characters.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-700" htmlFor="settings-new-password">
            New Password
          </label>
          <Input
            id="settings-new-password"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="Enter a new password"
            minLength={6}
            required
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-700" htmlFor="settings-confirm-password">
            Confirm Password
          </label>
          <Input
            id="settings-confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Confirm the new password"
            minLength={6}
            required
          />
        </div>
      </div>

      {success && (
        <Alert variant="success">
          {success}
        </Alert>
      )}

      {error && (
        <Alert variant="error">
          {error}
        </Alert>
      )}

      <Button type="submit" disabled={loading} title="Update your account password.">
        <Lock className="mr-2 h-4 w-4" />
        {loading ? "Updating..." : "Update Password"}
      </Button>
    </form>
  );
}
