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
    <div className={cn("w-full rounded-2xl border border-violet-100/80 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-sm", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <DomMascot size="sm" className="shrink-0" />
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
