"use client";

import { DomMascot } from "@/components/gamification/dom-mascot";

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="app-surface flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white/95 p-8 text-center shadow-xl shadow-violet-500/10">
        <div className="mx-auto mb-4 flex w-fit items-center justify-center rounded-3xl bg-violet-50 px-4 py-3">
          <DomMascot size="lg" />
        </div>
        <h1 className="text-2xl font-semibold text-zinc-900">Something went wrong</h1>
        <p className="mt-2 text-sm text-zinc-500">
          We hit an unexpected issue while loading this page. Try again.
        </p>
        {error.digest ? (
          <p className="mt-3 text-xs text-zinc-400">Ref: {error.digest}</p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          className="mt-6 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-500"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
