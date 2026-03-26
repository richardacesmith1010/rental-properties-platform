"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ActionableNotification } from "@/components/dashboard/actionable-notification";
import { cn } from "@/lib/format";
import type { NotificationDTO } from "@/lib/notifications";
import type { NotificationRecipientRole } from "@/lib/notification-actions";
import type { StatefulAction } from "./types";

interface NotificationBellMenuProps {
  notifications: NotificationDTO[];
  role: NotificationRecipientRole;
  onDismissNotification?: StatefulAction;
  onClearAllNotifications?: StatefulAction;
  onSendBatchPaymentReminder?: StatefulAction;
  onWaiveCharge?: StatefulAction;
  onMarkManagerPaymentPaid?: StatefulAction;
  onOpenNotifications?: () => void;
  notificationsHref?: string | null;
  triggerClassName?: string;
  iconClassName?: string;
  badgeClassName?: string;
  panelClassName?: string;
  align?: "start" | "end";
}

export function NotificationBellMenu({
  notifications,
  role,
  onDismissNotification,
  onClearAllNotifications,
  onSendBatchPaymentReminder,
  onWaiveCharge,
  onMarkManagerPaymentPaid,
  onOpenNotifications,
  notificationsHref = null,
  triggerClassName,
  iconClassName,
  badgeClassName,
  panelClassName,
  align = "end"
}: NotificationBellMenuProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set());
  const [clearAllActive, setClearAllActive] = useState(false);
  const [isClearing, startClearing] = useTransition();

  const visibleNotifications = useMemo(() => {
    if (clearAllActive) {
      return [];
    }

    return notifications.filter((notification) => !dismissedIds.has(notification.id));
  }, [clearAllActive, dismissedIds, notifications]);

  const unreadCount = visibleNotifications.filter((notification) => !notification.readAt).length;

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const handleOpenNotifications = () => {
    setOpen(false);
    if (onOpenNotifications) {
      onOpenNotifications();
      return;
    }
    if (notificationsHref) {
      router.push(notificationsHref);
    }
  };

  const handleDismissNotification = (notificationId: string) => {
    setDismissedIds((current) => {
      const next = new Set(current);
      next.add(notificationId);
      return next;
    });
  };

  const handleClearAll = () => {
    if (!onClearAllNotifications || unreadCount === 0) {
      return;
    }

    startClearing(async () => {
      const result = await onClearAllNotifications(null, new FormData());
      if (!result?.success) {
        toast.error(result?.error ?? "Unable to clear notifications right now.");
        return;
      }

      setClearAllActive(true);
      router.refresh();
    });
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn(triggerClassName)}
        title="Open notifications."
        aria-label="Open notifications"
        aria-expanded={open}
      >
        <div className="relative">
          <Bell className={cn("h-4 w-4", iconClassName)} />
          {unreadCount > 0 ? (
            <span
              className={cn(
                "absolute -right-1.5 -top-1.5 inline-flex min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-semibold text-white",
                badgeClassName
              )}
            >
              {unreadCount}
            </span>
          ) : null}
        </div>
      </button>

      {open ? (
        <div
          className={cn(
            "absolute top-full z-50 mt-2 w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-border/70 bg-background shadow-xl",
            align === "end" ? "right-0" : "left-0",
            panelClassName
          )}
        >
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Notifications</p>
              <p className="text-xs text-muted-foreground">
                {unreadCount} unread
              </p>
            </div>
            {unreadCount > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2.5 text-xs"
                disabled={isClearing}
                onClick={handleClearAll}
                title="Clear every unread notification."
              >
                {isClearing ? "Clearing..." : "Clear all"}
              </Button>
            ) : null}
          </div>

          {visibleNotifications.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium text-foreground">You&apos;re all caught up.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                New notifications will appear here.
              </p>
            </div>
          ) : (
            <div className="max-h-[24rem] overflow-y-auto">
              <div className="space-y-3 p-3">
                {visibleNotifications.slice(0, 8).map((notification) => (
                  <ActionableNotification
                    key={notification.id}
                    notification={notification}
                    role={role}
                    compact
                    onDismissNotification={onDismissNotification}
                    onSendBatchPaymentReminder={onSendBatchPaymentReminder}
                    onWaiveCharge={onWaiveCharge}
                    onMarkManagerPaymentPaid={onMarkManagerPaymentPaid}
                    onDidDismiss={handleDismissNotification}
                  />
                ))}
              </div>
            </div>
          )}

          {(onOpenNotifications || notificationsHref) && visibleNotifications.length > 0 ? (
            <div className="border-t border-border/60 px-4 py-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={handleOpenNotifications}
                title="Open the full notifications section."
              >
                View all notifications
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
