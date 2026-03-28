"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DomMascot } from "@/components/gamification/dom-mascot";
import { Button } from "@/components/ui/button";

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
  const [loading, setLoading] = useState(false);

  const callbackUrl = useMemo(() => {
    if (!tokenHash) {
      return null;
    }

    const params = new URLSearchParams();
    params.set("token_hash", tokenHash);
    if (type) {
      params.set("type", type);
    }
    return `/auth/callback?${params.toString()}`;
  }, [tokenHash, type]);

  if (!tokenHash || !callbackUrl) {
    return (
      <div className="app-surface flex min-h-screen items-center justify-center px-4 py-12">
        <div className="domus-card w-full max-w-lg border border-border/70 p-8 text-center shadow-xl">
          <DomMascot size="lg" mood="waving" className="mx-auto" />
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground">
            This link looks broken.
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Try signing in again and request a new email if you still need it.
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
        <DomMascot size="lg" mood="waving" className="mx-auto" />
        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground">
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
            <DomMascot size="lg" mood="waving" className="mx-auto" />
            <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground">
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
