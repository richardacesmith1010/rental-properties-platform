"use client";

import { useEffect, useMemo, useState } from "react";
import { CelebrationToast } from "./celebration";

interface AchievementCheckerProps {
  currentLevel: number;
}

interface GamificationCheckResponse {
  currentLevel: number;
  newAchievements: string[];
}

interface ToastItem {
  id: string;
  message: string;
}

const LEVEL_STORAGE_KEY = "domus-gamification:last-level";
const CHECK_STORAGE_KEY = "domus-gamification:last-check";

export function AchievementChecker({ currentLevel }: AchievementCheckerProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const shouldCheck = useMemo(() => typeof window !== "undefined", []);

  useEffect(() => {
    if (!shouldCheck) {
      return;
    }

    let cancelled = false;

    async function runCheck() {
      try {
        const response = await fetch("/api/gamification/check", {
          method: "POST",
          cache: "no-store"
        });

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as GamificationCheckResponse;
        if (cancelled) {
          return;
        }

        const previousLevelRaw = window.localStorage.getItem(LEVEL_STORAGE_KEY);
        const previousLevel = previousLevelRaw ? Number(previousLevelRaw) : currentLevel;
        const nextToasts: ToastItem[] = [];

        if (previousLevelRaw && data.currentLevel > previousLevel) {
          nextToasts.push({
            id: `level-${data.currentLevel}`,
            message: `Level up! You reached level ${data.currentLevel}.`
          });
        }

        for (const title of data.newAchievements) {
          nextToasts.push({
            id: `achievement-${title}`,
            message: `Achievement unlocked: ${title}`
          });
        }

        if (nextToasts.length > 0) {
          setToasts((current) => [...current, ...nextToasts]);
        }

        window.localStorage.setItem(LEVEL_STORAGE_KEY, String(data.currentLevel));
        window.localStorage.setItem(CHECK_STORAGE_KEY, new Date().toISOString());
      } catch {
        // Celebration checks should never disrupt the page.
      }
    }

    void runCheck();

    return () => {
      cancelled = true;
    };
  }, [currentLevel, shouldCheck]);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-3">
      {toasts.map((toast) => (
        <CelebrationToast
          key={toast.id}
          message={toast.message}
          onDone={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
        />
      ))}
    </div>
  );
}
