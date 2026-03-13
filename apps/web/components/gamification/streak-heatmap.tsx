"use client";

import type { XpEventDTO } from "@/lib/gamification";

interface StreakHeatmapProps {
  events: XpEventDTO[];
}

type HeatmapCell = {
  key: string;
  date: string;
  title: string;
  tone: "none" | "success" | "warning" | "achievement";
};

function buildCells(events: XpEventDTO[]): HeatmapCell[][] {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 364);

  const eventsByDay = new Map<string, XpEventDTO[]>();
  for (const event of events) {
    const key = event.createdAt.slice(0, 10);
    const current = eventsByDay.get(key) ?? [];
    current.push(event);
    eventsByDay.set(key, current);
  }

  const days: HeatmapCell[] = [];
  for (let offset = 0; offset < 365; offset += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + offset);
    const key = date.toISOString().slice(0, 10);
    const dayEvents = eventsByDay.get(key) ?? [];
    const hasAchievement = dayEvents.some((event) => event.eventType.startsWith("achievement_"));
    const hasLate = dayEvents.some((event) => event.eventType === "rent_paid_late");
    const hasOnTime = dayEvents.some((event) => event.eventType === "rent_paid_on_time");

    const tone: HeatmapCell["tone"] = hasAchievement
      ? "achievement"
      : hasLate
        ? "warning"
        : hasOnTime
          ? "success"
          : "none";

    days.push({
      key,
      date: key,
      tone,
      title:
        dayEvents.length > 0
          ? `${key}: ${dayEvents.map((event) => event.description || event.eventType).join(", ")}`
          : `${key}: No XP activity`
    });
  }

  const weeks: HeatmapCell[][] = [];
  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7));
  }
  return weeks;
}

export function StreakHeatmap({ events }: StreakHeatmapProps) {
  const weeks = buildCells(events);

  return (
    <div className="overflow-x-auto">
      <div className="inline-flex gap-1">
        {weeks.map((week, weekIndex) => (
          <div key={`week-${weekIndex}`} className="grid grid-rows-7 gap-1">
            {week.map((cell) => (
              <div
                key={cell.key}
                className={[
                  "h-3 w-3 rounded-[4px] border",
                  cell.tone === "achievement"
                    ? "border-violet-300 bg-violet-500/80"
                    : cell.tone === "warning"
                      ? "border-amber-300 bg-amber-400/80"
                      : cell.tone === "success"
                        ? "border-emerald-300 bg-emerald-400/80"
                        : "border-zinc-200 bg-zinc-100"
                ].join(" ")}
                title={cell.title}
                aria-label={cell.title}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-500">
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-400/80" /> On-time payment</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-amber-400/80" /> Late payment</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-violet-500/80" /> Achievement</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-zinc-100" /> No activity</span>
      </div>
    </div>
  );
}
