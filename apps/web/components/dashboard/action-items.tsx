"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Bell, Building2, Clock3, ShieldAlert, Wrench } from "lucide-react";
import { DomMascot } from "@/components/gamification/dom-mascot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ActionItem } from "@/lib/action-items";
import { cn } from "@/lib/format";
import type { StatefulAction } from "./types";

interface ActionItemsProps {
  items: ActionItem[];
  nextCollectionLabel: string | null;
  onOpenSection: (sectionId: string) => void;
  onSendBatchPaymentReminder?: StatefulAction;
  onWaiveCharge?: StatefulAction;
  onMarkManagerPaymentPaid?: StatefulAction;
}

const severityClasses: Record<ActionItem["severity"], string> = {
  urgent: "border-l-red-500 bg-red-500/[0.04]",
  attention: "border-l-amber-500 bg-amber-500/[0.04]",
  info: "border-l-blue-500 bg-blue-500/[0.04]"
};

const severityLabels: Record<ActionItem["severity"], string> = {
  urgent: "Urgent",
  attention: "Attention",
  info: "Info"
};

function getSectionIcon(kind: ActionItem["kind"]) {
  switch (kind) {
    case "overdue_charge":
    case "due_soon_charge":
      return Clock3;
    case "manager_payment":
      return Building2;
    case "maintenance":
      return Wrench;
    case "feedback":
      return Bell;
    default:
      return ShieldAlert;
  }
}

export function ActionItems({
  items,
  nextCollectionLabel,
  onOpenSection,
  onSendBatchPaymentReminder,
  onWaiveCharge,
  onMarkManagerPaymentPaid
}: ActionItemsProps) {
  const router = useRouter();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const attentionLabel = useMemo(() => {
    if (items.length === 0) {
      return "Everything looks good";
    }

    return `${items.length} ${items.length === 1 ? "thing needs" : "things need"} your attention`;
  }, [items.length]);

  const openLinkedSurface = (item: ActionItem) => {
    if (item.linkTo === "feedback") {
      router.push("/ops?section=feedback");
      return;
    }

    onOpenSection(item.linkTo);
  };

  const runAction = (params: {
    item: ActionItem;
    key: string;
    action: StatefulAction | undefined;
    formData: FormData;
    successMessage: string;
  }) => {
    if (!params.action) {
      openLinkedSurface(params.item);
      return;
    }

    setPendingKey(params.key);
    startTransition(async () => {
      const result = await params.action?.(null, params.formData);
      if (!result?.success) {
        toast.error(result?.error ?? "Unable to complete that action right now.");
        setPendingKey(null);
        return;
      }

      toast.success(result.message ?? params.successMessage);
      setPendingKey(null);
      router.refresh();
    });
  };

  const handleReminder = (item: ActionItem) => {
    if (!item.chargeId) {
      openLinkedSurface(item);
      return;
    }

    const formData = new FormData();
    formData.append("chargeIds", item.chargeId);
    runAction({
      item,
      key: `remind-${item.id}`,
      action: onSendBatchPaymentReminder,
      formData,
      successMessage: "Reminder sent."
    });
  };

  const handleWaive = (item: ActionItem) => {
    if (!item.chargeId) {
      openLinkedSurface(item);
      return;
    }

    const formData = new FormData();
    formData.set("chargeId", item.chargeId);
    formData.set("reason", "Waived from What needs attention.");
    runAction({
      item,
      key: `waive-${item.id}`,
      action: onWaiveCharge,
      formData,
      successMessage: "Charge waived."
    });
  };

  const handleMarkManagerPaymentPaid = (item: ActionItem) => {
    if (!item.managerPaymentId) {
      openLinkedSurface(item);
      return;
    }

    const formData = new FormData();
    formData.set("paymentId", item.managerPaymentId);
    formData.set("status", "paid");
    runAction({
      item,
      key: `pay-${item.id}`,
      action: onMarkManagerPaymentPaid,
      formData,
      successMessage: "Manager payment marked paid."
    });
  };

  if (items.length === 0) {
    return (
      <section className="domus-card flex min-h-[420px] flex-col items-center justify-center gap-5 px-6 py-10 text-center">
        <Badge variant="success" className="px-3 py-1 text-sm">
          Everything looks good
        </Badge>
        <div className="space-y-2">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground">No action items right now.</h2>
          <p className="mx-auto max-w-xl text-base leading-7 text-muted-foreground">
            {nextCollectionLabel ?? "Your portfolio is caught up. The next important change will appear here automatically."}
          </p>
        </div>
        <DomMascot size="lg" mood="celebrating" animate />
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="space-y-2 px-0.5 sm:px-1">
        <Badge variant="outline" className="px-3 py-1 text-sm">
          What needs attention
        </Badge>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{attentionLabel}</h2>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Start with the top card. Domus sorted everything by urgency so you can clear the queue without hunting through sections.
        </p>
      </div>

      <div className="space-y-3">
        {items.map((item) => {
          const Icon = getSectionIcon(item.kind);
          const remindKey = `remind-${item.id}`;
          const waiveKey = `waive-${item.id}`;
          const payKey = `pay-${item.id}`;

          return (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => openLinkedSurface(item)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openLinkedSurface(item);
                }
              }}
              className={cn(
                "domus-card cursor-pointer border-l-4 px-4 py-4 transition hover:-translate-y-0.5 hover:shadow-md sm:px-5",
                severityClasses[item.severity]
              )}
              title={`Open ${item.linkTo.replace(/-/g, " ")}.`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={item.severity === "urgent" ? "destructive" : item.severity === "attention" ? "warning" : "outline"}>
                      {severityLabels[item.severity]}
                    </Badge>
                    <span className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <Icon className="h-4 w-4" />
                      Needs attention
                    </span>
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-foreground">{item.title}</h3>
                    <p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center" onClick={(event) => event.stopPropagation()}>
                  {(item.kind === "overdue_charge" || item.kind === "due_soon_charge") && item.chargeId ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        className="w-full sm:w-auto"
                        loading={isPending && pendingKey === remindKey}
                        onClick={() => handleReminder(item)}
                        title="Send a rent reminder right now."
                      >
                        Send Reminder
                      </Button>
                      {item.kind === "overdue_charge" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="w-full sm:w-auto"
                          loading={isPending && pendingKey === waiveKey}
                          onClick={() => handleWaive(item)}
                          title="Waive this overdue charge."
                        >
                          Waive
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="w-full sm:w-auto"
                          onClick={() => openLinkedSurface(item)}
                          title="Open the charge details."
                        >
                          View
                        </Button>
                      )}
                    </>
                  ) : null}

                  {item.kind === "manager_payment" ? (
                    <>
                        <Button
                          type="button"
                          size="sm"
                          className="w-full sm:w-auto"
                          loading={isPending && pendingKey === payKey}
                          onClick={() => handleMarkManagerPaymentPaid(item)}
                        title="Mark this manager payment as paid."
                      >
                        Pay Now
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => openLinkedSurface(item)}
                        title="Open the manager payments section."
                      >
                        View
                      </Button>
                    </>
                  ) : null}

                  {!["overdue_charge", "due_soon_charge", "manager_payment"].includes(item.kind) ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full sm:w-auto"
                      onClick={() => openLinkedSurface(item)}
                      title={`Open ${item.linkTo.replace(/-/g, " ")}.`}
                    >
                      View
                      <ArrowRight className="ml-1 h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
