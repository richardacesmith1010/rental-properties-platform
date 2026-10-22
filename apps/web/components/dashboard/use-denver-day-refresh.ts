"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { addDays, denverDayStartUtc, todayDenver } from "@/lib/denver-calendar";

// The tenant overview and charges list may both be mounted on one page.
const refreshAttempts = new Map<string, number>();

export function useDenverDayRefresh(todayIso: string) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      const actualDay = todayDenver();
      if (actualDay === todayIso) return;
      const key = `${todayIso}:${actualDay}`;
      const lastAttempt = refreshAttempts.get(key) ?? 0;
      if (Date.now() - lastAttempt < 5_000) return;
      refreshAttempts.set(key, Date.now());
      router.refresh();
    };
    const schedule = () => {
      const actualDay = todayDenver();
      const base = actualDay === todayIso ? todayIso : actualDay;
      const next = denverDayStartUtc(addDays(base, 1));
      timer = setTimeout(() => {
        check();
        schedule();
      }, Math.max(1, Date.parse(next) - Date.now()));
    };
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    check();
    schedule();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, todayIso]);
}
