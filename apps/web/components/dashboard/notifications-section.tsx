"use client";

import { useFormState } from "react-dom";
import { Bell } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/shared/submit-button";
import { EmptyState } from "@/components/dashboard/empty-state";
import { DataRow } from "@/components/shared/data-row";
import type { ActionState } from "@/app/actions";
import type { NotificationDTO } from "@/lib/notifications";
import { formatDateTime } from "@/lib/format";
import { AnimatedList } from "@/components/ui/animated-list";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

const noopStatefulAction: StatefulAction = async () => null;

interface NotificationsSectionProps {
  notifications: NotificationDTO[];
  onMarkRead: StatefulAction;
  onMarkAllRead?: StatefulAction;
}

export function NotificationsSection({
  notifications,
  onMarkRead,
  onMarkAllRead
}: NotificationsSectionProps) {
  const unreadCount = notifications.filter((notification) => !notification.readAt).length;
  const [markAllState, markAllAction] = useFormState(onMarkAllRead ?? noopStatefulAction, null);

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
          <EmptyState
            icon={Bell}
            title="No notifications"
            description="You're all caught up!"
          />
        ) : (
          <AnimatedList>
            {notifications.map((notification, i) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                onMarkRead={onMarkRead}
                last={i === notifications.length - 1}
              />
            ))}
          </AnimatedList>
        )}
      </CardContent>
    </Card>
  );
}

function NotificationRow({
  notification,
  onMarkRead,
  last
}: {
  notification: NotificationDTO;
  onMarkRead: StatefulAction;
  last: boolean;
}) {
  const [state, action] = useFormState(onMarkRead, null);

  return (
    <DataRow last={last}>
      <div className="min-w-0 flex-1">
        <p className="text-base font-medium text-zinc-900">{notification.title}</p>
        <p className="mt-0.5 text-sm text-zinc-500">{notification.body}</p>
        <p className="mt-1 text-sm text-zinc-400">
          {formatDateTime(notification.createdAt)}
        </p>
      </div>
      {!notification.readAt ? (
        <form action={action}>
          <input type="hidden" name="notificationId" value={notification.id} />
          <SubmitButton size="sm" variant="outline" title="Mark this notification as read.">
            Mark read
          </SubmitButton>
          {state && !state.success && <p className="mt-1 text-xs text-red-500">{state.error}</p>}
          {state && state.success && <p className="mt-1 text-xs text-emerald-600">Marked read.</p>}
        </form>
      ) : (
        <Badge variant="outline">Read</Badge>
      )}
    </DataRow>
  );
}
