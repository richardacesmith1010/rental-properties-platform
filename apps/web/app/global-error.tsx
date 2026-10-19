"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { TriangleAlert } from "lucide-react";

export default function GlobalError({
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
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-[var(--ground)] text-[var(--ink)]">
        <div className="mx-auto max-w-md px-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl bg-[var(--surface-2)]">
            <TriangleAlert className="h-7 w-7 text-[var(--accent)]" />
          </div>
          <p className="mt-4 font-display text-6xl font-semibold text-[var(--ink)]">Oops</p>
          <h1 className="mt-4 text-2xl font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm text-[var(--faint)]">
            An unexpected error occurred. Please try again.
          </p>
          {error.digest ? (
            <p className="mt-3 text-xs text-[var(--muted)]">Ref: {error.digest}</p>
          ) : null}
          <button
            onClick={reset}
            className="mt-6 rounded-xl bg-[var(--action)] px-5 py-3 text-sm font-semibold text-[var(--action-contrast)]
              transition hover:bg-[var(--action-strong)]"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
