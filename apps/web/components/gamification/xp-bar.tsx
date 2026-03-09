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

  return (
    <div className={cn("w-full min-w-0 space-y-1.5", className)}>
      <div className="flex items-center justify-between gap-3 text-[11px] font-medium text-zinc-600">
        <span>Level {currentLevel}</span>
        <span>{progressLabel}</span>
      </div>
      <div className="h-2 rounded-full bg-violet-100">
        <div
          className="h-2 rounded-full bg-gradient-to-r from-violet-500 to-emerald-500 transition-all"
          style={{ width: `${progress}%` }}
          aria-valuemax={isMaxLevel ? currentXp : nextThreshold}
          aria-valuemin={currentFloor}
          aria-valuenow={currentXp}
          role="progressbar"
        />
      </div>
    </div>
  );
}
