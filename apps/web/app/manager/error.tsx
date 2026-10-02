"use client";

import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ManagerError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="app-surface flex min-h-screen items-center justify-center px-4 py-12">
      <div className="domus-card w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-2)]">
          <TriangleAlert className="h-7 w-7 text-[var(--accent)]" />
        </div>
        <h1 className="text-2xl font-semibold text-[var(--ink)]">Manager dashboard error</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Domus couldn&apos;t finish loading the manager workspace.
        </p>
        {error.digest ? (
          <p className="mt-3 text-xs text-[var(--faint)]">Ref: {error.digest}</p>
        ) : null}
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button type="button" onClick={reset}>
            Try again
          </Button>
          <Button asChild variant="outline">
            <Link href="/manager">Back to dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
