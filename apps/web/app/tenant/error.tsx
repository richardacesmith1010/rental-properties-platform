"use client";

import Link from "next/link";
import { DomMascot } from "@/components/gamification/dom-mascot";
import { Button } from "@/components/ui/button";

export default function TenantError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="app-surface flex min-h-screen items-center justify-center px-4 py-12">
      <div className="domus-card w-full max-w-md p-8 text-center shadow-[var(--domus-shadow-lg)]">
        <div className="mx-auto mb-4 flex w-fit items-center justify-center rounded-3xl bg-[var(--accent-weak)] px-4 py-3">
          <DomMascot size="lg" mood="sleeping" />
        </div>
        <h1 className="text-2xl font-semibold text-[var(--ink)]">We couldn&apos;t load your tenant dashboard</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Try again, or return to your dashboard.
        </p>
        {error.digest ? (
          <p className="mt-3 text-xs tabular-nums text-[var(--muted)]">Reference: {error.digest}</p>
        ) : null}
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button
            type="button"
            onClick={reset}
            title="Try loading your tenant dashboard again."
          >
            Try again
          </Button>
          <Button asChild variant="outline">
            <Link href="/tenant" title="Return to your tenant dashboard.">Back to dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
