"use client";

import { useMemo } from "react";
import { useFormState } from "react-dom";
import { Bell } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/shared/submit-button";
import { EmptyState } from "@/components/dashboard/empty-state";
import type { ActionState } from "@/app/actions";
import type { NotificationDTO } from "@/lib/notifications";
import {
  formatRelativeNotificationTime,
  getNotificationActionLink,
  groupNotificationsByRecency
} from "@/lib/notification-feed";
import { formatDateTime } from "@/lib/format";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

const noopStatefulAction: StatefulAction = async () => null;

interface NotificationsSectionProps {
  notifications: NotificationDTO[];
  onMarkRead: StatefulAction;
  onMarkAllRead?: StatefulAction;
  onOpenSection?: (sectionId: string) => void;
  enhanced?: boolean;
}

interface NotificationGroup {
  label: string;
  notifications: NotificationDTO[];
}

export function NotificationsSection({
  notifications,
  onMarkRead,
  onMarkAllRead,
  onOpenSection,
  enhanced = false
}: NotificationsSectionProps) {
  const unreadCount = notifications.filter((notification) => !notification.readAt).length;
  const [markAllState, markAllAction] = useFormState(onMarkAllRead ?? noopStatefulAction, null);
  const groupedNotifications = useMemo<NotificationGroup[]>(() => {
    const groups = groupNotificationsByRecency(notifications);

    return [
      { label: "Today", notifications: groups.today },
      { label: "This Week", notifications: groups.thisWeek },
      { label: "Earlier", notifications: groups.earlier }
    ].filter((group) => group.notifications.length > 0);
  }, [notifications]);

  return (
    <Card id="notifications" className="border border-border/50 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-xl font-semibold">
          <Bell className="h-4 w-4" />
          Notifications
        </CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant={unreadCount > 0 ? "warning" : "outline"}>
            {unreadCount} unread
          </Badge>
          {onMarkAllRead ? (
            <form action={markAllAction}>
              <SubmitButton
                size="sm"
                variant="outline"
                disabled={unreadCount === 0}
                title="Mark every unread notification as read."
              >
                Mark all as read
              </SubmitButton>
            </form>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {markAllState && !markAllState.success && (
          <p className="mb-3 text-sm text-red-600">{markAllState.error}</p>
        )}
        {markAllState && markAllState.success && markAllState.message && (
          <p className="mb-3 text-sm text-emerald-600">{markAllState.message}</p>
        )}
        {notifications.length === 0 ? (
          <EmptyState icon={Bell} title="No notifications" description="You're all caught up!" />
        ) : enhanced ? (
          <div className="space-y-6">
            {groupedNotifications.map((group) => (
              <section key={group.label} className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {group.label}
                </h3>
                <div className="space-y-3">
                  {group.notifications.map((notification) => (
                    <EnhancedNotificationRow
                      key={notification.id}
                      notification={notification}
                      onMarkRead={onMarkRead}
                      onOpenSection={onOpenSection}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => (
              <LegacyNotificationRow
                key={notification.id}
                notification={notification}
                onMarkRead={onMarkRead}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EnhancedNotificationRow({
  notification,
  onMarkRead,
  onOpenSection
}: {
  notification: NotificationDTO;
  onMarkRead: StatefulAction;
  onOpenSection?: (sectionId: string) => void;
}) {
  const [state, action] = useFormState(onMarkRead, null);
  const actionLink = getNotificationActionLink(notification);
  const unread = !notification.readAt;

  return (
    <div
      className={[
        "rounded-2xl border px-4 py-4 shadow-sm transition",
        unread
          ? "border-violet-200/70 bg-violet-50/60"
          : "border-border/50 bg-background"
      ].join(" ")}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={[
                "mt-0.5 h-2.5 w-2.5 rounded-full",
                unread ? "bg-violet-500" : "bg-zinc-300"
              ].join(" ")}
              aria-hidden="true"
            />
            <p className={unread ? "text-base font-semibold text-foreground" : "text-base font-medium text-foreground"}>
              {notification.title}
            </p>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{notification.body}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>{formatRelativeNotificationTime(notification.createdAt)}</span>
            {!unread ? <span>Read</span> : <span>Unread</span>}
            {actionLink && onOpenSection ? (
              <button
                type="button"
                onClick={() => onOpenSection(actionLink.sectionId)}
                className="font-medium text-violet-700 transition hover:text-violet-900 hover:underline"
                title={`Open ${actionLink.sectionId}.`}
              >
                {actionLink.label}
              </button>
            ) : null}
          </div>
        </div>
        <div className="md:pl-4">
          {!notification.readAt ? (
            <form action={action} className="flex flex-col items-start gap-1 md:items-end">
              <input type="hidden" name="notificationId" value={notification.id} />
              <SubmitButton size="sm" variant="outline" title="Mark this notification as read.">
                Mark read
              </SubmitButton>
              {state && !state.success ? (
                <p className="text-xs text-red-500">{state.error}</p>
              ) : null}
              {state && state.success ? <p className="text-xs text-emerald-600">Marked read.</p> : null}
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function LegacyNotificationRow({
  notification,
  onMarkRead
}: {
  notification: NotificationDTO;
  onMarkRead: StatefulAction;
}) {
  const [state, action] = useFormState(onMarkRead, null);

  return (
    <div className="rounded-2xl border border-border/50 bg-background px-4 py-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-base font-medium text-zinc-900">{notification.title}</p>
          <p className="mt-0.5 text-sm text-zinc-500">{notification.body}</p>
          <p className="mt-1 text-sm text-zinc-400">{formatDateTime(notification.createdAt)}</p>
        </div>
        {!notification.readAt ? (
          <form action={action} className="flex flex-col items-start gap-1 sm:items-end">
            <input type="hidden" name="notificationId" value={notification.id} />
            <SubmitButton size="sm" variant="outline" title="Mark this notification as read.">
              Mark read
            </SubmitButton>
            {state && !state.success ? <p className="text-xs text-red-500">{state.error}</p> : null}
            {state && state.success ? <p className="text-xs text-emerald-600">Marked read.</p> : null}
          </form>
        ) : (
          <Badge variant="outline">Read</Badge>
        )}
      </div>
    </div>
  );
}
