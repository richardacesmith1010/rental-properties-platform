"use client";

import Link from "next/link";
import { useFormState } from "react-dom";
import { AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";
import type { ActionState } from "@/app/actions";
import { DomMascot } from "@/components/gamification/dom-mascot";
import { SubmitButton } from "@/components/shared/submit-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getChargeUrgency } from "@/lib/rent-urgency";
import type { TenantCharge } from "@/lib/tenant-payments";
import { cn, formatCurrency, formatDate } from "@/lib/format";

type StatefulAction = (
  prev: ActionState,
  formData: FormData
) => Promise<ActionState>;

interface PayRentCardProps {
  charges: TenantCharge[];
  onPayCharge: (formData: FormData) => Promise<void>;
  onRequestManualPaymentConfirmation: StatefulAction;
  chargesHref: string;
}

const noopStatefulAction: StatefulAction = async () => ({
  success: false,
  error: "Manual payment confirmation is unavailable right now."
});

function getRelativeDueText(dueDate: string) {
  const today = new Date();
  const currentDay = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const due = new Date(`${dueDate}T00:00:00.000Z`);
  const dueDay = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  const diffDays = Math.ceil((dueDay - currentDay) / 86400000);

  if (diffDays < 0) {
    return `${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? "" : "s"} ago`;
  }
  if (diffDays === 0) {
    return "today";
  }
  return `in ${diffDays} day${diffDays === 1 ? "" : "s"}`;
}

export function PayRentCard({
  charges,
  onPayCharge,
  onRequestManualPaymentConfirmation,
  chargesHref
}: PayRentCardProps) {
  const [manualState, manualAction] = useFormState(
    onRequestManualPaymentConfirmation ?? noopStatefulAction,
    null
  );
  const orderedCharges = sortTenantChargesByUrgency(charges);
  const charge = orderedCharges[0];

  if (!charge) {
    return (
      <Card className="overflow-hidden border border-emerald-200/80 bg-emerald-50/70 shadow-lg">
        <CardContent className="flex min-h-[220px] flex-col items-center justify-center gap-4 p-5 text-center sm:min-h-[260px] sm:gap-5 sm:p-8">
          <div className="rounded-full bg-white/90 p-4 shadow-sm ring-1 ring-emerald-200/80">
            <DomMascot size="lg" mood="celebrating" animate />
          </div>
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/80 bg-white/90 px-3 py-1 text-sm font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              You&apos;re all set
            </div>
            <h2 className="text-2xl font-bold text-foreground sm:text-3xl">No payments due right now</h2>
            <p className="max-w-xl text-sm text-muted-foreground">
              Your balance is clear. When a new rent charge posts, it will show up here first.
            </p>
          </div>
          <Link
            href={chargesHref}
            className="text-sm font-medium text-violet-700 underline-offset-4 hover:underline"
            title="Open your charges and payment history."
          >
            View payment history
          </Link>
        </CardContent>
      </Card>
    );
  }

  const urgency = getChargeUrgency(charge);
  const additionalCharges = charges.filter((item) => item.id !== charge.id);
  const isLate = charge.status === "late" || urgency.level === "overdue";
  const Icon = isLate ? AlertTriangle : Clock3;
  const badgeLabel =
    urgency.level === "overdue"
      ? "Overdue"
      : urgency.level === "due_today"
        ? "Due today"
        : `Due ${formatDate(charge.dueDate)}`;

  return (
    <Card
      className={cn(
        "overflow-hidden shadow-xl",
        isLate
          ? "border border-red-200/80 bg-red-50/40"
          : "border border-violet-200/80 bg-violet-50/40"
      )}
    >
      <CardContent className="min-h-[240px] p-0 sm:min-h-[280px]">
        <div
          className={cn(
            "h-full border-l-[8px] px-4 py-5 sm:border-l-[10px] sm:px-8 sm:py-8",
            isLate ? "border-l-red-500" : "border-l-violet-600"
          )}
        >
          <div className="flex h-full flex-col justify-between gap-6">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Your Rent
                  </p>
                  <h2 className="text-[2rem] font-bold tracking-tight text-foreground sm:text-4xl">
                    {formatCurrency(charge.amountCents)}
                  </h2>
                </div>
                <Badge
                  variant={isLate ? "destructive" : "outline"}
                  className={cn(
                    "rounded-full px-3 py-1 text-sm",
                    !isLate && "border-violet-200 bg-white/80 text-violet-700"
                  )}
                >
                  <Icon className="mr-1.5 h-4 w-4" />
                  {badgeLabel}
                </Badge>
              </div>

              <div className="space-y-2 text-center sm:text-left">
                <p className="text-base font-medium text-foreground sm:text-lg">
                  {isLate
                    ? `Your rent of ${formatCurrency(charge.amountCents)} was due ${getRelativeDueText(charge.dueDate)}. Please pay as soon as possible to avoid late fees.`
                    : `Due ${formatDate(charge.dueDate)} (${getRelativeDueText(charge.dueDate)})`}
                </p>
                <p className="text-sm text-muted-foreground sm:text-base">
                  <span className="block sm:inline">{charge.propertyName}</span>
                  <span className="hidden sm:inline"> · </span>
                  <span className="block sm:inline">Unit {charge.unitNumber}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Paid by credit card or bank transfer. You&apos;ll get a receipt by email.
                </p>
              </div>

              {additionalCharges.length > 0 ? (
                <p className="text-sm text-muted-foreground">
                  {additionalCharges.length} more open charge{additionalCharges.length === 1 ? "" : "s"} waiting in
                  your ledger.
                </p>
              ) : null}
            </div>

            <div className="space-y-3">
              <form action={onPayCharge}>
                <input type="hidden" name="chargeId" value={charge.id} />
                <SubmitButton
                  className="h-14 w-full rounded-2xl text-base font-bold"
                  title={`Pay rent of ${formatCurrency(charge.amountCents)}.`}
                >
                  Pay Rent — {formatCurrency(charge.amountCents)}
                </SubmitButton>
              </form>

              <form action={manualAction} className="text-center sm:text-left">
                <input type="hidden" name="chargeId" value={charge.id} />
                <SubmitButton
                  variant="link"
                  className="h-auto px-0 py-0 text-sm font-medium text-muted-foreground"
                  title="Let your landlord know you already paid by cash, check, or another manual method."
                >
                  Already paid? Mark as paid manually
                </SubmitButton>
                {manualState && !manualState.success ? (
                  <p className="mt-2 text-sm text-red-600">{manualState.error}</p>
                ) : null}
                {manualState && manualState.success ? (
                  <p className="mt-2 text-sm text-emerald-700">
                    {manualState.message ?? "Manual payment request sent for owner confirmation."}
                  </p>
                ) : null}
              </form>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function sortTenantChargesByUrgency(charges: TenantCharge[]) {
  return [...charges].sort((left, right) => {
    const leftUrgency = getChargeUrgency(left);
    const rightUrgency = getChargeUrgency(right);

    const priority = (level: ReturnType<typeof getChargeUrgency>["level"]) => {
      switch (level) {
        case "overdue":
          return 3;
        case "due_today":
          return 2;
        case "upcoming":
          return 1;
        default:
          return 0;
      }
    };

    const priorityDiff = priority(rightUrgency.level) - priority(leftUrgency.level);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    return left.dueDate.localeCompare(right.dueDate);
  });
}
