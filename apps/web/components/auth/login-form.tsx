"use client";

import { useMemo, useState } from "react";
import { useFormState } from "react-dom";
import { CheckCircle, Loader2, Lock } from "lucide-react";
import { forgotPasswordAction } from "@/app/actions/forgot-password";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

interface LoginFormProps {
  nextPath?: string;
  role?: "owner" | "manager" | "tenant";
}

type AuthMode = "signin" | "signup";

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

function ForgotPasswordPanel({
  email,
  inputIdSuffix,
  onBack,
  setEmail
}: {
  email: string;
  inputIdSuffix: string;
  onBack: () => void;
  setEmail: (value: string) => void;
}) {
  const [state, formAction] = useFormState(forgotPasswordAction, null);

  if (state?.success) {
    return (
      <div className="flex flex-col items-center py-4 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle className="h-7 w-7 text-emerald-600" />
        </div>
        <h3 className="text-lg font-semibold text-zinc-900">Check your email</h3>
        <p className="mt-2 text-sm text-zinc-500">
          If an account exists for <span className="font-medium text-zinc-700">{email}</span>, a password reset link has been sent.
        </p>
        <Button type="button" variant="outline" className="mt-6" onClick={onBack}>
          Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-zinc-900">Reset your password</h3>
        <p className="mt-1 text-sm text-zinc-500">
          Enter your email and we&apos;ll send you a reset link.
        </p>
      </div>

      <form action={formAction} className="space-y-3">
        <div>
          <label
            htmlFor={`forgot-email-${inputIdSuffix}`}
            className="mb-1.5 block text-sm font-medium text-zinc-700"
          >
            Email
          </label>
          <Input
            id={`forgot-email-${inputIdSuffix}`}
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
          />
        </div>

        {state?.error ? <Alert variant="error">{state.error}</Alert> : null}

        <SubmitButton className="w-full" title="Send a password reset link to this email address.">
          Send Reset Link
        </SubmitButton>
      </form>

      <p className="text-center text-sm text-zinc-600">
        <button
          type="button"
          className="font-semibold text-violet-600 hover:text-violet-500"
          onClick={onBack}
        >
          Back to sign in
        </button>
      </p>
    </div>
  );
}

export function LoginForm({ nextPath = "/", role }: LoginFormProps) {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [forgotMode, setForgotMode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [signupComplete, setSignupComplete] = useState(false);
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();

      if (mode === "signup") {
        if (password.length < 6) {
          setError("Password should be at least 6 characters.");
          setLoading(false);
          return;
        }

        if (password !== confirmPassword) {
          setError("Passwords do not match.");
          setLoading(false);
          return;
        }

        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo,
            data: role ? { role } : undefined
          }
        });

        if (signUpError) {
          setError(mapAuthError(signUpError.message));
          setLoading(false);
          return;
        }

        if (data.user && data.user.identities && data.user.identities.length === 0) {
          setError("An account with this email already exists. Try signing in.");
          setLoading(false);
          return;
        }

        setSignupComplete(true);
        setLoading(false);
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(mapAuthError(signInError.message));
        setLoading(false);
        return;
      }

      window.location.href = nextPath;
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to complete authentication.");
      setLoading(false);
    }
  }

  if (signupComplete) {
    return (
      <div className="flex flex-col items-center py-4 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle className="h-7 w-7 text-emerald-600" />
        </div>
        <h3 className="text-lg font-semibold text-zinc-900">Check your email</h3>
        <p className="mt-2 text-sm text-zinc-500">
          We sent a confirmation link to <span className="font-medium text-zinc-700">{email}</span>.
          Click the link in your email to activate your account.
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-6"
          onClick={() => {
            setSignupComplete(false);
            setMode("signin");
            setPassword("");
            setConfirmPassword("");
            setError(null);
          }}
        >
          Back to sign in
        </Button>
      </div>
    );
  }

  if (mode === "signin" && forgotMode) {
    return (
      <ForgotPasswordPanel
        email={email}
        inputIdSuffix={inputIdSuffix}
        setEmail={setEmail}
        onBack={() => {
          setForgotMode(false);
          setError(null);
        }}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label htmlFor={`email-${inputIdSuffix}`} className="mb-1.5 block text-sm font-medium text-zinc-700">
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

      <div>
        <label htmlFor={`password-${inputIdSuffix}`} className="mb-1.5 block text-sm font-medium text-zinc-700">
          Password
        </label>
        <Input
          id={`password-${inputIdSuffix}`}
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={mode === "signup" ? "Create a password (6+ characters)" : "Enter your password"}
          minLength={6}
          required
        />
      </div>

      {mode === "signin" ? (
        <div className="flex justify-end">
          <button
            type="button"
            className="text-sm text-violet-600 hover:text-violet-800"
            onClick={() => {
              setForgotMode(true);
              setError(null);
            }}
          >
            Forgot password?
          </button>
        </div>
      ) : null}

      {mode === "signup" ? (
        <div>
          <label htmlFor={`confirm-password-${inputIdSuffix}`} className="mb-1.5 block text-sm font-medium text-zinc-700">
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
      ) : null}

      <Button
        type="submit"
        disabled={loading}
        aria-disabled={loading}
        className={`w-full ${loading ? "pointer-events-none opacity-60" : ""}`}
      >
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
        {loading
          ? mode === "signup"
            ? "Creating account..."
            : "Signing in..."
          : mode === "signup"
            ? "Create Account"
            : "Sign In"}
      </Button>

      {mode === "signin" ? (
        <p className="text-center text-sm text-zinc-600">
          Don&apos;t have an account?{" "}
          <button
            type="button"
            className="font-semibold text-violet-600 hover:text-violet-500"
            onClick={() => {
              setMode("signup");
              setError(null);
            }}
          >
            Sign up
          </button>
        </p>
      ) : null}

      {mode === "signup" ? (
        <p className="text-center text-sm text-zinc-600">
          Already have an account?{" "}
          <button
            type="button"
            className="font-semibold text-violet-600 hover:text-violet-500"
            onClick={() => {
              setMode("signin");
              setError(null);
            }}
          >
            Sign in
          </button>
        </p>
      ) : null}

      {error ? <Alert variant="error">{error}</Alert> : null}
    </form>
  );
}
