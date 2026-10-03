"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { TriangleAlert } from "lucide-react";

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="app-surface flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-3xl border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_95%,transparent)] p-8 text-center shadow-xl">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-2)]">
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
          className="mt-6 rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)]"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
