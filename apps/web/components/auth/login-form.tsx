"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";

interface LoginFormProps {
  nextPath?: string;
}

export function LoginForm({ nextPath = "/portal" }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const supabase = createClient();
      const origin = window.location.origin;

      const { error: signInError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`
        }
      });

      if (signInError) {
        setError(signInError.message);
      } else {
        setMessage("Check your email for the secure sign-in link.");
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label
          htmlFor={`email-${nextPath}`}
          className="mb-1.5 block text-sm font-medium text-zinc-700"
        >
          Email
        </label>
        <Input
          id={`email-${nextPath}`}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          required
        />
      </div>

      <Button type="submit" disabled={loading} className="w-full">
        <Mail className="mr-2 h-4 w-4" />
        {loading ? "Sending link..." : "Send sign-in link"}
      </Button>

      {message && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
