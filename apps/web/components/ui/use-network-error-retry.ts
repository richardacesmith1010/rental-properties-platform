"use client";

import { startTransition, useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

const retryWindowMs = 30_000;

export function isTransientNetworkError(error: Error & { digest?: string }): boolean {
  if (error.digest) return false;
  if (error.name === "ChunkLoadError") return true;

  const message = error.message.toLowerCase();
  return message === "network error" || message === "load failed" || message === "failed to fetch"
    || (message.startsWith("loading chunk") && message.includes("failed"));
}

export function useNetworkErrorRetry(error: Error & { digest?: string }, reset: () => void): { retrying: boolean } {
  const pathname = usePathname();
  const router = useRouter();
  const startedFor = useRef<Error | null>(null);
  const retrying = useMemo(() => {
    if (!isTransientNetworkError(error)) return false;
    try {
      const previous = sessionStorage.getItem(`domus-auto-retry:${pathname}`);
      if (previous !== null) {
        const elapsed = Date.now() - Number(previous);
        if (elapsed >= 0 && elapsed < retryWindowMs) return false;
      }
    } catch {
      // Storage can be unavailable in private browsing.
    }
    return true;
  }, [error, pathname]);

  useEffect(() => {
    if (!retrying || startedFor.current === error) return;
    startedFor.current = error;
    try {
      sessionStorage.setItem(`domus-auto-retry:${pathname}`, String(Date.now()));
    } catch {
      // A storage failure must not block this retry.
    }
    startTransition(() => {
      router.refresh();
      reset();
    });
  }, [error, pathname, reset, retrying, router]);

  return { retrying };
}
