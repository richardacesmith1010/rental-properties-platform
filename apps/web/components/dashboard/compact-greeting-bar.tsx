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
    <div className="sticky top-0 z-10 flex items-start justify-between gap-3 rounded-[16px] border border-[color:color-mix(in_srgb,var(--line)_84%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_94%,transparent)] px-3 py-3 shadow-sm backdrop-blur-sm sm:items-center sm:px-5">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
          Daily operations
        </p>
        <p className="mt-1 text-sm text-[var(--ink)] sm:truncate">
          <span className="font-semibold text-[var(--ink)]">
            {greeting ? `${greeting}, ${userName}` : userName}
          </span>
          <span className="mx-2 text-[var(--faint)]">·</span>
          <span className="text-[var(--muted)]">{statusSummary}</span>
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
          triggerClassName="inline-flex h-10 w-10 items-center justify-center rounded-full border border-transparent text-[var(--ink-2)] transition hover:border-[var(--accent-line)] hover:bg-[var(--accent-weak)] hover:text-[var(--accent)]"
          panelClassName="w-[min(24rem,calc(100vw-2rem))]"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-full border border-transparent text-[var(--ink-2)] hover:border-[var(--accent-line)] hover:bg-[var(--accent-weak)] hover:text-[var(--accent)]"
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
