import { cn } from "@/lib/format";

interface StreakDisplayProps {
  count: number;
  className?: string;
}

export function StreakDisplay({ count, className }: StreakDisplayProps) {
  if (count === 0) {
    return (
      <div className={cn("inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-500", className)}>
        No active streak
      </div>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700",
        count >= 3 ? "animate-pulse shadow-[0_0_18px_rgba(245,158,11,0.22)]" : "",
        className
      )}
    >
      <span aria-hidden="true">🔥</span>
      <span>{count}</span>
    </div>
  );
}
