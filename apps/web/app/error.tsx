"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { TriangleAlert } from "lucide-react";
import { useNetworkErrorRetry } from "@/components/ui/use-network-error-retry";

export default function Error({
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
      <div className="w-full max-w-md rounded-2xl border border-[var(--line)]
        bg-[color-mix(in_srgb,var(--surface)_95%,transparent)] p-8 text-center shadow-xl">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-[var(--surface-2)]">
          <TriangleAlert className="h-7 w-7 text-[var(--accent)]" />
        </div>
        <h1 className="text-2xl font-semibold text-[var(--ink)]">Something went wrong</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          We hit an unexpected issue while loading this page. Try again.
        </p>
        {error.digest ? (
          <p className="mt-3 text-xs text-[var(--faint)]">Ref: {error.digest}</p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          className="mt-6 rounded-xl bg-[var(--action)] px-5 py-3 text-sm font-semibold text-[var(--action-contrast)]
            transition hover:bg-[var(--action-strong)]"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
