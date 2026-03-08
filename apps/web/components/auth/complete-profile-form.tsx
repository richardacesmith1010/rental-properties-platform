"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

interface CompleteProfileFormProps {
  email: string;
}

const rolePaths: Record<string, string> = {
  owner: "/owner",
  manager: "/manager",
  tenant: "/tenant"
};

export function CompleteProfileForm({ email }: CompleteProfileFormProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (password.length < 6) {
        setError("Password should be at least 6 characters.");
        return;
      }

      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }

      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }

      const {
        data: { user }
      } = await supabase.auth.getUser();

      const role =
        typeof user?.user_metadata?.role === "string" ? user.user_metadata.role : "tenant";

      window.location.href = rolePaths[role] ?? "/tenant";
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to complete profile setup."
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
          placeholder="Create a password (6+ characters)"
          minLength={6}
          required
        />
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
          minLength={6}
          required
        />
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <Button type="submit" disabled={loading} className="w-full" title={`Set a password for ${email}.`}>
        <Lock className="mr-2 h-4 w-4" />
        {loading ? "Completing setup..." : "Complete Setup"}
      </Button>
    </form>
  );
}
