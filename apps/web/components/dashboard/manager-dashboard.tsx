"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, Receipt, Wrench } from "lucide-react";
import { toast } from "sonner";
import type { ActionState } from "@/app/actions";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardCharge } from "@/lib/dashboard";
import { formatCurrency, formatDate } from "@/lib/format";
import type { MaintenanceTicket } from "@/lib/maintenance";
import type { NotificationDTO } from "@/lib/notifications";

type StatefulAction = (
  prev: ActionState,
  formData: FormData
) => Promise<ActionState>;

interface ManagerDashboardProps {
  tickets: MaintenanceTicket[];
  charges: DashboardCharge[];
  notifications: NotificationDTO[];
  onOpenSection: (sectionId: string) => void;
  onUpdateTicketStatus?: StatefulAction;
}

interface ManagerTask {
  id: string;
  kind: "ticket" | "charge" | "message";
  title: string;
  description: string;
  primaryLabel: string;
  secondaryLabel?: string;
  onPrimary: () => void;
  onSecondary?: () => void;
}

export function ManagerDashboard({
  tickets,
  charges,
  notifications,
  onOpenSection,
  onUpdateTicketStatus
}: ManagerDashboardProps) {
  const router = useRouter();
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const maintenanceTasks = tickets
    .filter((ticket) => ticket.status === "open" || ticket.status === "in_progress")
    .sort((left, right) => {
      const priorityRank = (value: string) => {
        switch (value) {
          case "urgent":
            return 3;
          case "high":
            return 2;
          case "medium":
            return 1;
          default:
            return 0;
        }
      };
      return priorityRank(right.priority) - priorityRank(left.priority);
    })
    .slice(0, 3);

  const overdueCharges = charges.filter((charge) => charge.status === "late").slice(0, 2);
  const unreadMessages = notifications.filter((notification) => !notification.readAt).slice(0, 2);

  const tasks: ManagerTask[] = [
    ...maintenanceTasks.map((ticket) => ({
      id: `ticket:${ticket.id}`,
      kind: "ticket" as const,
      title: ticket.status === "open" ? "New maintenance ticket" : "Maintenance follow-up",
      description: `${ticket.title} · ${ticket.propertyName}${ticket.unitNumber ? ` · Unit ${ticket.unitNumber}` : ""}`,
      primaryLabel: ticket.status === "open" ? "Mark In Progress" : "Open Ticket",
      secondaryLabel: "Respond",
      onPrimary: () => {
        if (ticket.status !== "open" || !onUpdateTicketStatus) {
          onOpenSection("maintenance");
          return;
        }

        setPendingTaskId(`ticket:${ticket.id}`);
        startTransition(async () => {
          const formData = new FormData();
          formData.set("ticketId", ticket.id);
          formData.set("status", "in_progress");
          const result = await onUpdateTicketStatus(null, formData);
          if (!result?.success) {
            toast.error(result?.error ?? "Unable to update this ticket.");
            setPendingTaskId(null);
            return;
          }

          toast.success(result.message ?? "Ticket marked in progress.");
          setPendingTaskId(null);
          router.refresh();
        });
      },
      onSecondary: () => onOpenSection("maintenance")
    })),
    ...overdueCharges.map((charge) => ({
      id: `charge:${charge.id}`,
      kind: "charge" as const,
      title: "Late rent needs follow-up",
      description: `${charge.tenantName} · ${charge.propertyName} · ${formatCurrency(charge.amountCents)} due ${formatDate(charge.dueDate)}`,
      primaryLabel: "View Charge",
      onPrimary: () => onOpenSection("charges")
    })),
    ...unreadMessages.map((notification) => ({
      id: `message:${notification.id}`,
      kind: "message" as const,
      title: notification.title,
      description: notification.body,
      primaryLabel: "Open Messages",
      onPrimary: () => onOpenSection(notification.entityType === "inbox_thread" ? "inbox" : "notifications")
    }))
  ];

  return (
    <Card className="border border-border/50 shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl font-semibold">Your Tasks</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {tasks.length === 0 ? (
          <EmptyState
            icon={Wrench}
            title="No other tasks right now"
            description="Maintenance updates, rent follow-ups, and new messages will show up here automatically."
          />
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => {
              const icon = task.kind === "ticket" ? Wrench : task.kind === "charge" ? Receipt : Bell;
              const Icon = icon;
              return (
                <div
                  key={task.id}
                  className="rounded-2xl border border-border/60 bg-card/90 px-4 py-4 shadow-sm"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <p className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        {task.title}
                      </p>
                      <p className="text-sm leading-6 text-muted-foreground">{task.description}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        loading={isPending && pendingTaskId === task.id}
                        onClick={task.onPrimary}
                        title={task.primaryLabel}
                      >
                        {task.primaryLabel}
                      </Button>
                      {task.onSecondary && task.secondaryLabel ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={task.onSecondary}
                          title={task.secondaryLabel}
                        >
                          {task.secondaryLabel}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
