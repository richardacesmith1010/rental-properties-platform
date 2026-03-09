"use client";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="mx-auto max-w-md px-6 text-center">
          <p className="text-6xl font-bold text-violet-400">Oops</p>
          <h1 className="mt-4 text-2xl font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm text-slate-400">
            An unexpected error occurred. Please try again.
          </p>
          {error.digest ? (
            <p className="mt-3 text-xs text-slate-500">Ref: {error.digest}</p>
          ) : null}
          <button
            onClick={reset}
            className="mt-6 rounded-xl bg-violet-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-400"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
