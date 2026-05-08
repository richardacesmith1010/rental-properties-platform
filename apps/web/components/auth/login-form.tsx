"use client";

import { useMemo, useState } from "react";
import { useFormState } from "react-dom";
import { CheckCircle, Lock } from "lucide-react";
import { forgotPasswordAction } from "@/app/actions/forgot-password";
import { loginAction, type LoginActionState } from "@/app/actions/login";
import { PasswordStrengthMeter } from "@/components/auth/password-strength-meter";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mapAuthErrorMessage, validatePassword } from "@/lib/password-validation";
import { createClient } from "@/lib/supabase/client";

interface LoginFormProps {
  nextPath?: string;
  role?: "owner" | "manager" | "tenant";
}

type AuthMode = "signin" | "signup";

const emptyLoginState: LoginActionState = {};
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
        <h3 className="text-lg font-semibold text-foreground">Check your email</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          If an account exists for <span className="font-medium text-foreground">{email}</span>, a reset link has been sent.
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
        <h3 className="text-lg font-semibold text-foreground">Reset your password</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter your email and we&apos;ll send you a reset link.
        </p>
      </div>

      <form action={formAction} className="space-y-3">
        <div>
          <label
            htmlFor={`forgot-email-${inputIdSuffix}`}
            className="mb-1.5 block text-sm font-medium text-foreground"
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

        <SubmitButton className="w-full" title="Send a reset link to this email address.">
          Send reset link
        </SubmitButton>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        <button
          type="button"
          className="font-semibold text-primary hover:text-primary/80"
          onClick={onBack}
        >
          Back to sign in
        </button>
      </p>
    </div>
  );
}

function SignInPanel({
  email,
  password,
  inputIdSuffix,
  onEmailChange,
  onPasswordChange,
  onForgotPassword,
  onSwitchToSignup
}: {
  email: string;
  password: string;
  inputIdSuffix: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onForgotPassword: () => void;
  onSwitchToSignup: () => void;
}) {
  const [state, formAction] = useFormState(loginAction, emptyLoginState);

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label htmlFor={`email-${inputIdSuffix}`} className="mb-1.5 block text-sm font-medium text-foreground">
          Email
        </label>
        <Input
          id={`email-${inputIdSuffix}`}
          name="email"
          type="email"
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
          placeholder="you@example.com"
          required
        />
      </div>

      <div>
        <label htmlFor={`password-${inputIdSuffix}`} className="mb-1.5 block text-sm font-medium text-foreground">
          Password
        </label>
        <Input
          id={`password-${inputIdSuffix}`}
          name="password"
          type="password"
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
          placeholder="Enter your password"
          required
        />
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          className="text-sm text-primary hover:text-primary/80"
          onClick={onForgotPassword}
        >
          Forgot password?
        </button>
      </div>

      {state.error ? <Alert variant="error">{state.error}</Alert> : null}

      {state.blocked ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">Need help getting back in?</p>
          <button
            type="button"
            className="mt-2 font-semibold text-amber-900 underline underline-offset-4 hover:text-amber-700"
            onClick={onForgotPassword}
          >
            Reset your password
          </button>
        </div>
      ) : null}

      <SubmitButton className="w-full" title="Sign in to your Domus account.">
        <Lock className="mr-2 h-4 w-4" />
        Sign in
      </SubmitButton>

      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <button
          type="button"
          className="font-semibold text-primary hover:text-primary/80"
          onClick={onSwitchToSignup}
        >
          Sign up
        </button>
      </p>
    </form>
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

  const passwordStrength = validatePassword(password);
  const passwordsMatch = confirmPassword.length === 0 || password === confirmPassword;
  const canSubmitSignup = passwordStrength.isValid && confirmPassword.length > 0 && password === confirmPassword;

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

      const supabase = createClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo,
          data: role ? { role } : undefined
        }
      });

      if (signUpError) {
        setError(mapAuthErrorMessage(signUpError.message));
        return;
      }

      if (data.user && data.user.identities && data.user.identities.length === 0) {
        setError("This email already has an account. Try signing in instead.");
        return;
      }

      setSignupComplete(true);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? mapAuthErrorMessage(caughtError.message) : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  if (signupComplete) {
    return (
      <div className="flex flex-col items-center py-4 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle className="h-7 w-7 text-emerald-600" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">Check your email</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          We sent a confirmation link to <span className="font-medium text-foreground">{email}</span>.
          Click the link in your email to finish setting up your account.
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

  if (mode === "signin") {
    return (
      <SignInPanel
        email={email}
        password={password}
        inputIdSuffix={inputIdSuffix}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onForgotPassword={() => {
          setForgotMode(true);
          setError(null);
        }}
        onSwitchToSignup={() => {
          setMode("signup");
          setError(null);
          setPassword("");
          setConfirmPassword("");
        }}
      />
    );
  }

  return (
    <form onSubmit={handleSignupSubmit} className="space-y-3">
      <div>
        <label htmlFor={`email-${inputIdSuffix}`} className="mb-1.5 block text-sm font-medium text-foreground">
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
        <label htmlFor={`password-${inputIdSuffix}`} className="mb-1.5 block text-sm font-medium text-foreground">
          Password
        </label>
        <Input
          id={`password-${inputIdSuffix}`}
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
        <label htmlFor={`confirm-password-${inputIdSuffix}`} className="mb-1.5 block text-sm font-medium text-foreground">
          Confirm Password
        </label>
        <Input
          id={`confirm-password-${inputIdSuffix}`}
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

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Button
        type="submit"
        loading={loading}
        disabled={!canSubmitSignup || loading}
        className="w-full"
        title="Create your Domus account."
      >
        <Lock className="mr-2 h-4 w-4" />
        Create account
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <button
          type="button"
          className="font-semibold text-primary hover:text-primary/80"
          onClick={() => {
            setMode("signin");
            setError(null);
            setPassword("");
            setConfirmPassword("");
          }}
        >
          Sign in
        </button>
      </p>
    </form>
  );
}
