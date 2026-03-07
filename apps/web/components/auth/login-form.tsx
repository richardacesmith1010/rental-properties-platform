"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Mail, Lock } from "lucide-react";

interface LoginFormProps {
  nextPath?: string;
}

type AuthMode = "signin" | "signup" | "magic-link";

function mapAuthError(message: string) {
  if (message.includes("Invalid login credentials")) {
    return "Incorrect email or password.";
  }

  if (message.includes("User already registered")) {
    return "An account with this email already exists. Try signing in.";
  }

  if (message.includes("Password should be at least 6 characters")) {
    return message;
  }

  return message;
}

export function LoginForm({ nextPath = "/portal" }: LoginFormProps) {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inputIdSuffix = useMemo(() => {
    const sanitized = nextPath.replace(/[^a-z0-9_-]/gi, "-");
    return sanitized.length > 0 ? sanitized : "portal";
  }, [nextPath]);

  const emailRedirectTo = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
  }, [nextPath]);

  async function handleMagicLink() {
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      if (!email.trim()) {
        setError("Enter your email address first.");
        return;
      }

      const supabase = createClient();
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo
        }
      });

      if (otpError) {
        setError(mapAuthError(otpError.message));
        return;
      }

      setMessage("Check your email for the secure sign-in link.");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to send sign-in link.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const supabase = createClient();

      if (mode === "signup") {
        if (password.length < 6) {
          setError("Password should be at least 6 characters");
          return;
        }

        if (password !== confirmPassword) {
          setError("Passwords do not match.");
          return;
        }

        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo
          }
        });

        if (signUpError) {
          setError(mapAuthError(signUpError.message));
          return;
        }

        setMessage("Check your email to confirm your account.");
        return;
      }

      if (mode === "magic-link") {
        await handleMagicLink();
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (signInError) {
        setError(mapAuthError(signInError.message));
        return;
      }

      window.location.href = nextPath;
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to complete authentication.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label
          htmlFor={`email-${inputIdSuffix}`}
          className="mb-1.5 block text-sm font-medium text-zinc-700"
        >
          Email
        </label>
        <Input
          id={`email-${inputIdSuffix}`}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          required
        />
      </div>

      {mode !== "magic-link" && (
        <div>
          <label
            htmlFor={`password-${inputIdSuffix}`}
            className="mb-1.5 block text-sm font-medium text-zinc-700"
          >
            Password
          </label>
          <Input
            id={`password-${inputIdSuffix}`}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
            minLength={6}
            required
          />
        </div>
      )}

      {mode === "signup" && (
        <div>
          <label
            htmlFor={`confirm-password-${inputIdSuffix}`}
            className="mb-1.5 block text-sm font-medium text-zinc-700"
          >
            Confirm Password
          </label>
          <Input
            id={`confirm-password-${inputIdSuffix}`}
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Confirm your password"
            minLength={6}
            required
          />
        </div>
      )}

      <Button type="submit" disabled={loading} className="w-full">
        {mode === "signup" ? (
          <Lock className="mr-2 h-4 w-4" />
        ) : (
          <Mail className="mr-2 h-4 w-4" />
        )}
        {loading
          ? mode === "signup"
            ? "Creating account..."
            : mode === "magic-link"
              ? "Sending link..."
              : "Signing in..."
          : mode === "signup"
            ? "Create Account"
            : mode === "magic-link"
              ? "Send Magic Link"
              : "Sign In"}
      </Button>

      {mode === "signin" && (
        <>
          <div className="relative py-1 text-center text-xs text-zinc-500">
            <span className="before:absolute before:left-0 before:top-1/2 before:h-px before:w-[44%] before:bg-zinc-200 after:absolute after:right-0 after:top-1/2 after:h-px after:w-[44%] after:bg-zinc-200">
              or
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={async () => {
              setMode("magic-link");
              setMessage(null);
              setError(null);
              await handleMagicLink();
            }}
          >
            Send magic link
          </Button>
          <p className="text-center text-sm text-zinc-600">
            Don&apos;t have an account?{" "}
            <button
              type="button"
              className="font-semibold text-indigo-600 hover:text-indigo-500"
              onClick={() => {
                setMode("signup");
                setMessage(null);
                setError(null);
              }}
            >
              Sign up
            </button>
          </p>
        </>
      )}

      {mode === "signup" && (
        <p className="text-center text-sm text-zinc-600">
          Already have an account?{" "}
          <button
            type="button"
            className="font-semibold text-indigo-600 hover:text-indigo-500"
            onClick={() => {
              setMode("signin");
              setMessage(null);
              setError(null);
            }}
          >
            Sign in
          </button>
        </p>
      )}

      {mode === "magic-link" && (
        <p className="text-center text-sm text-zinc-600">
          Prefer password sign-in?{" "}
          <button
            type="button"
            className="font-semibold text-indigo-600 hover:text-indigo-500"
            onClick={() => {
              setMode("signin");
              setMessage(null);
              setError(null);
            }}
          >
            Back to sign in
          </button>
        </p>
      )}

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
