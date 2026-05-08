"use client";

import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { NotificationDTO } from "@/lib/notifications";
import { NotificationBellMenu } from "@/components/dashboard/notification-bell-menu";
import type { StatefulAction } from "./types";
import { useTimeOfDayGreeting } from "./use-time-of-day-greeting";

interface CompactGreetingBarProps {
  userName: string;
  role: "owner" | "manager" | "tenant";
  statusSummary: string;
  notifications?: NotificationDTO[];
  onDismissNotification?: StatefulAction;
  onClearAllNotifications?: StatefulAction;
  onSendBatchPaymentReminder?: StatefulAction;
  onWaiveCharge?: StatefulAction;
  onMarkManagerPaymentPaid?: StatefulAction;
  onOpenSettings?: () => void;
  onOpenNotifications?: () => void;
}

export function CompactGreetingBar({
  userName,
  role,
  statusSummary,
  notifications = [],
  onDismissNotification,
  onClearAllNotifications,
  onSendBatchPaymentReminder,
  onWaiveCharge,
  onMarkManagerPaymentPaid,
  onOpenSettings,
  onOpenNotifications
}: CompactGreetingBarProps) {
  const greeting = useTimeOfDayGreeting();

  return (
    <div className="sticky top-0 z-10 flex items-start justify-between gap-3 rounded-2xl border border-border/60 bg-background/95 px-3 py-2.5 shadow-sm backdrop-blur-sm sm:items-center sm:px-5">
      <div className="min-w-0 text-xs sm:text-sm">
        <p className="text-foreground sm:truncate">
          <span className="font-semibold">
            {greeting ? `${greeting}, ${userName}` : userName}
          </span>
          <span className="mx-2 text-muted-foreground">·</span>
          <span className="text-muted-foreground">{statusSummary}</span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <NotificationBellMenu
          notifications={notifications}
          role={role}
          onDismissNotification={onDismissNotification}
          onClearAllNotifications={onClearAllNotifications}
          onSendBatchPaymentReminder={onSendBatchPaymentReminder}
          onWaiveCharge={onWaiveCharge}
          onMarkManagerPaymentPaid={onMarkManagerPaymentPaid}
          onOpenNotifications={onOpenNotifications}
          triggerClassName="inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-600 transition hover:bg-zinc-100/70 hover:text-zinc-900"
          panelClassName="w-[min(24rem,calc(100vw-2rem))]"
        />
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
