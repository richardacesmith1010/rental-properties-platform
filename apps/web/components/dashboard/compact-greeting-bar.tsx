"use client";

import { Bell, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CompactGreetingBarProps {
  userName: string;
  statusSummary: string;
  unreadNotificationCount?: number;
  onOpenSettings?: () => void;
  onOpenNotifications?: () => void;
}

function getTimeOfDayGreeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function CompactGreetingBar({
  userName,
  statusSummary,
  unreadNotificationCount = 0,
  onOpenSettings,
  onOpenNotifications
}: CompactGreetingBarProps) {
  return (
    <div className="sticky top-0 z-10 flex items-start justify-between gap-3 rounded-2xl border border-border/60 bg-background/95 px-3 py-2.5 shadow-sm backdrop-blur-sm sm:items-center sm:px-5">
      <div className="min-w-0 text-xs sm:text-sm">
        <p className="text-foreground sm:truncate">
          <span className="font-semibold">
            {getTimeOfDayGreeting()}, {userName}
          </span>
          <span className="mx-2 text-muted-foreground">·</span>
          <span className="text-muted-foreground">{statusSummary}</span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-full"
          onClick={onOpenNotifications}
          title="Open notifications."
          aria-label="Open notifications"
        >
          <div className="relative">
            <Bell className="h-4 w-4" />
            {unreadNotificationCount > 0 ? (
              <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-semibold text-white">
                {unreadNotificationCount}
              </span>
            ) : null}
          </div>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-full"
          onClick={onOpenSettings}
          title="Open settings."
          aria-label="Open settings"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
