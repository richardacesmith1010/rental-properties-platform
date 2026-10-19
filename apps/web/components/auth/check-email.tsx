"use client";

import { useEffect, useState } from "react";
import { CheckCircle } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function CheckEmail({ email, onForgot, onBack }: {
  email: string; onForgot: () => void; onBack: () => void;
}) {
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resendSeconds, setResendSeconds] = useState(0);
  useEffect(() => {
    if (resendSeconds === 0) return;
    const timer = window.setTimeout(() => setResendSeconds((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendSeconds]);
  async function handleResend() {
    if (resendSeconds > 0) return;
    try {
      const supabase = createClient();
      await supabase.auth.resend({
        type: "signup", email, options: { emailRedirectTo: `${window.location.origin}/auth/callback` }
      });
      setResendMessage("If this email needs confirming, we sent a new link. Check your inbox.");
      setResendSeconds(60);
    } catch (caughtError) {
      if (caughtError instanceof TypeError) {
        setResendMessage("Check your connection and try again.");
        return;
      }
      setResendMessage("If this email needs confirming, we sent a new link. Check your inbox.");
      setResendSeconds(60);
    }
  }
  return <div className="flex flex-col items-center py-4 text-center">
    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--pos-bg)]">
      <CheckCircle className="h-7 w-7 text-[var(--pos)]" />
    </div>
    <h2 className="text-lg font-display font-semibold text-[var(--ink)]">Check your email</h2>
    <p className="mt-2 text-sm text-[var(--muted)]">
      We sent a confirmation link to <span className="font-medium text-[var(--ink)]">{email}</span>.
      Click the link in your email to finish setting up your account.
    </p>
    <p className="mt-3 text-sm text-[var(--muted)]">
      Used this email with Domus before? Use the link in your invite email, or tap{" "}
      <button type="button" className="min-h-11 font-semibold text-[var(--accent)]" onClick={onForgot}
        title="Reset your password.">Forgot password</button>.
    </p>
    {resendMessage ? <Alert variant="success" className="mt-4">{resendMessage}</Alert> : null}
    <Button type="button" variant="outline" className="mt-4 min-h-11" onClick={handleResend}
      disabled={resendSeconds > 0} title="Send the confirmation email again.">
      {resendSeconds > 0 ? `Try again in ${resendSeconds}s` : "Send it again"}
    </Button>
    <Button type="button" variant="outline" className="mt-6 min-h-11" onClick={onBack}
      title="Return to sign in.">Back to sign in</Button>
  </div>;
}
