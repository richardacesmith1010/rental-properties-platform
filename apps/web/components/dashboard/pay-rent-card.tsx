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
import { calculateCardFee, formatCentsAsDollars } from "@/lib/payment-fees";

type StatefulAction = (
  prev: ActionState,
  formData: FormData
) => Promise<ActionState>;

export interface AutopayEnrollmentView {
  id: string;
  leaseId: string;
  propertyLabel: string;
  last4: string;
  brand: string | null;
  paymentMethodType: string;
  enabled: boolean;
  retryCount: number;
}

interface PayRentCardProps {
  charges: TenantCharge[];
  onPayCharge: (formData: FormData) => Promise<void>;
  onPayWithACH?: (formData: FormData) => Promise<void>;
  onRequestManualPaymentConfirmation: StatefulAction;
  chargesHref: string;
  hasActiveLease?: boolean;
  autopayEnrollments?: AutopayEnrollmentView[];
  onSetupAutopay?: StatefulAction;
}

const noopStatefulAction: StatefulAction = async () => ({
  success: false,
  error: "Manual payment confirmation is unavailable right now."
});

const unavailableAutopayAction: StatefulAction = async () => ({
  success: false,
  error: "Autopay is unavailable right now."
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

function formatAutopayCardLabel(enrollment: AutopayEnrollmentView) {
  const brand = enrollment.brand ? enrollment.brand.charAt(0).toUpperCase() + enrollment.brand.slice(1) : "Card";
  return `${brand} ending in ${enrollment.last4}`;
}

export function PayRentCard({
  charges,
  onPayCharge,
  onPayWithACH,
  onRequestManualPaymentConfirmation,
  chargesHref,
  hasActiveLease = true,
  autopayEnrollments = [],
  onSetupAutopay
}: PayRentCardProps) {
  const [manualState, manualAction] = useFormState(
    onRequestManualPaymentConfirmation ?? noopStatefulAction,
    null
  );
  const [autopayState, autopayAction] = useFormState(
    onSetupAutopay ?? unavailableAutopayAction,
    null
  );
  const orderedCharges = sortTenantChargesByUrgency(charges);
  const charge = orderedCharges[0];

  if (!charge) {
    return (
      <Card className="overflow-hidden border border-[var(--pos)] bg-[var(--pos-bg)] shadow-[var(--domus-shadow-md)]">
        <CardContent className="flex min-h-[220px] flex-col items-center justify-center gap-4 p-5 text-center sm:min-h-[260px] sm:gap-5 sm:p-8">
          <div className="rounded-full bg-[var(--surface)] p-4 shadow-[var(--domus-shadow-sm)] ring-1 ring-[var(--pos)]">
            <DomMascot size="lg" mood="celebrating" animate />
          </div>
          <div className="space-y-2">
            {hasActiveLease ? (
              <>
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--pos)] bg-[var(--pos-bg)] px-3 py-1 text-sm font-medium text-[var(--pos)]">
                  <CheckCircle2 className="h-4 w-4" />
                  You&apos;re all set
                </div>
                <h2 className="text-2xl font-bold text-foreground sm:text-3xl">No payments due right now</h2>
                <p className="max-w-xl text-sm text-muted-foreground">
                  Your balance is clear. When a new rent charge posts, it will show up here first.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-bold text-foreground sm:text-3xl">
                  Your landlord hasn&apos;t set up your lease yet
                </h2>
                <p className="max-w-xl text-sm text-muted-foreground">
                  Once it&apos;s ready, your rent will show up here.
                </p>
              </>
            )}
          </div>
          <Link
            href={chargesHref}
            className="text-sm font-medium text-[var(--accent)] underline-offset-4 hover:underline"
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
  const cardPayment = calculateCardFee(charge.amountCents);
  const enrollment = autopayEnrollments.find((item) => item.leaseId === charge.leaseId) ?? null;
  const autopayEnabled = enrollment?.enabled === true;
  const autopayPaused = enrollment?.enabled === false;

  return (
    <Card
      className={cn(
        "overflow-hidden shadow-xl",
        isLate
          ? "border border-[var(--crit)] bg-[var(--crit-bg)]"
          : "border border-[var(--accent-line)] bg-[var(--accent-weak)]"
      )}
    >
      <CardContent className="min-h-[240px] p-0 sm:min-h-[280px]">
        <div
          className={cn(
            "h-full border-l-[8px] px-4 py-5 sm:border-l-[10px] sm:px-8 sm:py-8",
            isLate ? "border-l-[var(--crit)]" : "border-l-[var(--accent)]"
          )}
        >
          <div className="flex h-full flex-col justify-between gap-6">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Your Rent
                  </p>
                  <h2 className="tabular-nums text-[34px] font-bold leading-none tracking-[-0.03em] text-[var(--ink)] sm:text-[38px]">
                    {formatCurrency(charge.amountCents)}
                  </h2>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "rounded-full px-3 py-1 text-sm",
                    isLate
                      ? "border-[var(--crit)] bg-[var(--crit-bg)] text-[var(--crit)]"
                      : "border-[var(--accent-line)] bg-[var(--surface)] text-[var(--accent)]"
                  )}
                >
                  <Icon className="mr-1.5 h-4 w-4" />
                  {badgeLabel}
                </Badge>
              </div>

              <div className="space-y-2 text-center sm:text-left">
                <p className="text-base font-medium tabular-nums text-[var(--ink)] sm:text-lg">
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
                  You&apos;ll get a receipt by email after you pay.
                </p>
              </div>

              {additionalCharges.length > 0 ? (
                <p className="text-sm text-muted-foreground">
                  {additionalCharges.length} more open charge{additionalCharges.length === 1 ? "" : "s"} waiting in
                  your payment history.
                </p>
              ) : null}
            </div>

            <div className="space-y-3">
              <div className="space-y-3" role="radiogroup" aria-label="Payment method">
                <div className="relative rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--domus-shadow-sm)] has-[:checked]:border-[var(--accent)] has-[:checked]:bg-[var(--accent-weak)]">
                  <input
                    type="radio"
                    id={`bank-${charge.id}`}
                    name="paymentMethod"
                    value="bank"
                    className="absolute left-4 top-[18px] h-5 w-5 accent-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-line)] focus-visible:ring-offset-2"
                    defaultChecked
                  />
                  <label htmlFor={`bank-${charge.id}`} className="flex cursor-pointer items-start gap-3 pl-8">
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-[var(--ink)]">Bank account</span>
                        <Badge variant="success">Recommended · Free</Badge>
                      </span>
                      <span className="mt-1 block text-sm text-[var(--muted)]">No processing fee. Pay {formatCentsAsDollars(charge.amountCents)} total.</span>
                    </span>
                  </label>
                  {onPayWithACH ? (
                    <form action={onPayWithACH} className="mt-3">
                      <input type="hidden" name="chargeId" value={charge.id} />
                      <SubmitButton
                        className="h-12 w-full rounded-2xl text-sm font-semibold"
                        title={`Pay ${formatCentsAsDollars(charge.amountCents)} from your bank account.`}
                      >
                        Pay {formatCentsAsDollars(charge.amountCents)}
                      </SubmitButton>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="mt-3 flex h-12 w-full items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] px-4 text-sm font-semibold text-[var(--muted)]"
                      disabled
                      title="Bank account payments are unavailable right now."
                    >
                      Pay {formatCentsAsDollars(charge.amountCents)}
                    </button>
                  )}
                </div>

                <div className="relative rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 has-[:checked]:border-[var(--accent)] has-[:checked]:bg-[var(--accent-weak)]">
                  <input
                    type="radio"
                    id={`card-${charge.id}`}
                    name="paymentMethod"
                    value="card"
                    className="absolute left-4 top-[18px] h-5 w-5 accent-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-line)] focus-visible:ring-offset-2"
                  />
                  <label htmlFor={`card-${charge.id}`} className="flex cursor-pointer items-start gap-3 pl-8">
                    <span className="min-w-0 flex-1">
                      <span className="text-sm font-semibold text-[var(--ink)]">Debit or credit card</span>
                      <span className="mt-1 block text-sm tabular-nums text-[var(--muted)]">
                        Card fee: {formatCentsAsDollars(cardPayment.feeCents)}. Total today: {formatCentsAsDollars(cardPayment.totalCents)}.
                      </span>
                    </span>
                  </label>
                  <form action={onPayCharge} className="mt-3">
                    <input type="hidden" name="chargeId" value={charge.id} />
                    <SubmitButton
                      variant="outline"
                      className="h-12 w-full rounded-2xl text-sm font-semibold"
                      title={`Pay ${formatCentsAsDollars(cardPayment.totalCents)} with debit or credit card.`}
                    >
                      Pay {formatCentsAsDollars(cardPayment.totalCents)}
                    </SubmitButton>
                  </form>
                </div>
              </div>

              {autopayEnabled && enrollment ? (
                <div className="rounded-2xl border border-[var(--pos)] bg-[var(--pos-bg)] p-4 text-left">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="success">
                      Autopay is on
                    </Badge>
                    <span className="text-sm font-medium text-[var(--pos)]">
                      {formatAutopayCardLabel(enrollment)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-[var(--pos)]">
                    Your card will be charged automatically each month.
                  </p>
                </div>
              ) : onSetupAutopay ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    <span className="h-px flex-1 bg-border" />
                    <span>or</span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                  <div className="rounded-2xl border border-border bg-[var(--surface)] p-4 text-left shadow-[var(--domus-shadow-sm)]">
                    <p className="text-sm font-semibold text-foreground">
                      {autopayPaused
                        ? "Autopay paused — update your card to turn it back on"
                        : "Set up autopay so rent is paid automatically."}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Your card will be charged automatically each month.
                    </p>
                    <form action={autopayAction} className="mt-3">
                      <input type="hidden" name="leaseId" value={charge.leaseId} />
                      <SubmitButton
                        variant="outline"
                        className="h-12 w-full rounded-2xl text-sm font-semibold"
                        title={autopayPaused ? "Update your card and turn autopay back on." : "Set up autopay for this lease."}
                      >
                        {autopayPaused ? "Update Card" : "Enable Autopay"}
                      </SubmitButton>
                    </form>
                    {autopayState && !autopayState.success && "error" in autopayState ? (
                      <p className="mt-2 text-sm text-[var(--crit)]">{autopayState.error}</p>
                    ) : null}
                  </div>
                </div>
              ) : null}

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
                  <p className="mt-2 text-sm text-[var(--crit)]">{manualState.error}</p>
                ) : null}
                {manualState && manualState.success ? (
                  <p className="mt-2 text-sm text-[var(--pos)]">
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
