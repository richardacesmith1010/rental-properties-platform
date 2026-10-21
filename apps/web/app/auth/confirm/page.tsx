"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildConfirmCallbackUrl } from "@/lib/route-resolver";

function getHeading(type: string | null) {
  if (type === "email") {
    return "Confirm your email";
  }
  if (type === "recovery") {
    return "Reset your password";
  }
  if (type === "invite") {
    return "Accept your invitation";
  }
  if (type === "magiclink") {
    return "Sign in to Domus";
  }
  if (type === "email_change") {
    return "Confirm email change";
  }

  return "Continue to Domus";
}

function ConfirmContent() {
  const searchParams = useSearchParams();
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const rawNext = searchParams.getAll("next");
  const nextParam = rawNext.length === 1 ? rawNext[0] : null;
  const [loading, setLoading] = useState(false);

  const callbackUrl = useMemo(() => {
    return buildConfirmCallbackUrl(tokenHash, type, nextParam);
  }, [tokenHash, type, nextParam]);

  if (!tokenHash || !callbackUrl) {
    return (
      <div className="app-surface flex min-h-screen items-center justify-center px-4 py-12">
        <div className="domus-card w-full max-w-lg border border-border/70 p-8 text-center shadow-xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--line)]
              bg-[var(--surface-2)]">
            <MailCheck className="h-7 w-7 text-[var(--ink-2)]" />
          </div>
          <h1 className="mt-6 text-3xl font-display font-semibold text-foreground">
            This link looks broken.
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Try signing in again. You can also ask for a new email.
          </p>
          <Button asChild className="mt-6 w-full" title="Go back to the sign-in page.">
            <Link href="/login">Back to login</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-surface flex min-h-screen items-center justify-center px-4 py-12">
      <div className="domus-card w-full max-w-lg border border-border/70 p-8 text-center shadow-xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--line)]
              bg-[var(--surface-2)]">
            <MailCheck className="h-7 w-7 text-[var(--ink-2)]" />
          </div>
        <h1 className="mt-6 text-3xl font-display font-semibold text-foreground">
          {getHeading(type)}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Tap once to keep going.
        </p>
        <Button
          className="mt-6 w-full"
          disabled={loading}
          title="Continue to the next step in Domus."
          onClick={() => {
            setLoading(true);
            window.location.href = callbackUrl;
          }}
        >
          {loading ? "Opening..." : "Continue"}
        </Button>
      </div>
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense
      fallback={
        <div className="app-surface flex min-h-screen items-center justify-center px-4 py-12">
          <div className="domus-card w-full max-w-lg border border-border/70 p-8 text-center shadow-xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--line)]
              bg-[var(--surface-2)]">
            <MailCheck className="h-7 w-7 text-[var(--ink-2)]" />
          </div>
            <h1 className="mt-6 text-3xl font-display font-semibold text-foreground">
              Continue to Domus
            </h1>
          </div>
        </div>
      }
    >
      <ConfirmContent />
    </Suspense>
  );
}
