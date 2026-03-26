"use client";

import { useMemo } from "react";
import { useFormState } from "react-dom";
import { Bell } from "lucide-react";
import { ActionableNotification } from "@/components/dashboard/actionable-notification";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/shared/submit-button";
import { EmptyState } from "@/components/dashboard/empty-state";
import type { ActionState } from "@/app/actions";
import type { NotificationDTO } from "@/lib/notifications";
import {
  groupNotificationsByRecency
} from "@/lib/notification-feed";
import type { NotificationRecipientRole } from "@/lib/notification-actions";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

const noopStatefulAction: StatefulAction = async () => null;

interface NotificationsSectionProps {
  notifications: NotificationDTO[];
  role: NotificationRecipientRole;
  onMarkRead: StatefulAction;
  onMarkAllRead?: StatefulAction;
  onSendBatchPaymentReminder?: StatefulAction;
  onWaiveCharge?: StatefulAction;
  onMarkManagerPaymentPaid?: StatefulAction;
  onOpenSection?: (sectionId: string) => void;
  enhanced?: boolean;
}

interface NotificationGroup {
  label: string;
  notifications: NotificationDTO[];
}

export function NotificationsSection({
  notifications,
  role,
  onMarkRead,
  onMarkAllRead,
  onSendBatchPaymentReminder,
  onWaiveCharge,
  onMarkManagerPaymentPaid,
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
                title="Clear every unread notification."
              >
                Clear all
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
                    <NotificationRow
                      key={notification.id}
                      notification={notification}
                      role={role}
                      onMarkRead={onMarkRead}
                      onSendBatchPaymentReminder={onSendBatchPaymentReminder}
                      onWaiveCharge={onWaiveCharge}
                      onMarkManagerPaymentPaid={onMarkManagerPaymentPaid}
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
              <NotificationRow
                key={notification.id}
                notification={notification}
                role={role}
                onMarkRead={onMarkRead}
                onSendBatchPaymentReminder={onSendBatchPaymentReminder}
                onWaiveCharge={onWaiveCharge}
                onMarkManagerPaymentPaid={onMarkManagerPaymentPaid}
                onOpenSection={onOpenSection}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NotificationRow({
  notification,
  role,
  onMarkRead,
  onSendBatchPaymentReminder,
  onWaiveCharge,
  onMarkManagerPaymentPaid,
  onOpenSection
}: {
  notification: NotificationDTO;
  role: NotificationRecipientRole;
  onMarkRead: StatefulAction;
  onSendBatchPaymentReminder?: StatefulAction;
  onWaiveCharge?: StatefulAction;
  onMarkManagerPaymentPaid?: StatefulAction;
  onOpenSection?: (sectionId: string) => void;
}) {
  return (
    <ActionableNotification
      notification={notification}
      role={role}
      onDismissNotification={onMarkRead}
      onSendBatchPaymentReminder={onSendBatchPaymentReminder}
      onWaiveCharge={onWaiveCharge}
      onMarkManagerPaymentPaid={onMarkManagerPaymentPaid}
      onOpenSection={onOpenSection}
    />
  );
}
