"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";
import type { ActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { cn, formatDateTime } from "@/lib/format";
import { formatRelativeNotificationTime } from "@/lib/notification-feed";
import type { NotificationDTO } from "@/lib/notifications";
import {
  getNotificationActions,
  getNotificationPresentation,
  type NotificationRecipientRole
} from "@/lib/notification-actions";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface ActionableNotificationProps {
  notification: NotificationDTO;
  role: NotificationRecipientRole;
  compact?: boolean;
  onDismissNotification?: StatefulAction;
  onSendBatchPaymentReminder?: StatefulAction;
  onWaiveCharge?: StatefulAction;
  onMarkManagerPaymentPaid?: StatefulAction;
  onOpenSection?: (sectionId: string) => void;
  onDidDismiss?: (notificationId: string) => void;
}

const severityClasses = {
  urgent: "border-l-red-500 bg-red-500/[0.04]",
  attention: "border-l-amber-500 bg-amber-500/[0.04]",
  info: "border-l-blue-500 bg-blue-500/[0.04]"
} as const;

export function ActionableNotification({
  notification,
  role,
  compact = false,
  onDismissNotification,
  onSendBatchPaymentReminder,
  onWaiveCharge,
  onMarkManagerPaymentPaid,
  onOpenSection,
  onDidDismiss
}: ActionableNotificationProps) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const presentation = getNotificationPresentation(notification);
  const actions = getNotificationActions(notification, role);

  const dismissNotification = async (notifyOnError = true) => {
    if (!onDismissNotification) {
      onDidDismiss?.(notification.id);
      return true;
    }

    if (notification.readAt) {
      onDidDismiss?.(notification.id);
      return true;
    }

    const formData = new FormData();
    formData.set("notificationId", notification.id);
    const result = await onDismissNotification(null, formData);
    if (!result?.success) {
      if (notifyOnError) {
        toast.error(result?.error ?? "Unable to dismiss this notification.");
      }
      return false;
    }

    onDidDismiss?.(notification.id);
    return true;
  };

  const handleDismiss = () => {
    setPendingAction("dismiss");
    startTransition(async () => {
      const dismissed = await dismissNotification();
      if (!dismissed) {
        setPendingAction(null);
        return;
      }

      setPendingAction(null);
      router.refresh();
    });
  };

  const handleAction = (actionIndex: number) => {
    const action = actions[actionIndex];
    if (!action) {
      return;
    }

    setPendingAction(`${action.kind}:${actionIndex}`);
    startTransition(async () => {
      const clearAfterAction = async () => {
        await dismissNotification(false);
        setPendingAction(null);
      };

      if (action.kind === "send_reminder") {
        if (!notification.entityId || !onSendBatchPaymentReminder) {
          toast.error("Reminder action is unavailable right now.");
          setPendingAction(null);
          return;
        }

        const formData = new FormData();
        formData.append("chargeIds", notification.entityId);
        const result = await onSendBatchPaymentReminder(null, formData);
        if (!result?.success) {
          toast.error(result?.error ?? "Unable to send the reminder.");
          setPendingAction(null);
          return;
        }

        toast.success(result.message ?? "Reminder sent.");
        await clearAfterAction();
        router.refresh();
        return;
      }

      if (action.kind === "waive_charge") {
        if (!notification.entityId || !onWaiveCharge) {
          toast.error("Waive action is unavailable right now.");
          setPendingAction(null);
          return;
        }

        const formData = new FormData();
        formData.set("chargeId", notification.entityId);
        formData.set("reason", "Waived from notifications.");
        const result = await onWaiveCharge(null, formData);
        if (!result?.success) {
          toast.error(result?.error ?? "Unable to waive this charge.");
          setPendingAction(null);
          return;
        }

        toast.success(result.message ?? "Charge waived.");
        await clearAfterAction();
        router.refresh();
        return;
      }

      if (action.kind === "mark_manager_payment_paid") {
        if (!notification.entityId || !onMarkManagerPaymentPaid) {
          await clearAfterAction();
          router.push(action.href);
          return;
        }

        const formData = new FormData();
        formData.set("paymentId", notification.entityId);
        formData.set("status", "paid");
        const result = await onMarkManagerPaymentPaid(null, formData);
        if (!result?.success) {
          toast.error(result?.error ?? "Unable to mark this payment paid.");
          setPendingAction(null);
          return;
        }

        toast.success(result.message ?? "Manager payment marked paid.");
        await clearAfterAction();
        router.refresh();
        return;
      }

      await clearAfterAction();
      if (action.sectionId && onOpenSection) {
        onOpenSection(action.sectionId);
      } else {
        router.push(action.href);
      }
    });
  };

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/60 border-l-4 p-4 shadow-sm",
        severityClasses[presentation.severity],
        compact ? "px-4 py-3" : "px-4 py-4"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {presentation.eyebrow}
            </span>
            {!notification.readAt ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                New
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm font-semibold text-foreground sm:text-base">
            {notification.title}
          </p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {notification.body}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {actions.map((action, index) => (
              <Button
                key={`${notification.id}:${action.label}`}
                type="button"
                size="sm"
                variant={action.variant}
                loading={isPending && pendingAction === `${action.kind}:${index}`}
                onClick={() => handleAction(index)}
                title={action.label}
              >
                {action.label}
              </Button>
            ))}
            <span
              className={cn(
                "text-xs text-muted-foreground",
                compact ? "ml-0" : "ml-auto"
              )}
              title={formatDateTime(notification.createdAt)}
            >
              {formatRelativeNotificationTime(notification.createdAt)}
            </span>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 rounded-full"
          loading={isPending && pendingAction === "dismiss"}
          onClick={handleDismiss}
          title={`Dismiss ${notification.title}`}
          aria-label={`Dismiss ${notification.title}`}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
