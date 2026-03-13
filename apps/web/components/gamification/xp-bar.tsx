import { cn } from "@/lib/format";

interface XpBarProps {
  currentXp: number;
  currentLevel: number;
  className?: string;
}

const LEVEL_THRESHOLDS = [0, 500, 2000, 5000] as const;

export function XpBar({ currentXp, currentLevel, className }: XpBarProps) {
  const currentFloor = LEVEL_THRESHOLDS[currentLevel - 1] ?? 0;
  const nextThreshold = LEVEL_THRESHOLDS[currentLevel] ?? LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
  const isMaxLevel = currentLevel >= 4 || nextThreshold <= currentFloor;
  const progress = isMaxLevel
    ? 100
    : Math.max(0, Math.min(100, ((currentXp - currentFloor) / (nextThreshold - currentFloor)) * 100));
  const progressLabel = isMaxLevel
    ? `${currentXp.toLocaleString()} XP`
    : `${currentXp.toLocaleString()} / ${nextThreshold.toLocaleString()} XP`;
  const xpToNextLevel = isMaxLevel ? 0 : Math.max(nextThreshold - currentXp, 0);
  const nearLevelUp = !isMaxLevel && progress >= 90;

  return (
    <div className={cn("w-full min-w-0 space-y-2", className)}>
      <div className="flex items-center justify-between gap-3 text-[11px] font-medium text-zinc-600">
        <span>Level {currentLevel}</span>
        <span>{progressLabel}</span>
      </div>
      <div className="relative h-2 rounded-full bg-violet-100">
        {[25, 50, 75].map((marker) => (
          <span
            key={marker}
            className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-white/70"
            style={{ left: `${marker}%` }}
            aria-hidden="true"
          />
        ))}
        <div
          className={cn(
            "h-2 rounded-full bg-gradient-to-r from-violet-500 to-emerald-500 transition-all duration-700 ease-out",
            nearLevelUp ? "shadow-[0_0_16px_rgba(124,58,237,0.35)] animate-pulse" : ""
          )}
          style={{ width: `${progress}%` }}
          aria-valuemax={isMaxLevel ? currentXp : nextThreshold}
          aria-valuemin={currentFloor}
          aria-valuenow={currentXp}
          role="progressbar"
        />
      </div>
      {!isMaxLevel ? (
        <p className="text-[11px] text-zinc-500">{xpToNextLevel.toLocaleString()} XP to next level</p>
      ) : (
        <p className="text-[11px] text-zinc-500">Max level reached</p>
      )}
    </div>
  );
}
