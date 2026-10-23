"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { useNetworkErrorRetry } from "@/components/ui/use-network-error-retry";
import { Button } from "@/components/ui/button";

export default function OwnerError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { retrying } = useNetworkErrorRetry(error, reset);

  useEffect(() => {
    if (retrying) {
      Sentry.captureException(error, { level: "warning", tags: { auto_retry: "started" } });
    } else {
      Sentry.captureException(error);
    }
  }, [error, retrying]);

  if (retrying) {
    return (
      <div className="app-surface flex min-h-screen items-center justify-center px-4 py-12">
        <p role="status" aria-live="polite" className="text-sm text-[var(--muted)]">Loading again…</p>
      </div>
    );
  }

  return (
    <div className="app-surface flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-8 text-center
        shadow-[var(--domus-shadow-md)]">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-[var(--surface-2)]">
          <TriangleAlert className="h-7 w-7 text-[var(--accent)]" />
        </div>
        <h1 className="text-2xl font-semibold text-[var(--ink)]">Owner dashboard error</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Domus couldn&apos;t finish loading the owner workspace.
        </p>
        {error.digest ? (
          <p className="mt-3 text-xs text-[var(--faint)]">Ref: {error.digest}</p>
        ) : null}
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button type="button" onClick={reset} title="Try loading the owner dashboard again.">
            Try again
          </Button>
          <Button asChild variant="outline">
            <Link href="/owner" title="Return to the owner dashboard.">Back to dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
