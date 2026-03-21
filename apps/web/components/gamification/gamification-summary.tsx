import Link from "next/link";
import { cn } from "@/lib/format";
import { DomMascot } from "./dom-mascot";
import { LevelBadge } from "./level-badge";
import { StreakDisplay } from "./streak-display";
import { XpBar } from "./xp-bar";

interface GamificationSummaryProps {
  totalXp: number;
  currentLevel: number;
  streakCount: number;
  role: "owner" | "manager" | "tenant";
  className?: string;
}

export function GamificationSummary({
  totalXp,
  currentLevel,
  streakCount,
  role,
  className
}: GamificationSummaryProps) {
  return (
    <div className={cn("domus-glass w-full px-4 py-3", className)}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] domus-muted">
          Progress
        </span>
        <Link href="/achievements" className="text-xs font-medium text-violet-700 hover:text-violet-800">
          View achievements
        </Link>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <DomMascot
            size="md"
            className="shrink-0"
            mood={streakCount >= 3 ? "excited" : "happy"}
            animate={streakCount >= 3}
          />
          <div className="flex flex-col gap-1">
            <LevelBadge level={currentLevel} role={role} size="sm" />
            <StreakDisplay count={streakCount} />
          </div>
        </div>
        <XpBar currentXp={totalXp} currentLevel={currentLevel} className="sm:flex-1" />
      </div>
    </div>
  );
}
